const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const payment = read("supabase/functions/api/payment.ts");
const core = read("supabase/functions/api/core.ts");
const routes = read("supabase/functions/api/index.ts");
const admin = read("supabase/functions/api/admin.ts");
const publicApi = read("supabase/functions/api/public.ts");
const customer = read("pages-src/customer-final.js");
const shell = read("pages-src/shell.html");
const migrations = [
  read("supabase/migrations/20260821075707_nicepay_server_approval_flow.sql"),
  read("supabase/migrations/20260821075833_nicepay_guards_and_expiry_schedule.sql"),
  read("supabase/migrations/20260821080854_restore_fifteen_day_booking_window.sql"),
  read("supabase/migrations/20260821082825_nicepay_atomic_claim_and_cancel_guards.sql"),
].join("\n");

function includes(source, markers, label) {
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${label} 누락: ${marker}`);
  }
}

includes(routes, [
  'version: "5.0.0"',
  '"/payments/nicepay/prepare"',
  '"/payments/nicepay/result"',
  '"/payments/nicepay/abort"',
  '"/payments/nicepay/return"',
  '"/payments/nicepay/webhook"',
], "NICEPAY API 경로");

includes(payment, [
  'https://pay.nicepay.co.kr/v1/js/',
  'https://api.nicepay.co.kr',
  'https://sandbox-api.nicepay.co.kr',
  'Basic ${btoa(`${CLIENT_ID}:${SECRET_KEY}`)}',
  'begin_nicepay_approval',
  'finalize_nicepay_payment',
  'fail_nicepay_payment',
  'reconcile_nicepay_cancellation',
  'timingSafeEqual',
  'NETWORK_CANCELED',
  'validateCanceledPayment',
  'begun?.claimed !== true',
  'begun?.initialClaim !== true',
  'p_expected_status: "VERIFYING"',
  '/cancel',
  'return new Response("OK"',
], "NICEPAY 서버 승인 흐름");

includes(core, [
  'NICEPAY_CLIENT_ID',
  'NICEPAY_SECRET_KEY',
  'NICEPAY_ENVIRONMENT',
  'integrationReady = true',
  'provider: "NICEPAY"',
], "NICEPAY 준비 상태");

includes(migrations, [
  'payments_provider_order_unique',
  'payments_idempotency_unique',
  "'VERIFYING'",
  'expire_nicepay_payment_holds',
  'prepare_nicepay_reservation',
  'enqueue_owner_reservation_status',
  'expire-nicepay-payment-holds',
  'provider_managed_payment',
  'approval_lease_until',
  'payments_verifying_lease_idx',
  'guard_nicepay_reservation_state',
  'nicepay_pending_cancel_requires_abort',
  "'initialClaim', v_initial_claim",
  "interval '120 seconds'",
  "v_reservation.status <> 'PENDING_PAYMENT'",
  'p_expected_status text default null',
  'booking_window_days = 15',
], "NICEPAY 데이터 무결성");

includes(publicApi, [
  'nicepay_pending_cancel_requires_abort',
  '카드 결제 확인 중에는 일반 예약 취소를 할 수 없습니다.',
], "NICEPAY 고객 취소 보호");

includes(admin, [
  'cancelNicepayPayment',
  'payment?.provider === "NICEPAY"',
  'p_payment_provider: "NICEPAY"',
], "NICEPAY 관리자 보호");

includes(customer, [
  '/payments/nicepay/prepare',
  '/payments/nicepay/result',
  '/payments/nicepay/abort',
  'AUTHNICE',
  'actionToken',
  'idempotencyKey',
  'managedPending',
  '카드 결제 확인 중에는 예약을 변경하거나 취소할 수 없습니다.',
], "NICEPAY 고객 결제 흐름");

includes(shell, [
  'script-src \'self\' \'unsafe-inline\' https://pay.nicepay.co.kr',
  'form-action \'self\' https://jhjbiejqtbidloxcwryr.supabase.co https://pay.nicepay.co.kr',
], "NICEPAY CSP");

if (/NICEPAY_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(customer)) {
  throw new Error("고객 JavaScript에 서버 비밀키 이름이 포함되어 있습니다.");
}
if (/lookupCode|lookup_code/.test(customer.match(/function completionResult[\s\S]*?function reservationCompletePage/)?.[0] ?? "")) {
  throw new Error("고객 완료 화면에 내부 예약 식별자가 노출될 수 있습니다.");
}
if ((payment.match(/niceFetch\("\/v1\/payments\/netcancel"/g) ?? []).length !== 1) {
  throw new Error("망취소 호출은 전체 응답 검증 helper 한 곳으로만 모아야 합니다.");
}
if (payment.includes('canceled.ok && String(canceled.payload?.resultCode ?? "") === "0000"')) {
  throw new Error("망취소 응답을 resultCode만으로 확정하면 안 됩니다.");
}

console.log("NICEPAY server-approval smoke checks passed.");
