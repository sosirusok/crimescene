-- NICE Payments server-approval flow (production migration history aligned).
-- The store remains in ONSITE mode until merchant credentials and legal settings are ready.

alter table public.payments
  add column if not exists provider_order_id text,
  add column if not exists action_token_hash text,
  add column if not exists idempotency_key_hash text,
  add column if not exists expires_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists receipt_url text,
  add column if not exists customer_return_url text;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('READY','VERIFYING','PAID','FAILED','REFUNDED'));

alter table public.reservations drop constraint if exists reservations_payment_status_check;
alter table public.reservations
  add constraint reservations_payment_status_check
  check (payment_status in ('READY','VERIFYING','PAID','FAILED','REFUNDED'));

create unique index if not exists payments_reservation_unique
  on public.payments(reservation_id);
create unique index if not exists payments_provider_order_unique
  on public.payments(provider_order_id)
  where provider_order_id is not null;
create unique index if not exists payments_idempotency_unique
  on public.payments(idempotency_key_hash)
  where idempotency_key_hash is not null;
create index if not exists payments_expiring_holds_idx
  on public.payments(expires_at)
  where provider = 'NICEPAY' and status = 'READY';

alter table public.payments alter column provider set default 'NICEPAY';
alter table public.store_settings alter column payment_provider set default 'NICEPAY';

update public.payments
set provider = 'ONSITE', updated_at = now()
where provider = 'KISPG';

update public.store_settings
set payment_provider = 'NICEPAY', updated_at = now()
where id = 1 and payment_provider <> 'NICEPAY';

create or replace function public.reserve_crimescene_slot(
  p_reservation_id uuid,
  p_lookup_code text,
  p_theme_id text,
  p_play_date date,
  p_start_time time without time zone,
  p_customer_name text,
  p_phone_hash text,
  p_phone_masked text,
  p_phone_encrypted text,
  p_party_size integer,
  p_open_room boolean,
  p_special_request text,
  p_total_amount integer
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_theme public.themes;
  v_slot public.availability;
  v_reservation public.reservations;
  v_booking_mode text;
  v_new_count integer;
  v_time_text text := to_char(p_start_time, 'HH24:MI');
  v_payment_mode text := 'ONSITE';
  v_payment_provider text := 'ONSITE';
begin
  select * into v_theme from public.themes
  where id = upper(trim(p_theme_id)) and status = 'ACTIVE';
  if not found then raise exception using message = 'theme_not_found', errcode = 'P0001'; end if;
  if not (v_theme.times ? v_time_text) then raise exception using message = 'invalid_theme_time', errcode = 'P0001'; end if;
  if p_party_size < 1 or p_party_size > v_theme.total_capacity then raise exception using message = 'invalid_party_size', errcode = 'P0001'; end if;
  if p_total_amount <> v_theme.price * p_party_size then raise exception using message = 'invalid_total_amount', errcode = 'P0001'; end if;

  select payment_mode into v_payment_mode from public.store_settings where id = 1;
  v_payment_mode := coalesce(v_payment_mode, 'ONSITE');
  v_payment_provider := case when v_payment_mode = 'ONLINE' then 'NICEPAY' else 'ONSITE' end;

  insert into public.availability(theme_id, play_date, start_time, capacity, booked_count, open_room, status)
  values(v_theme.id, p_play_date, p_start_time, v_theme.total_capacity, 0, false, 'OPEN')
  on conflict(theme_id, play_date, start_time) do update
    set capacity = excluded.capacity, updated_at = now()
    where public.availability.booked_count = 0;

  select * into v_slot from public.availability
  where theme_id = v_theme.id and play_date = p_play_date and start_time = p_start_time
  for update;
  if not found or v_slot.status = 'BLOCKED' then raise exception using message = 'slot_unavailable', errcode = 'P0001'; end if;

  if v_slot.booked_count = 0 then
    if p_party_size < v_theme.min_players and not p_open_room then raise exception using message = 'open_room_required', errcode = 'P0001'; end if;
    v_booking_mode := case when p_open_room then 'OPEN_HOST' else 'PRIVATE' end;
  else
    if not v_slot.open_room or not p_open_room then raise exception using message = 'slot_unavailable', errcode = 'P0001'; end if;
    v_booking_mode := 'OPEN_JOIN';
  end if;
  if v_booking_mode <> 'PRIVATE' and length(trim(coalesce(p_special_request, ''))) < 2 then
    raise exception using message = 'open_room_message_required', errcode = 'P0001';
  end if;

  v_new_count := v_slot.booked_count + p_party_size;
  if v_new_count > v_theme.total_capacity then raise exception using message = 'slot_capacity_insufficient', errcode = 'P0001'; end if;
  update public.availability
  set booked_count = v_new_count,
      capacity = v_theme.total_capacity,
      open_room = (v_booking_mode <> 'PRIVATE'),
      status = case when v_booking_mode = 'PRIVATE' or v_new_count >= v_theme.total_capacity then 'SOLD_OUT' else 'OPEN' end,
      updated_at = now()
  where id = v_slot.id;

  insert into public.reservations(
    id, lookup_code, theme_id, play_date, start_time, customer_name, phone_hash,
    phone_masked, phone_encrypted, party_size, open_room, booking_mode,
    special_request, total_amount, status, payment_status, source
  ) values(
    p_reservation_id, upper(trim(p_lookup_code)), v_theme.id, p_play_date, p_start_time,
    trim(p_customer_name), p_phone_hash, p_phone_masked, p_phone_encrypted,
    p_party_size, v_booking_mode <> 'PRIVATE', v_booking_mode,
    left(coalesce(p_special_request, ''), 300), p_total_amount,
    case when v_payment_mode = 'ONLINE' then 'PENDING_PAYMENT' else 'CONFIRMED' end,
    'READY', 'ONLINE'
  ) returning * into v_reservation;

  insert into public.payments(reservation_id, amount, provider, status)
  values(p_reservation_id, p_total_amount, v_payment_provider, 'READY');

  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values('customer', 'RESERVATION_CREATED', 'reservation', p_reservation_id::text,
    jsonb_build_object('themeId', v_theme.id, 'date', p_play_date, 'time', v_time_text,
      'partySize', p_party_size, 'bookingMode', v_booking_mode, 'slotCountAfter', v_new_count,
      'slotCapacity', v_theme.total_capacity, 'paymentMode', v_payment_mode));
  return v_reservation;
end;
$$;

create or replace function public.prepare_nicepay_reservation(
  p_reservation_id uuid,
  p_lookup_code text,
  p_theme_id text,
  p_play_date date,
  p_start_time time without time zone,
  p_customer_name text,
  p_phone_hash text,
  p_phone_masked text,
  p_phone_encrypted text,
  p_party_size integer,
  p_open_room boolean,
  p_special_request text,
  p_total_amount integer,
  p_provider_order_id text,
  p_action_token_hash text,
  p_idempotency_key_hash text,
  p_customer_return_url text
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_provider text;
  v_reservation public.reservations;
begin
  select payment_mode, payment_provider into v_mode, v_provider
  from public.store_settings where id = 1;
  if v_mode <> 'ONLINE' or coalesce(v_provider, '') <> 'NICEPAY' then
    raise exception using message = 'nicepay_not_enabled', errcode = 'P0001';
  end if;
  if trim(coalesce(p_provider_order_id, '')) = '' or trim(coalesce(p_action_token_hash, '')) = '' or trim(coalesce(p_idempotency_key_hash, '')) = '' then
    raise exception using message = 'invalid_payment_identity', errcode = 'P0001';
  end if;

  v_reservation := public.reserve_crimescene_slot(
    p_reservation_id, p_lookup_code, p_theme_id, p_play_date, p_start_time,
    p_customer_name, p_phone_hash, p_phone_masked, p_phone_encrypted,
    p_party_size, p_open_room, p_special_request, p_total_amount
  );
  update public.payments
  set provider = 'NICEPAY',
      provider_order_id = trim(p_provider_order_id),
      action_token_hash = p_action_token_hash,
      idempotency_key_hash = p_idempotency_key_hash,
      expires_at = now() + interval '15 minutes',
      customer_return_url = left(trim(p_customer_return_url), 1000),
      updated_at = now()
  where reservation_id = p_reservation_id;
  return v_reservation;
end;
$$;

create or replace function public.expire_nicepay_payment_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_reservation public.reservations;
  v_count integer := 0;
begin
  for v_payment in
    select * from public.payments
    where provider = 'NICEPAY' and status = 'READY' and expires_at <= now()
    order by expires_at
    for update skip locked
  loop
    select * into v_reservation from public.reservations where id = v_payment.reservation_id for update;
    update public.payments
    set status = 'FAILED', failed_at = now(), failure_code = 'HOLD_EXPIRED',
        failure_message = '결제 가능 시간이 만료되었습니다.', updated_at = now()
    where id = v_payment.id and status = 'READY';
    if found then
      update public.reservations
      set status = 'CANCELED', payment_status = 'FAILED', canceled_at = coalesce(canceled_at, now()),
          cancellation_reason = '결제 시간 만료', updated_at = now()
      where id = v_reservation.id and status = 'PENDING_PAYMENT';
      perform public.refresh_crimescene_slot(v_reservation.theme_id, v_reservation.play_date, v_reservation.start_time);
      insert into public.audit_logs(actor, action, target_type, target_id, metadata)
      values('system', 'NICEPAY_HOLD_EXPIRED', 'reservation', v_reservation.id::text,
        jsonb_build_object('orderId', v_payment.provider_order_id));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.begin_nicepay_approval(
  p_provider_order_id text,
  p_provider_transaction_id text,
  p_amount integer
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_reservation public.reservations;
begin
  select * into v_payment from public.payments
  where provider = 'NICEPAY' and provider_order_id = trim(p_provider_order_id)
  for update;
  if not found then raise exception using message = 'payment_not_found', errcode = 'P0001'; end if;
  if v_payment.amount <> p_amount then raise exception using message = 'payment_amount_mismatch', errcode = 'P0001'; end if;
  if v_payment.status = 'PAID' and v_payment.provider_transaction_id = trim(p_provider_transaction_id) then return v_payment; end if;
  if v_payment.status = 'VERIFYING' and v_payment.provider_transaction_id = trim(p_provider_transaction_id) then return v_payment; end if;
  if v_payment.status <> 'READY' then raise exception using message = 'payment_not_approvable', errcode = 'P0001'; end if;

  if v_payment.expires_at is not null and v_payment.expires_at <= now() then
    select * into v_reservation from public.reservations where id = v_payment.reservation_id for update;
    update public.payments
    set status = 'FAILED', failed_at = now(), failure_code = 'HOLD_EXPIRED',
        failure_message = '결제 가능 시간이 만료되었습니다.', updated_at = now()
    where id = v_payment.id returning * into v_payment;
    update public.reservations
    set status = 'CANCELED', payment_status = 'FAILED', canceled_at = coalesce(canceled_at, now()),
        cancellation_reason = '결제 시간 만료', updated_at = now()
    where id = v_reservation.id and status = 'PENDING_PAYMENT';
    perform public.refresh_crimescene_slot(v_reservation.theme_id, v_reservation.play_date, v_reservation.start_time);
    return v_payment;
  end if;

  update public.payments
  set status = 'VERIFYING', provider_transaction_id = trim(p_provider_transaction_id), updated_at = now()
  where id = v_payment.id returning * into v_payment;
  update public.reservations set payment_status = 'VERIFYING', updated_at = now()
  where id = v_payment.reservation_id and status = 'PENDING_PAYMENT';
  return v_payment;
end;
$$;

create or replace function public.finalize_nicepay_payment(
  p_provider_order_id text,
  p_provider_transaction_id text,
  p_amount integer,
  p_result_code text,
  p_receipt_url text,
  p_raw_payload jsonb
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments
  where provider = 'NICEPAY' and provider_order_id = trim(p_provider_order_id)
  for update;
  if not found then raise exception using message = 'payment_not_found', errcode = 'P0001'; end if;
  if v_payment.amount <> p_amount then raise exception using message = 'payment_amount_mismatch', errcode = 'P0001'; end if;
  if v_payment.status = 'PAID' and v_payment.provider_transaction_id = trim(p_provider_transaction_id) then return v_payment; end if;
  if v_payment.status not in ('READY', 'VERIFYING') then raise exception using message = 'payment_not_approvable', errcode = 'P0001'; end if;
  if v_payment.provider_transaction_id is not null and v_payment.provider_transaction_id <> trim(p_provider_transaction_id) then
    raise exception using message = 'payment_transaction_mismatch', errcode = 'P0001';
  end if;

  update public.payments
  set status = 'PAID', provider_transaction_id = trim(p_provider_transaction_id),
      approved_at = coalesce(approved_at, now()), raw_result_code = left(p_result_code, 100),
      raw_payload = coalesce(p_raw_payload, '{}'::jsonb), receipt_url = nullif(left(trim(coalesce(p_receipt_url, '')), 1000), ''),
      expires_at = null, failed_at = null, failure_code = null, failure_message = null, updated_at = now()
  where id = v_payment.id returning * into v_payment;
  update public.reservations
  set status = 'CONFIRMED', payment_status = 'PAID', updated_at = now()
  where id = v_payment.reservation_id and status = 'PENDING_PAYMENT';
  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values('nicepay', 'NICEPAY_PAYMENT_PAID', 'reservation', v_payment.reservation_id::text,
    jsonb_build_object('orderId', v_payment.provider_order_id, 'tid', v_payment.provider_transaction_id, 'amount', v_payment.amount));
  return v_payment;
end;
$$;

create or replace function public.fail_nicepay_payment(
  p_provider_order_id text,
  p_failure_code text,
  p_failure_message text,
  p_raw_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_reservation public.reservations;
begin
  select * into v_payment from public.payments
  where provider = 'NICEPAY' and provider_order_id = trim(p_provider_order_id)
  for update;
  if not found then return false; end if;
  if v_payment.status not in ('READY', 'VERIFYING') then return false; end if;
  select * into v_reservation from public.reservations where id = v_payment.reservation_id for update;
  update public.payments
  set status = 'FAILED', failed_at = now(), failure_code = left(coalesce(p_failure_code, 'PAYMENT_FAILED'), 100),
      failure_message = left(coalesce(p_failure_message, '결제를 완료하지 못했습니다.'), 500),
      raw_payload = coalesce(p_raw_payload, '{}'::jsonb), expires_at = null, updated_at = now()
  where id = v_payment.id;
  update public.reservations
  set status = 'CANCELED', payment_status = 'FAILED', canceled_at = coalesce(canceled_at, now()),
      cancellation_reason = '온라인 결제 미완료', updated_at = now()
  where id = v_reservation.id and status = 'PENDING_PAYMENT';
  perform public.refresh_crimescene_slot(v_reservation.theme_id, v_reservation.play_date, v_reservation.start_time);
  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values('nicepay', 'NICEPAY_PAYMENT_FAILED', 'reservation', v_reservation.id::text,
    jsonb_build_object('orderId', v_payment.provider_order_id, 'code', left(coalesce(p_failure_code, ''), 100)));
  return true;
end;
$$;

create or replace function public.reconcile_nicepay_cancellation(
  p_provider_order_id text,
  p_provider_transaction_id text,
  p_result_code text,
  p_raw_payload jsonb default '{}'::jsonb
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_reservation public.reservations;
  v_next_payment_status text;
begin
  select * into v_payment from public.payments
  where provider = 'NICEPAY' and provider_order_id = trim(p_provider_order_id)
  for update;
  if not found then raise exception using message = 'payment_not_found', errcode = 'P0001'; end if;
  if v_payment.provider_transaction_id is not null and v_payment.provider_transaction_id <> trim(p_provider_transaction_id) then
    raise exception using message = 'payment_transaction_mismatch', errcode = 'P0001';
  end if;
  if v_payment.status = 'REFUNDED' then return v_payment; end if;
  select * into v_reservation from public.reservations where id = v_payment.reservation_id for update;
  v_next_payment_status := case when v_payment.status = 'PAID' then 'REFUNDED' else 'FAILED' end;
  update public.payments
  set status = v_next_payment_status, provider_transaction_id = trim(p_provider_transaction_id),
      failed_at = case when v_next_payment_status = 'FAILED' then now() else failed_at end,
      failure_code = left(coalesce(p_result_code, 'CANCELED'), 100),
      failure_message = '나이스페이먼츠에서 결제가 취소되었습니다.',
      raw_payload = coalesce(p_raw_payload, '{}'::jsonb), expires_at = null, updated_at = now()
  where id = v_payment.id returning * into v_payment;
  update public.reservations
  set status = 'CANCELED', payment_status = v_next_payment_status,
      canceled_at = coalesce(canceled_at, now()), cancellation_reason = '결제 취소 완료', updated_at = now()
  where id = v_reservation.id and status not in ('CANCELED', 'NO_SHOW');
  perform public.refresh_crimescene_slot(v_reservation.theme_id, v_reservation.play_date, v_reservation.start_time);
  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values('nicepay', 'NICEPAY_PAYMENT_CANCELED', 'reservation', v_reservation.id::text,
    jsonb_build_object('orderId', v_payment.provider_order_id, 'tid', v_payment.provider_transaction_id));
  return v_payment;
end;
$$;

create or replace function public.enqueue_owner_reservation_created()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'CONFIRMED' then return new; end if;
  insert into public.owner_notifications(
    reservation_id, event_type, title, theme_id, theme_title, play_date, start_time,
    customer_name, phone_masked, phone_encrypted, party_size, booking_mode, source,
    total_amount, special_request, reservation_status, created_at
  )
  select new.id, 'NEW_RESERVATION', '새 예약', new.theme_id, t.short_title,
    new.play_date, new.start_time, new.customer_name, new.phone_masked, new.phone_encrypted,
    new.party_size, new.booking_mode, coalesce(new.source, 'ONLINE'), new.total_amount,
    coalesce(new.special_request, ''), new.status, new.created_at
  from public.themes t where t.id = new.theme_id
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.enqueue_owner_reservation_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_event text;
  v_title text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if old.status = 'PENDING_PAYMENT' and new.status = 'CONFIRMED' and new.payment_status = 'PAID' then
    v_event := 'NEW_RESERVATION'; v_title := '새 예약';
  elsif new.status = 'CANCEL_REQUESTED' then
    v_event := 'CANCEL_REQUESTED'; v_title := '예약 취소 요청';
  elsif new.status = 'CANCELED' and old.status <> 'PENDING_PAYMENT' then
    v_event := 'CANCELED'; v_title := '예약 취소';
  else
    return new;
  end if;
  insert into public.owner_notifications(
    reservation_id, event_type, title, theme_id, theme_title, play_date, start_time,
    customer_name, phone_masked, phone_encrypted, party_size, booking_mode, source,
    total_amount, special_request, reservation_status, created_at
  )
  select new.id, v_event, v_title, new.theme_id, t.short_title,
    new.play_date, new.start_time, new.customer_name, new.phone_masked, new.phone_encrypted,
    new.party_size, new.booking_mode, coalesce(new.source, 'ONLINE'), new.total_amount,
    coalesce(new.special_request, ''), new.status, now()
  from public.themes t where t.id = new.theme_id;
  return new;
end;
$$;

create or replace function public.admin_create_crimescene_reservation(
  p_actor text,
  p_reservation_id uuid,
  p_lookup_code text,
  p_theme_id text,
  p_play_date date,
  p_start_time time without time zone,
  p_customer_name text,
  p_phone_hash text,
  p_phone_masked text,
  p_phone_encrypted text,
  p_party_size integer,
  p_open_room boolean,
  p_special_request text,
  p_total_amount integer,
  p_source text,
  p_admin_note text
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare v_res public.reservations;
begin
  v_res := public.reserve_crimescene_slot(
    p_reservation_id, p_lookup_code, p_theme_id, p_play_date, p_start_time,
    p_customer_name, p_phone_hash, p_phone_masked, p_phone_encrypted,
    p_party_size, p_open_room,
    case when p_open_room and length(trim(coalesce(p_special_request, ''))) < 2 then '매장 접수 오픈룸' else p_special_request end,
    p_total_amount
  );
  update public.reservations
  set source = case when p_source in ('ADMIN','PHONE','WALK_IN') then p_source else 'ADMIN' end,
      admin_note = left(trim(coalesce(p_admin_note, '')), 1000),
      status = 'CONFIRMED', payment_status = 'READY', updated_at = now()
  where id = p_reservation_id returning * into v_res;
  update public.payments
  set provider = 'ONSITE', amount = v_res.total_amount, expires_at = null, updated_at = now()
  where reservation_id = p_reservation_id;
  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values(p_actor, 'ADMIN_RESERVATION_CREATED', 'reservation', p_reservation_id::text,
    jsonb_build_object('source', v_res.source, 'themeId', v_res.theme_id, 'date', v_res.play_date,
      'time', to_char(v_res.start_time, 'HH24:MI'), 'partySize', v_res.party_size));
  return v_res;
end;
$$;

create or replace function public.admin_update_reservation(
  p_actor text,
  p_reservation_id uuid,
  p_status text,
  p_payment_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.reservations;
  v_slot public.availability;
  v_provider text;
  v_was_holding boolean;
  v_will_hold boolean;
  v_new_count integer;
begin
  if p_status not in ('PENDING_PAYMENT','CONFIRMED','COMPLETED','CANCEL_REQUESTED','CANCELED','NO_SHOW')
     or p_payment_status not in ('READY','VERIFYING','PAID','FAILED','REFUNDED') then
    raise exception using message = 'invalid_status', errcode = 'P0001';
  end if;
  select * into v_before from public.reservations where id = p_reservation_id for update;
  if not found then raise exception using message = 'reservation_not_found', errcode = 'P0001'; end if;
  select provider into v_provider from public.payments where reservation_id = p_reservation_id for update;
  if v_provider = 'NICEPAY' and p_payment_status <> v_before.payment_status then
    raise exception using message = 'provider_managed_payment', errcode = 'P0001';
  end if;
  if v_provider = 'NICEPAY' and v_before.status = 'PENDING_PAYMENT' and p_status <> 'PENDING_PAYMENT' then
    raise exception using message = 'provider_managed_payment', errcode = 'P0001';
  end if;
  if v_provider = 'NICEPAY' and v_before.payment_status = 'PAID' and p_status = 'CANCELED' then
    raise exception using message = 'provider_refund_required', errcode = 'P0001';
  end if;

  v_was_holding := v_before.status not in ('CANCELED','NO_SHOW');
  v_will_hold := p_status not in ('CANCELED','NO_SHOW');
  if v_was_holding and not v_will_hold then
    update public.availability
    set booked_count = greatest(0, booked_count - v_before.party_size),
        open_room = case when greatest(0, booked_count - v_before.party_size) = 0 then false else open_room end,
        status = case when status = 'BLOCKED' then 'BLOCKED' else 'OPEN' end,
        updated_at = now()
    where theme_id = v_before.theme_id and play_date = v_before.play_date and start_time = v_before.start_time;
  elsif not v_was_holding and v_will_hold then
    select * into v_slot from public.availability
    where theme_id = v_before.theme_id and play_date = v_before.play_date and start_time = v_before.start_time
    for update;
    if not found or v_slot.status = 'BLOCKED' then raise exception using message = 'slot_capacity_insufficient', errcode = 'P0001'; end if;
    if v_before.booking_mode = 'PRIVATE' and v_slot.booked_count > 0 then raise exception using message = 'slot_capacity_insufficient', errcode = 'P0001'; end if;
    if v_before.booking_mode <> 'PRIVATE' and v_slot.booked_count > 0 and not v_slot.open_room then raise exception using message = 'slot_capacity_insufficient', errcode = 'P0001'; end if;
    v_new_count := v_slot.booked_count + v_before.party_size;
    if v_new_count > v_slot.capacity then raise exception using message = 'slot_capacity_insufficient', errcode = 'P0001'; end if;
    update public.availability
    set booked_count = v_new_count, open_room = (v_before.booking_mode <> 'PRIVATE'),
        status = case when v_before.booking_mode = 'PRIVATE' or v_new_count >= capacity then 'SOLD_OUT' else 'OPEN' end,
        updated_at = now()
    where id = v_slot.id;
  end if;

  update public.reservations
  set status = p_status, payment_status = p_payment_status, updated_at = now()
  where id = p_reservation_id;
  update public.payments set status = p_payment_status, updated_at = now()
  where reservation_id = p_reservation_id;
  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values(p_actor, 'ADMIN_RESERVATION_UPDATED', 'reservation', p_reservation_id::text,
    jsonb_build_object('before', jsonb_build_object('status', v_before.status, 'paymentStatus', v_before.payment_status),
      'after', jsonb_build_object('status', p_status, 'paymentStatus', p_payment_status)));
  return true;
end;
$$;

create or replace function public.admin_update_store_settings(
  p_actor text,
  p_store_name text,
  p_branch_name text,
  p_representative_name text,
  p_business_registration_number text,
  p_mail_order_registration_number text,
  p_phone text,
  p_email text,
  p_address_road text,
  p_address_detail text,
  p_map_query text,
  p_booking_window_days integer,
  p_arrival_minutes integer,
  p_cancellation_cutoff_hours integer,
  p_payment_mode text,
  p_payment_provider text,
  p_privacy_officer_name text,
  p_privacy_officer_contact text,
  p_refund_policy_confirmed boolean,
  p_customer_notice text
)
returns public.store_settings
language plpgsql
security definer
set search_path = public
as $$
declare v_settings public.store_settings;
begin
  if trim(coalesce(p_store_name, '')) = '' or trim(coalesce(p_branch_name, '')) = '' then raise exception using message = 'invalid_store_name', errcode = 'P0001'; end if;
  if trim(coalesce(p_phone, '')) = '' or trim(coalesce(p_email, '')) = '' or trim(coalesce(p_address_road, '')) = '' then raise exception using message = 'invalid_store_contact', errcode = 'P0001'; end if;
  if p_booking_window_days not between 1 and 60 or p_arrival_minutes not between 0 and 60 or p_cancellation_cutoff_hours not between 0 and 336 then raise exception using message = 'invalid_store_policy', errcode = 'P0001'; end if;
  if p_payment_mode not in ('ONSITE','ONLINE') then raise exception using message = 'invalid_payment_mode', errcode = 'P0001'; end if;
  insert into public.store_settings(id) values(1) on conflict(id) do nothing;
  update public.store_settings
  set store_name = trim(p_store_name), branch_name = trim(p_branch_name),
      representative_name = trim(p_representative_name), business_registration_number = trim(p_business_registration_number),
      mail_order_registration_number = trim(coalesce(p_mail_order_registration_number, '')),
      phone = trim(p_phone), email = trim(p_email), address_road = trim(p_address_road),
      address_detail = trim(coalesce(p_address_detail, '')),
      map_query = trim(coalesce(nullif(p_map_query, ''), p_address_road)),
      booking_window_days = p_booking_window_days, arrival_minutes = p_arrival_minutes,
      cancellation_cutoff_hours = p_cancellation_cutoff_hours, payment_mode = p_payment_mode,
      payment_provider = 'NICEPAY',
      privacy_officer_name = trim(coalesce(nullif(p_privacy_officer_name, ''), '개인정보 보호 담당자')),
      privacy_officer_contact = trim(coalesce(nullif(p_privacy_officer_contact, ''), p_email || ' / ' || p_phone)),
      refund_policy_confirmed = p_refund_policy_confirmed,
      customer_notice = left(trim(coalesce(p_customer_notice, '')), 1000), updated_at = now()
  where id = 1 returning * into v_settings;
  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values(p_actor, 'ADMIN_STORE_SETTINGS_UPDATED', 'store_settings', '1',
    jsonb_build_object('paymentMode', v_settings.payment_mode, 'paymentProvider', 'NICEPAY', 'bookingWindowDays', v_settings.booking_window_days));
  return v_settings;
end;
$$;

revoke all on function public.prepare_nicepay_reservation(uuid,text,text,date,time without time zone,text,text,text,text,integer,boolean,text,integer,text,text,text,text) from public, anon, authenticated;
revoke all on function public.expire_nicepay_payment_holds() from public, anon, authenticated;
revoke all on function public.begin_nicepay_approval(text,text,integer) from public, anon, authenticated;
revoke all on function public.finalize_nicepay_payment(text,text,integer,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.fail_nicepay_payment(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.reconcile_nicepay_cancellation(text,text,text,jsonb) from public, anon, authenticated;

grant execute on function public.prepare_nicepay_reservation(uuid,text,text,date,time without time zone,text,text,text,text,integer,boolean,text,integer,text,text,text,text) to service_role;
grant execute on function public.expire_nicepay_payment_holds() to service_role;
grant execute on function public.begin_nicepay_approval(text,text,integer) to service_role;
grant execute on function public.finalize_nicepay_payment(text,text,integer,text,text,jsonb) to service_role;
grant execute on function public.fail_nicepay_payment(text,text,text,jsonb) to service_role;
grant execute on function public.reconcile_nicepay_cancellation(text,text,text,jsonb) to service_role;
