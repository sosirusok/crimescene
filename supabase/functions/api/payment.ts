import {
  db,
  encrypt,
  hhmm,
  limited,
  mask,
  paymentState,
  phone,
  readBody,
  reply,
  reservableDate,
  settingsRow,
  sha,
  SUPABASE_URL,
} from "./core.ts";

const CLIENT_ID = Deno.env.get("NICEPAY_CLIENT_ID")?.trim() ?? "";
const SECRET_KEY = Deno.env.get("NICEPAY_SECRET_KEY")?.trim() ?? "";
const ENVIRONMENT = Deno.env.get("NICEPAY_ENVIRONMENT")?.trim().toLowerCase() ?? "";
const SDK_URL = "https://pay.nicepay.co.kr/v1/js/";
const DEFAULT_RETURN = "https://www.xn--oi2bkkl05a1gchcr33e50h.com/reservations/complete/";
const CUSTOMER_ORIGINS = new Set([
  "https://xn--oi2bkkl05a1gchcr33e50h.com",
  "https://www.xn--oi2bkkl05a1gchcr33e50h.com",
  "https://sosirusok.github.io",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
]);

type PaymentRow = {
  id: string;
  reservation_id: string;
  provider: string;
  provider_order_id: string;
  provider_transaction_id: string | null;
  amount: number;
  status: string;
  action_token_hash: string;
  idempotency_key_hash: string | null;
  expires_at: string | null;
  approval_lease_until: string | null;
  failure_code: string | null;
  failure_message: string | null;
  receipt_url: string | null;
  customer_return_url: string | null;
  updated_at?: string | null;
  reservations?: any;
};

function niceApiBase() {
  return ENVIRONMENT === "production" ? "https://api.nicepay.co.kr" : "https://sandbox-api.nicepay.co.kr";
}

function timingSafeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left.toLowerCase());
  const b = new TextEncoder().encode(right.toLowerCase());
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function utf8Slice(value: unknown, maxBytes: number) {
  let output = "";
  for (const character of String(value ?? "")) {
    if (new TextEncoder().encode(output + character).length > maxBytes) break;
    output += character;
  }
  return output;
}

function safeReturnUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? DEFAULT_RETURN));
    if (!CUSTOMER_ORIGINS.has(url.origin) || !url.pathname.endsWith("/reservations/complete/")) return DEFAULT_RETURN;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return DEFAULT_RETURN;
  }
}

function redirectToCustomer(target: string | null | undefined, state: "success" | "failed" | "pending") {
  const url = new URL(safeReturnUrl(target));
  url.searchParams.set("payment", state);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanProviderPayload(value: any) {
  const allowed = [
    "resultCode", "resultMsg", "status", "tid", "orderId", "amount", "currency",
    "payMethod", "goodsName", "paidAt", "cancelledAt", "receiptUrl", "ediDate",
  ];
  return Object.fromEntries(allowed.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]));
}

async function niceFetch(path: string, init: RequestInit, timeoutMs = 35000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Basic ${btoa(`${CLIENT_ID}:${SECRET_KEY}`)}`);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    const response = await fetch(`${niceApiBase()}${path}`, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { resultMsg: "결제 응답 형식을 확인하지 못했습니다." }; }
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function paymentByOrder(orderId: string) {
  const { data, error } = await db
    .from("payments")
    .select("id,reservation_id,provider,provider_order_id,provider_transaction_id,amount,status,action_token_hash,idempotency_key_hash,expires_at,approval_lease_until,failure_code,failure_message,receipt_url,customer_return_url,updated_at,reservations(id,theme_id,play_date,start_time,party_size,total_amount,status,payment_status,booking_mode,themes(title))")
    .eq("provider", "NICEPAY")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentRow | null;
}

async function paymentByIdempotency(idempotencyHash: string) {
  const { data, error } = await db
    .from("payments")
    .select("id,reservation_id,provider,provider_order_id,provider_transaction_id,amount,status,action_token_hash,idempotency_key_hash,expires_at,approval_lease_until,failure_code,failure_message,receipt_url,customer_return_url,updated_at,reservations(id,theme_id,play_date,start_time,party_size,total_amount,status,payment_status,booking_mode,themes(title))")
    .eq("provider", "NICEPAY")
    .eq("idempotency_key_hash", idempotencyHash)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentRow | null;
}

function reservationSummary(row: PaymentRow) {
  const r = row.reservations ?? {};
  return {
    id: r.id ?? row.reservation_id,
    themeTitle: r.themes?.title ?? r.theme_id ?? "크라임씬플레이",
    playDate: r.play_date,
    startTime: hhmm(r.start_time),
    partySize: r.party_size,
    totalAmount: r.total_amount ?? row.amount,
    status: r.status,
    paymentStatus: r.payment_status ?? row.status,
    bookingMode: r.booking_mode,
  };
}

function checkoutPayload(row: PaymentRow) {
  const reservation = reservationSummary(row);
  return {
    provider: "NICEPAY",
    clientId: CLIENT_ID,
    orderId: row.provider_order_id,
    amount: row.amount,
    goodsName: utf8Slice(`크라임씬플레이 ${reservation.themeTitle}`, 40),
    returnUrl: `${SUPABASE_URL}/functions/v1/api/payments/nicepay/return`,
    sdkUrl: SDK_URL,
    method: "card",
  };
}

function mappedRpcError(req: Request, error: any) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("open_room_required")) return reply(req, { error: "4명 미만 예약은 오픈룸으로 진행해 주세요." }, 400);
  if (message.includes("open_room_message_required")) return reply(req, { error: "오픈룸 소개를 입력해 주세요." }, 400);
  if (message.includes("slot_capacity_insufficient")) return reply(req, { error: "남은 자리보다 예약 인원이 많습니다." }, 409);
  if (message.includes("slot_unavailable")) return reply(req, { error: "선택한 회차는 방금 마감되었거나 단독팀 예약이 있습니다." }, 409);
  if (message.includes("nicepay_not_enabled")) return reply(req, { error: "온라인 결제가 아직 운영 설정에 반영되지 않았습니다." }, 409);
  return null;
}

async function validatePaymentSignature(payload: any) {
  const expected = await sha(`${payload.tid ?? ""}${Number(payload.amount)}${payload.ediDate ?? ""}${SECRET_KEY}`);
  return Boolean(payload.signature) && timingSafeEqual(String(payload.signature), expected);
}

async function validateCanceledPayment(payload: any, row: PaymentRow) {
  return String(payload.resultCode ?? "") === "0000"
    && String(payload.status ?? "").toLowerCase() === "cancelled"
    && String(payload.orderId ?? "") === row.provider_order_id
    && Boolean(row.provider_transaction_id)
    && String(payload.tid ?? "") === row.provider_transaction_id
    && Number(payload.amount) === Number(row.amount)
    && await validatePaymentSignature(payload);
}

async function finalizeFromProvider(payload: any, row: PaymentRow) {
  if (String(payload.orderId ?? "") !== row.provider_order_id) return "invalid" as const;
  if (String(payload.tid ?? "") !== String(row.provider_transaction_id ?? payload.tid ?? "")) return "invalid" as const;
  if (Number(payload.amount) !== Number(row.amount)) return "invalid" as const;
  if (!await validatePaymentSignature(payload)) return "invalid" as const;
  const { error } = await db.rpc("finalize_nicepay_payment", {
    p_provider_order_id: row.provider_order_id,
    p_provider_transaction_id: String(payload.tid),
    p_amount: Number(payload.amount),
    p_result_code: String(payload.resultCode ?? "0000"),
    p_receipt_url: String(payload.receiptUrl ?? ""),
    p_raw_payload: cleanProviderPayload(payload),
  });
  if (error) {
    const message = String(error.message ?? error);
    if (message.includes("reservation_not_approvable") || message.includes("payment_not_approvable")) return "blocked" as const;
    throw error;
  }
  return "success" as const;
}

async function reconcileVerifiedCancellation(row: PaymentRow, payload: any, resultCode: string) {
  const { error } = await db.rpc("reconcile_nicepay_cancellation", {
    p_provider_order_id: row.provider_order_id,
    p_provider_transaction_id: String(payload.tid),
    p_result_code: resultCode,
    p_raw_payload: cleanProviderPayload(payload),
  });
  if (error) throw error;
}

async function netcancelNicepay(row: PaymentRow) {
  if (!row.provider_transaction_id) return false;
  let canceled;
  try {
    canceled = await niceFetch("/v1/payments/netcancel", {
      method: "POST",
      body: JSON.stringify({ orderId: row.provider_order_id }),
    });
  } catch (error) {
    console.error("nicepay netcancel", error);
    return false;
  }
  if (!canceled.ok || !await validateCanceledPayment(canceled.payload, row)) return false;
  await reconcileVerifiedCancellation(row, canceled.payload, "NETWORK_CANCELED");
  return true;
}

async function queryAndReconcile(row: PaymentRow) {
  if (!row.provider_transaction_id || !CLIENT_ID || !SECRET_KEY) return "pending" as const;
  let queried;
  try {
    queried = await niceFetch(`/v1/payments/${encodeURIComponent(row.provider_transaction_id)}`, { method: "GET" });
  } catch {
    return "pending" as const;
  }
  const payload = queried.payload;
  if (!queried.ok || String(payload.orderId ?? "") !== row.provider_order_id || Number(payload.amount) !== Number(row.amount)) return "pending" as const;
  if (!await validatePaymentSignature(payload)) return "pending" as const;
  if (String(payload.status ?? "").toLowerCase() === "paid" && String(payload.resultCode ?? "0000") === "0000") {
    const finalized = await finalizeFromProvider(payload, row);
    if (finalized === "success") return "success" as const;
    if (finalized === "blocked" && await netcancelNicepay({ ...row, provider_transaction_id: String(payload.tid) })) return "failed" as const;
    return "pending" as const;
  }
  if (["cancelled", "canceled"].includes(String(payload.status ?? "").toLowerCase())) {
    await reconcileVerifiedCancellation(row, payload, String(payload.resultCode ?? "CANCELED"));
    return "failed" as const;
  }
  return "pending" as const;
}

async function claimNicepayApproval(row: PaymentRow) {
  if (!row.provider_transaction_id) return null;
  const { data, error } = await db.rpc("begin_nicepay_approval", {
    p_provider_order_id: row.provider_order_id,
    p_provider_transaction_id: row.provider_transaction_id,
    p_amount: Number(row.amount),
  });
  if (error) throw error;
  return data as { status?: string; claimed?: boolean; initialClaim?: boolean; leaseUntil?: string | null } | null;
}

export async function reconcileNicepayVerifying(limit = 3) {
  if (!CLIENT_ID || !SECRET_KEY || !["sandbox", "production"].includes(ENVIRONMENT)) return;
  const { data, error } = await db
    .from("payments")
    .select("id,reservation_id,provider,provider_order_id,provider_transaction_id,amount,status,action_token_hash,idempotency_key_hash,expires_at,approval_lease_until,failure_code,failure_message,receipt_url,customer_return_url,updated_at,reservations(id,theme_id,play_date,start_time,party_size,total_amount,status,payment_status,booking_mode,themes(title))")
    .eq("provider", "NICEPAY")
    .eq("status", "VERIFYING")
    .or(`approval_lease_until.is.null,approval_lease_until.lte.${new Date().toISOString()}`)
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 5)));
  if (error) throw error;
  for (const candidate of data ?? []) {
    const row = candidate as PaymentRow;
    const leaseUntil = row.approval_lease_until ? new Date(row.approval_lease_until).getTime() : 0;
    if (Number.isFinite(leaseUntil) && leaseUntil > Date.now()) continue;
    const claim = await claimNicepayApproval(row);
    if (!claim?.claimed) continue;
    const outcome = await queryAndReconcile(row);
    if (outcome !== "pending") continue;
    await netcancelNicepay(row);
  }
}

export async function prepareNicepay(req: Request) {
  if (!await limited(req, "nicepay-prepare", 600, 8)) return reply(req, { error: "결제 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  await Promise.all([db.rpc("expire_nicepay_payment_holds"), reconcileNicepayVerifying(2)]);
  const settings = await settingsRow();
  const pay = paymentState(settings);
  if (!pay.onlineEnabled) return reply(req, { error: "현재 온라인 카드 결제를 이용할 수 없습니다. 매장으로 문의해 주세요." }, 503);

  const b: any = await readBody(req);
  const themeId = String(b.themeId ?? "").toUpperCase();
  const date = String(b.playDate ?? "");
  const time = hhmm(b.startTime);
  const name = String(b.customerName ?? "").trim();
  const customerPhone = phone(b.phone);
  const size = Number(b.partySize);
  const open = b.openRoom === true;
  const message = String(b.specialRequest ?? "").trim();
  const idempotencyKey = String(b.idempotencyKey ?? "").trim();
  if (!reservableDate(date, settings.booking_window_days)) return reply(req, { error: "예약 가능한 날짜를 확인해 주세요." }, 400);
  if (name.length < 2 || name.length > 20 || !/^01\d{8,9}$/.test(customerPhone) || !Number.isInteger(size)) return reply(req, { error: "예약자 이름, 휴대폰 번호와 인원을 확인해 주세요." }, 400);
  if (b.privacyConsent !== true || b.cancellationConsent !== true) return reply(req, { error: "필수 동의 항목을 확인해 주세요." }, 400);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return reply(req, { error: "결제 요청 식별값을 다시 생성해 주세요." }, 400);

  const { data: theme, error: themeError } = await db.from("themes").select("id,title,price,times,status,min_players,total_capacity").eq("id", themeId).eq("status", "ACTIVE").maybeSingle();
  if (themeError) throw themeError;
  if (!theme || !(theme.times ?? []).includes(time) || size < 1 || size > theme.total_capacity) return reply(req, { error: "테마, 회차 또는 예약 인원을 확인해 주세요." }, 400);
  if (size < theme.min_players && !open) return reply(req, { error: `${theme.min_players}명 미만 예약은 오픈룸으로 진행해 주세요.` }, 400);
  if (open && message.length < 2) return reply(req, { error: "같이 플레이할 분들이 확인할 간단한 소개를 입력해 주세요." }, 400);

  const total = Number(theme.price) * size;
  const idempotencyHash = await sha(`nicepay-idempotency-v1:${idempotencyKey}`);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const actionToken = await sha(`nicepay-action-v1:${idempotencyKey}:${serviceKey}`);
  const actionTokenHash = await sha(actionToken);
  const orderId = `CS${(await sha(`nicepay-order-v1:${idempotencyKey}`)).slice(0, 30)}`.toUpperCase();
  const customerReturnUrl = safeReturnUrl(b.customerReturnUrl);

  let existing = await paymentByIdempotency(idempotencyHash);
  if (existing) {
    const reservation = reservationSummary(existing);
    const sameRequest = reservation.themeTitle === theme.title && reservation.playDate === date && reservation.startTime === time && Number(reservation.partySize) === size && Number(existing.amount) === total;
    if (!sameRequest) return reply(req, { error: "같은 결제 요청값으로 예약 내용이 변경되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." }, 409);
    if (!["READY", "VERIFYING", "PAID"].includes(existing.status)) return reply(req, { error: "종료된 결제 요청입니다. 다시 예약해 주세요." }, 409);
    return reply(req, { reservation, payment: checkoutPayload(existing), actionToken }, 200);
  }

  const reservationId = crypto.randomUUID();
  const lookup = `CS-${date.replaceAll("-", "").slice(2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const { error: rpcError } = await db.rpc("prepare_nicepay_reservation", {
    p_reservation_id: reservationId,
    p_lookup_code: lookup,
    p_theme_id: theme.id,
    p_play_date: date,
    p_start_time: time,
    p_customer_name: name,
    p_phone_hash: await sha(customerPhone),
    p_phone_masked: mask(customerPhone),
    p_phone_encrypted: await encrypt(customerPhone),
    p_party_size: size,
    p_open_room: open,
    p_special_request: message,
    p_total_amount: total,
    p_provider_order_id: orderId,
    p_action_token_hash: actionTokenHash,
    p_idempotency_key_hash: idempotencyHash,
    p_customer_return_url: customerReturnUrl,
  });
  if (rpcError) {
    if (String(rpcError.code ?? "") === "23505") {
      existing = await paymentByIdempotency(idempotencyHash);
      if (existing) return reply(req, { reservation: reservationSummary(existing), payment: checkoutPayload(existing), actionToken }, 200);
    }
    const mapped = mappedRpcError(req, rpcError);
    if (mapped) return mapped;
    throw rpcError;
  }
  const created = await paymentByOrder(orderId);
  if (!created) throw new Error("prepared_payment_missing");
  return reply(req, { reservation: reservationSummary(created), payment: checkoutPayload(created), actionToken }, 201);
}

export async function abortNicepay(req: Request) {
  if (!await limited(req, "nicepay-abort", 600, 12)) return reply(req, { error: "잠시 후 다시 시도해 주세요." }, 429);
  const b: any = await readBody(req);
  const orderId = String(b.orderId ?? "").trim();
  const actionToken = String(b.actionToken ?? "").trim();
  const row = orderId ? await paymentByOrder(orderId) : null;
  if (!row || !actionToken || !timingSafeEqual(await sha(actionToken), row.action_token_hash)) return reply(req, { error: "결제 요청을 확인할 수 없습니다." }, 404);
  if (row.status === "READY") {
    const { error } = await db.rpc("fail_nicepay_payment", {
      p_provider_order_id: orderId,
      p_failure_code: "CUSTOMER_ABORTED",
      p_failure_message: String(b.reason ?? "결제창을 닫았습니다.").slice(0, 200),
      p_raw_payload: {},
      p_expected_status: "READY",
    });
    if (error) throw error;
  }
  const latest = await paymentByOrder(orderId);
  return reply(req, { ok: true, status: latest?.status ?? row.status });
}

export async function nicepayResult(req: Request) {
  if (!await limited(req, "nicepay-result", 600, 30)) return reply(req, { error: "잠시 후 다시 확인해 주세요." }, 429);
  const b: any = await readBody(req);
  const orderId = String(b.orderId ?? "").trim();
  const actionToken = String(b.actionToken ?? "").trim();
  let row = orderId ? await paymentByOrder(orderId) : null;
  if (!row || !actionToken || !timingSafeEqual(await sha(actionToken), row.action_token_hash)) return reply(req, { error: "결제 결과를 확인할 수 없습니다." }, 404);
  if (row.status === "VERIFYING") {
    await queryAndReconcile(row);
    row = await paymentByOrder(orderId);
    if (!row) return reply(req, { error: "결제 결과를 확인할 수 없습니다." }, 404);
  }
  return reply(req, {
    reservation: reservationSummary(row),
    payment: {
      provider: "NICEPAY",
      status: row.status,
      receiptUrl: row.receipt_url,
      failureMessage: row.failure_message,
    },
  });
}

export async function cancelNicepayPayment(req: Request, user: any) {
  if (!CLIENT_ID || !SECRET_KEY || !["sandbox", "production"].includes(ENVIRONMENT)) {
    return reply(req, { error: "나이스페이먼츠 가맹점 키와 운영 환경을 먼저 등록해 주세요." }, 409);
  }
  const b: any = await readBody(req);
  const reservationId = String(b.reservationId ?? "").trim();
  const reason = utf8Slice(String(b.reason ?? "고객 예약 취소 요청").replace(/\s+/g, " ").trim(), 100);
  const { data, error } = await db
    .from("payments")
    .select("id,reservation_id,provider,provider_order_id,provider_transaction_id,amount,status,action_token_hash,idempotency_key_hash,expires_at,approval_lease_until,failure_code,failure_message,receipt_url,customer_return_url,reservations(id,status,payment_status)")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (error) throw error;
  const row = data as PaymentRow | null;
  if (!row || row.provider !== "NICEPAY") return reply(req, { error: "나이스페이먼츠 결제 내역을 찾을 수 없습니다." }, 404);
  if (row.status === "REFUNDED") return reply(req, { ok: true, status: "REFUNDED" });
  if (row.status !== "PAID" || !row.provider_transaction_id) return reply(req, { error: "결제 완료 상태에서만 전액 취소할 수 있습니다." }, 409);
  if (row.reservations?.status !== "CANCEL_REQUESTED") return reply(req, { error: "고객 취소 요청이 접수된 예약만 결제 취소할 수 있습니다." }, 409);

  let canceled;
  try {
    canceled = await niceFetch(`/v1/payments/${encodeURIComponent(row.provider_transaction_id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || "고객 예약 취소 요청", orderId: row.provider_order_id }),
    });
  } catch (networkError) {
    console.error("nicepay cancel", networkError);
    const reconciled = await queryAndReconcile(row);
    if (reconciled === "failed") return reply(req, { ok: true, status: "REFUNDED" });
    return reply(req, { error: "결제 취소 결과를 확인 중입니다. 잠시 후 다시 확인해 주세요." }, 503);
  }
  const payload = canceled.payload;
  const valid = canceled.ok && await validateCanceledPayment(payload, row);
  if (!valid) {
    await db.from("audit_logs").insert({
      actor: user?.email ?? "admin",
      action: "NICEPAY_CANCEL_REVIEW_REQUIRED",
      target_type: "reservation",
      target_id: reservationId,
      metadata: cleanProviderPayload(payload),
    });
    return reply(req, { error: String(payload.resultMsg ?? "결제 취소 결과를 확인하지 못했습니다. 나이스페이먼츠 거래 내역을 확인해 주세요.") }, 409);
  }
  await reconcileVerifiedCancellation(row, payload, String(payload.resultCode));
  await db.from("audit_logs").insert({
    actor: user?.email ?? "admin",
    action: "ADMIN_NICEPAY_CANCEL_COMPLETED",
    target_type: "reservation",
    target_id: reservationId,
    metadata: { orderId: row.provider_order_id, tid: row.provider_transaction_id, amount: row.amount },
  });
  return reply(req, { ok: true, status: "REFUNDED" });
}

export async function nicepayReturn(req: Request) {
  const form = await req.formData();
  const payload = Object.fromEntries(form.entries());
  const orderId = String(payload.orderId ?? "").trim();
  const row = orderId ? await paymentByOrder(orderId) : null;
  if (!row) return redirectToCustomer(null, "failed");
  const customerReturn = row.customer_return_url;
  const authCode = String(payload.authResultCode ?? "");
  const amount = Number(payload.amount);
  const tid = String(payload.tid ?? "").trim();
  const authToken = String(payload.authToken ?? "");
  const signature = String(payload.signature ?? "");

  if (authCode !== "0000") {
    if (!CLIENT_ID || String(payload.clientId ?? "") !== CLIENT_ID || amount !== Number(row.amount)) {
      return redirectToCustomer(customerReturn, "pending");
    }
    if (row.status === "PAID") return redirectToCustomer(customerReturn, "success");
    if (["FAILED", "REFUNDED"].includes(row.status)) return redirectToCustomer(customerReturn, "failed");
    const { data: failed, error: failureError } = await db.rpc("fail_nicepay_payment", {
      p_provider_order_id: orderId,
      p_failure_code: authCode || "AUTH_FAILED",
      p_failure_message: String(payload.authResultMsg ?? "카드 인증을 완료하지 못했습니다.").slice(0, 300),
      p_raw_payload: { authResultCode: authCode, authResultMsg: String(payload.authResultMsg ?? "") },
      p_expected_status: "READY",
    });
    if (failureError) return redirectToCustomer(customerReturn, "pending");
    if (failed === true) return redirectToCustomer(customerReturn, "failed");
    const latest = await paymentByOrder(orderId);
    if (latest?.status === "PAID") return redirectToCustomer(customerReturn, "success");
    if (latest?.status === "VERIFYING") {
      const recovered = await queryAndReconcile(latest);
      if (recovered === "success") return redirectToCustomer(customerReturn, "success");
      if (recovered === "failed") return redirectToCustomer(customerReturn, "failed");
    }
    return redirectToCustomer(customerReturn, "pending");
  }
  const expectedAuthSignature = await sha(`${authToken}${CLIENT_ID}${amount}${SECRET_KEY}`);
  if (!CLIENT_ID || !SECRET_KEY || String(payload.clientId ?? "") !== CLIENT_ID || amount !== Number(row.amount) || !tid || !authToken || !timingSafeEqual(signature, expectedAuthSignature)) {
    return redirectToCustomer(customerReturn, "pending");
  }

  const { data: begun, error: beginError } = await db.rpc("begin_nicepay_approval", {
    p_provider_order_id: orderId,
    p_provider_transaction_id: tid,
    p_amount: amount,
  });
  if (beginError) return redirectToCustomer(customerReturn, "pending");
  if (begun?.status === "PAID") return redirectToCustomer(customerReturn, "success");
  if (begun?.status !== "VERIFYING") return redirectToCustomer(customerReturn, "failed");
  if (begun?.claimed !== true) return redirectToCustomer(customerReturn, "pending");

  const claimedRow = { ...row, provider_transaction_id: tid };
  if (begun?.initialClaim !== true) {
    const recovered = await queryAndReconcile(claimedRow);
    if (recovered === "success") return redirectToCustomer(customerReturn, "success");
    if (recovered === "failed") return redirectToCustomer(customerReturn, "failed");
    if (await netcancelNicepay(claimedRow)) return redirectToCustomer(customerReturn, "failed");
    return redirectToCustomer(customerReturn, "pending");
  }

  try {
    const approved = await niceFetch(`/v1/payments/${encodeURIComponent(tid)}`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    const result = approved.payload;
    const valid = approved.ok
      && String(result.resultCode ?? "") === "0000"
      && String(result.status ?? "").toLowerCase() === "paid"
      && String(result.orderId ?? "") === orderId
      && String(result.tid ?? "") === tid
      && Number(result.amount) === amount
      && await validatePaymentSignature(result);
    if (valid) {
      const finalized = await finalizeFromProvider(result, claimedRow);
      if (finalized === "success") return redirectToCustomer(customerReturn, "success");
      if (finalized === "blocked" && await netcancelNicepay(claimedRow)) return redirectToCustomer(customerReturn, "failed");
      return redirectToCustomer(customerReturn, "pending");
    }
    const verifiedFailure = approved.ok
      && String(result.orderId ?? "") === orderId
      && String(result.tid ?? "") === tid
      && Number(result.amount) === amount
      && await validatePaymentSignature(result);
    if (verifiedFailure && String(result.resultCode ?? "") !== "0000") {
      const { data: failed, error: failureError } = await db.rpc("fail_nicepay_payment", {
        p_provider_order_id: orderId,
        p_failure_code: String(result.resultCode ?? "APPROVAL_FAILED"),
        p_failure_message: String(result.resultMsg ?? "카드 승인을 완료하지 못했습니다.").slice(0, 300),
        p_raw_payload: cleanProviderPayload(result),
        p_expected_status: "VERIFYING",
      });
      if (failureError) throw failureError;
      if (failed === true) return redirectToCustomer(customerReturn, "failed");
      const current = await paymentByOrder(orderId);
      return redirectToCustomer(customerReturn, current?.status === "PAID" ? "success" : "pending");
    }
  } catch (error) {
    console.error("nicepay approval", error);
  }

  const latest = await paymentByOrder(orderId);
  if (latest) {
    const recovered = await queryAndReconcile({ ...latest, provider_transaction_id: tid });
    if (recovered === "success") return redirectToCustomer(customerReturn, "success");
    if (recovered === "failed") return redirectToCustomer(customerReturn, "failed");
    if (await netcancelNicepay({ ...latest, provider_transaction_id: tid })) return redirectToCustomer(customerReturn, "failed");
  }
  return redirectToCustomer(customerReturn, "pending");
}

export async function nicepayWebhook(req: Request) {
  let payload: any;
  try { payload = await req.json(); } catch { return new Response("INVALID", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }); }
  const orderId = String(payload.orderId ?? "").trim();
  const tid = String(payload.tid ?? "").trim();
  const row = orderId ? await paymentByOrder(orderId) : null;
  const valid = row
    && tid
    && Number(payload.amount) === Number(row.amount)
    && (!row.provider_transaction_id || row.provider_transaction_id === tid)
    && await validatePaymentSignature(payload);
  if (!valid) return new Response("INVALID", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });

  const status = String(payload.status ?? "").toLowerCase();
  try {
    if (status === "paid" && String(payload.resultCode ?? "0000") === "0000") {
      const providerRow = { ...row!, provider_transaction_id: tid };
      const finalized = await finalizeFromProvider(payload, providerRow);
      if (finalized === "blocked") {
        if (!await netcancelNicepay(providerRow)) throw new Error("nicepay_paid_reservation_mismatch");
      } else if (finalized !== "success") {
        throw new Error("nicepay_paid_payload_invalid");
      }
    } else if (["cancelled", "canceled"].includes(status)) {
      await reconcileVerifiedCancellation(row!, payload, String(payload.resultCode ?? "CANCELED"));
    } else if (["failed", "expired"].includes(status)) {
      const { error } = await db.rpc("fail_nicepay_payment", {
        p_provider_order_id: orderId,
        p_failure_code: String(payload.resultCode ?? status.toUpperCase()),
        p_failure_message: String(payload.resultMsg ?? "결제를 완료하지 못했습니다.").slice(0, 300),
        p_raw_payload: cleanProviderPayload(payload),
        p_expected_status: row!.status,
      });
      if (error) throw error;
    } else {
      await db.from("payments").update({
        raw_result_code: String(payload.resultCode ?? status).slice(0, 100),
        raw_payload: cleanProviderPayload(payload),
        failure_code: "NICEPAY_STATUS_REVIEW",
        failure_message: `나이스페이먼츠 상태(${String(payload.status ?? "unknown")})를 관리자에서 확인해 주세요.`,
        updated_at: new Date().toISOString(),
      }).eq("id", row!.id);
      await db.from("audit_logs").insert({
        actor: "nicepay",
        action: "NICEPAY_WEBHOOK_REVIEW_REQUIRED",
        target_type: "reservation",
        target_id: row!.reservation_id,
        metadata: cleanProviderPayload(payload),
      });
    }
  } catch (error) {
    console.error("nicepay webhook", error);
    return new Response("ERROR", { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
