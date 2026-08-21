-- Enforce provider-owned NICEPAY state transitions and release abandoned holds without traffic.

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

  if v_provider = 'NICEPAY' then
    if p_payment_status <> v_before.payment_status then
      raise exception using message = 'provider_managed_payment', errcode = 'P0001';
    end if;
    if v_before.payment_status in ('READY','VERIFYING') and p_status <> 'PENDING_PAYMENT' then
      raise exception using message = 'provider_managed_payment', errcode = 'P0001';
    end if;
    if v_before.payment_status = 'PAID' and p_status not in ('CONFIRMED','COMPLETED','CANCEL_REQUESTED','NO_SHOW') then
      raise exception using message = 'provider_refund_required', errcode = 'P0001';
    end if;
    if v_before.payment_status in ('FAILED','REFUNDED') and p_status <> 'CANCELED' then
      raise exception using message = 'provider_managed_payment', errcode = 'P0001';
    end if;
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

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'expire-nicepay-payment-holds';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'expire-nicepay-payment-holds',
    '* * * * *',
    'select public.expire_nicepay_payment_holds();'
  );
end;
$$;
