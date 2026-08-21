-- Keep the customer-requested booking window at today plus the following 14 calendar days.
update public.store_settings
set booking_window_days = 15, updated_at = now()
where id = 1 and booking_window_days is distinct from 15;
