-- Keep a NICEPAY authorization single-flight and reservation/payment state atomic.

alter table public.payments
  add column if not exists approval_lease_until timestamptz;

create index if not exists payments_verifying_lease_idx
  on public.payments(approval_lease_until)
  where provider = 'NICEPAY' and status = 'VERIFYING';

create or replace function public.guard_nicepay_reservation_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
  v_payment_status text;
begin
  select provider, status into v_provider, v_payment_status
  from public.payments
  where reservation_id = new.id;

  if coalesce(v_provider, '') <> 'NICEPAY' then
    return new;
  end if;

  if v_payment_status in ('READY', 'VERIFYING') then
    if new.status <> 'PENDING_PAYMENT' or new.payment_status <> v_payment_status then
      raise exception using message = 'nicepay_pending_cancel_requires_abort', errcode = 'P0001';
    end if;
  elsif v_payment_status = 'PAID' then
    if new.payment_status <> 'PAID'
       or new.status not in ('CONFIRMED', 'COMPLETED', 'CANCEL_REQUESTED', 'NO_SHOW') then
      raise exception using message = 'provider_refund_required', errcode = 'P0001';
    end if;
  elsif v_payment_status = 'FAILED' then
    if new.payment_status <> 'FAILED' or new.status <> 'CANCELED' then
      raise exception using message = 'provider_managed_payment', errcode = 'P0001';
    end if;
  elsif v_payment_status = 'REFUNDED' then
    if new.payment_status <> 'REFUNDED' or new.status <> 'CANCELED' then
      raise exception using message = 'provider_managed_payment', errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_nicepay_reservation_state on public.reservations;
create trigger guard_nicepay_reservation_state
before update of status, payment_status on public.reservations
for each row execute function public.guard_nicepay_reservation_state();

drop function if exists public.begin_nicepay_approval(text, text, integer);
create function public.begin_nicepay_approval(
  p_provider_order_id text,
  p_provider_transaction_id text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_reservation public.reservations;
  v_initial_claim boolean := false;
begin
  if trim(coalesce(p_provider_order_id, '')) = ''
     or trim(coalesce(p_provider_transaction_id, '')) = '' then
    raise exception using message = 'invalid_payment_identity', errcode = 'P0001';
  end if;

  select * into v_payment from public.payments
  where provider = 'NICEPAY' and provider_order_id = trim(p_provider_order_id)
  for update;
  if not found then raise exception using message = 'payment_not_found', errcode = 'P0001'; end if;
  if v_payment.amount <> p_amount then raise exception using message = 'payment_amount_mismatch', errcode = 'P0001'; end if;
  if v_payment.provider_transaction_id is not null
     and v_payment.provider_transaction_id <> trim(p_provider_transaction_id) then
    raise exception using message = 'payment_transaction_mismatch', errcode = 'P0001';
  end if;

  select * into v_reservation from public.reservations
  where id = v_payment.reservation_id
  for update;
  if not found then raise exception using message = 'reservation_not_found', errcode = 'P0001'; end if;

  if v_payment.status = 'PAID' then
    return jsonb_build_object(
      'status', v_payment.status,
      'claimed', false,
      'initialClaim', false,
      'leaseUntil', v_payment.approval_lease_until
    );
  end if;

  if v_payment.status = 'VERIFYING' then
    if v_reservation.status <> 'PENDING_PAYMENT' or v_reservation.payment_status <> 'VERIFYING' then
      raise exception using message = 'reservation_not_approvable', errcode = 'P0001';
    end if;
    if v_payment.approval_lease_until is not null and v_payment.approval_lease_until > now() then
      return jsonb_build_object(
        'status', v_payment.status,
        'claimed', false,
        'initialClaim', false,
        'leaseUntil', v_payment.approval_lease_until
      );
    end if;
    update public.payments
    set approval_lease_until = now() + interval '120 seconds', updated_at = now()
    where id = v_payment.id
    returning * into v_payment;
    return jsonb_build_object(
      'status', v_payment.status,
      'claimed', true,
      'initialClaim', false,
      'leaseUntil', v_payment.approval_lease_until
    );
  end if;

  if v_payment.status <> 'READY' then
    raise exception using message = 'payment_not_approvable', errcode = 'P0001';
  end if;

  if v_payment.expires_at is not null and v_payment.expires_at <= now() then
    update public.payments
    set status = 'FAILED', failed_at = now(), failure_code = 'HOLD_EXPIRED',
        failure_message = '결제 가능 시간이 만료되었습니다.', approval_lease_until = null,
        updated_at = now()
    where id = v_payment.id returning * into v_payment;
    update public.reservations
    set status = 'CANCELED', payment_status = 'FAILED', canceled_at = coalesce(canceled_at, now()),
        cancellation_reason = '결제 시간 만료', updated_at = now()
    where id = v_reservation.id;
    perform public.refresh_crimescene_slot(v_reservation.theme_id, v_reservation.play_date, v_reservation.start_time);
    return jsonb_build_object(
      'status', v_payment.status,
      'claimed', false,
      'initialClaim', false,
      'leaseUntil', null
    );
  end if;

  if v_reservation.status <> 'PENDING_PAYMENT' or v_reservation.payment_status <> 'READY' then
    raise exception using message = 'reservation_not_approvable', errcode = 'P0001';
  end if;

  v_initial_claim := true;
  update public.payments
  set status = 'VERIFYING', provider_transaction_id = trim(p_provider_transaction_id),
      approval_lease_until = now() + interval '120 seconds', updated_at = now()
  where id = v_payment.id returning * into v_payment;
  update public.reservations
  set payment_status = 'VERIFYING', updated_at = now()
  where id = v_payment.reservation_id;

  return jsonb_build_object(
    'status', v_payment.status,
    'claimed', true,
    'initialClaim', v_initial_claim,
    'leaseUntil', v_payment.approval_lease_until
  );
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
  v_reservation public.reservations;
begin
  select * into v_payment from public.payments
  where provider = 'NICEPAY' and provider_order_id = trim(p_provider_order_id)
  for update;
  if not found then raise exception using message = 'payment_not_found', errcode = 'P0001'; end if;
  if v_payment.amount <> p_amount then raise exception using message = 'payment_amount_mismatch', errcode = 'P0001'; end if;
  if trim(coalesce(p_result_code, '')) <> '0000' then
    raise exception using message = 'payment_result_not_success', errcode = 'P0001';
  end if;
  if v_payment.provider_transaction_id is not null
     and v_payment.provider_transaction_id <> trim(p_provider_transaction_id) then
    raise exception using message = 'payment_transaction_mismatch', errcode = 'P0001';
  end if;

  select * into v_reservation from public.reservations
  where id = v_payment.reservation_id
  for update;
  if not found then raise exception using message = 'reservation_not_found', errcode = 'P0001'; end if;

  if v_payment.status = 'PAID' then
    if v_payment.provider_transaction_id = trim(p_provider_transaction_id)
       and v_reservation.payment_status = 'PAID'
       and v_reservation.status in ('CONFIRMED', 'COMPLETED', 'CANCEL_REQUESTED', 'NO_SHOW') then
      return v_payment;
    end if;
    raise exception using message = 'reservation_not_approvable', errcode = 'P0001';
  end if;

  if v_payment.status not in ('READY', 'VERIFYING') then
    raise exception using message = 'payment_not_approvable', errcode = 'P0001';
  end if;
  if v_reservation.status <> 'PENDING_PAYMENT'
     or v_reservation.payment_status not in ('READY', 'VERIFYING') then
    raise exception using message = 'reservation_not_approvable', errcode = 'P0001';
  end if;

  update public.payments
  set status = 'PAID', provider_transaction_id = trim(p_provider_transaction_id),
      approved_at = coalesce(approved_at, now()), raw_result_code = left(p_result_code, 100),
      raw_payload = coalesce(p_raw_payload, '{}'::jsonb),
      receipt_url = nullif(left(trim(coalesce(p_receipt_url, '')), 1000), ''),
      expires_at = null, approval_lease_until = null, failed_at = null,
      failure_code = null, failure_message = null, updated_at = now()
  where id = v_payment.id returning * into v_payment;
  update public.reservations
  set status = 'CONFIRMED', payment_status = 'PAID', updated_at = now()
  where id = v_payment.reservation_id
    and status = 'PENDING_PAYMENT'
    and payment_status in ('READY', 'VERIFYING');
  if not found then
    raise exception using message = 'reservation_not_approvable', errcode = 'P0001';
  end if;

  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values('nicepay', 'NICEPAY_PAYMENT_PAID', 'reservation', v_payment.reservation_id::text,
    jsonb_build_object('orderId', v_payment.provider_order_id, 'tid', v_payment.provider_transaction_id, 'amount', v_payment.amount));
  return v_payment;
end;
$$;

drop function if exists public.fail_nicepay_payment(text, text, text, jsonb);
create function public.fail_nicepay_payment(
  p_provider_order_id text,
  p_failure_code text,
  p_failure_message text,
  p_raw_payload jsonb default '{}'::jsonb,
  p_expected_status text default null
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
  if p_expected_status is not null and v_payment.status <> p_expected_status then return false; end if;
  if v_payment.status not in ('READY', 'VERIFYING') then return false; end if;

  select * into v_reservation from public.reservations
  where id = v_payment.reservation_id
  for update;
  if not found then return false; end if;
  if v_reservation.status <> 'PENDING_PAYMENT'
     or v_reservation.payment_status <> v_payment.status then
    return false;
  end if;

  update public.payments
  set status = 'FAILED', failed_at = now(), failure_code = left(coalesce(p_failure_code, 'PAYMENT_FAILED'), 100),
      failure_message = left(coalesce(p_failure_message, '결제를 완료하지 못했습니다.'), 500),
      raw_payload = coalesce(p_raw_payload, '{}'::jsonb), expires_at = null,
      approval_lease_until = null, updated_at = now()
  where id = v_payment.id;
  update public.reservations
  set status = 'CANCELED', payment_status = 'FAILED', canceled_at = coalesce(canceled_at, now()),
      cancellation_reason = '온라인 결제 미완료', updated_at = now()
  where id = v_reservation.id and status = 'PENDING_PAYMENT';
  if not found then
    raise exception using message = 'reservation_not_approvable', errcode = 'P0001';
  end if;
  perform public.refresh_crimescene_slot(v_reservation.theme_id, v_reservation.play_date, v_reservation.start_time);
  insert into public.audit_logs(actor, action, target_type, target_id, metadata)
  values('nicepay', 'NICEPAY_PAYMENT_FAILED', 'reservation', v_reservation.id::text,
    jsonb_build_object('orderId', v_payment.provider_order_id, 'code', left(coalesce(p_failure_code, ''), 100)));
  return true;
end;
$$;

revoke all on function public.guard_nicepay_reservation_state() from public, anon, authenticated;
revoke all on function public.begin_nicepay_approval(text, text, integer) from public, anon, authenticated;
revoke all on function public.finalize_nicepay_payment(text, text, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_nicepay_payment(text, text, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.begin_nicepay_approval(text, text, integer) to service_role;
grant execute on function public.finalize_nicepay_payment(text, text, integer, text, text, jsonb) to service_role;
grant execute on function public.fail_nicepay_payment(text, text, text, jsonb, text) to service_role;
