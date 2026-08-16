"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Reservation = { id: string; lookupCode: string; themeTitle: string; playDate: string; startTime: string; customerName: string; phoneMasked: string; partySize: number; openRoom: boolean; totalAmount: number; status: string; paymentStatus: string };
const statusLabels: Record<string, string> = { PENDING_PAYMENT: "결제 대기", CONFIRMED: "예약 확정", CANCEL_REQUESTED: "취소 처리 중", CANCELED: "예약 취소" };

export function ReservationLookup() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"lookup" | "cancel">(searchParams.get("tab") === "cancel" ? "cancel" : "lookup");
  const [identity, setIdentity] = useState({ customerName: "", phone: "" });
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try { const response = await fetch("/api/reservations/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(identity) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setReservations(body.reservations); if (!body.reservations.length) setMessage("입력한 정보와 일치하는 예약이 없습니다."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "예약을 조회하지 못했습니다."); } finally { setLoading(false); }
  }
  async function cancel(reservation: Reservation) {
    if (!window.confirm(`${reservation.playDate} ${reservation.startTime} 예약을 취소하시겠습니까?`)) return;
    setLoading(true); setError(""); setMessage("");
    try { const response = await fetch("/api/reservations/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...identity, lookupCode: reservation.lookupCode, reason: "고객 온라인 취소" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setReservations((current) => current.map((item) => item.id === reservation.id ? { ...item, status: body.status } : item)); setMessage(body.message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "취소 요청을 처리하지 못했습니다."); } finally { setLoading(false); }
  }

  return <section className="section lookup-section"><div className="shell lookup-shell">
    <div className="reservation-tabs"><Link href="/reservations">실시간 예약</Link><button className={tab === "lookup" ? "is-active" : ""} type="button" onClick={() => setTab("lookup")}>예약 확인</button><button className={tab === "cancel" ? "is-active" : ""} type="button" onClick={() => setTab("cancel")}>예약 취소</button></div>
    <div className="lookup-layout"><div className="lookup-copy"><p className="eyebrow">{tab === "lookup" ? "Reservation lookup" : "Cancellation"}</p><h2>{tab === "lookup" ? "예약 정보를 확인합니다." : "예약 취소를 요청합니다."}</h2><p>{tab === "lookup" ? "예약 시 입력한 이름과 휴대폰 번호를 동일하게 입력해 주세요." : "이용 24시간 전부터는 온라인 취소가 제한됩니다. 결제가 완료된 예약은 취소 접수 후 결제 승인 취소까지 시간이 걸릴 수 있습니다."}</p></div>
      <form className="lookup-form" onSubmit={lookup}><label><span>예약자 이름</span><input value={identity.customerName} onChange={(event) => setIdentity({ ...identity, customerName: event.target.value })} placeholder="예약자 이름" required /></label><label><span>휴대폰 번호</span><input value={identity.phone} onChange={(event) => setIdentity({ ...identity, phone: event.target.value })} inputMode="numeric" pattern="01[0-9]{8,9}" placeholder="01012345678" required /></label><button type="submit" disabled={loading}>{loading ? "조회하고 있습니다" : tab === "lookup" ? "예약 확인" : "취소할 예약 찾기"}</button></form></div>
    {error && <p className="lookup-feedback error" role="alert">{error}</p>}{message && <p className="lookup-feedback">{message}</p>}
    {reservations.length > 0 && <div className="lookup-results"><div className="results-heading"><span>조회 결과</span><strong>{reservations.length}건</strong></div>{reservations.map((reservation) => <article className="reservation-result" key={reservation.id}><div className="result-main"><span className={`status-badge status-${reservation.status.toLowerCase()}`}>{statusLabels[reservation.status] ?? reservation.status}</span><h3>{reservation.themeTitle}</h3><dl><div><dt>일정</dt><dd>{reservation.playDate} · {reservation.startTime}</dd></div><div><dt>인원</dt><dd>{reservation.partySize}명{reservation.openRoom ? " · 오픈룸" : ""}</dd></div><div><dt>예약자</dt><dd>{reservation.customerName} · {reservation.phoneMasked}</dd></div><div><dt>결제</dt><dd>{reservation.paymentStatus === "PAID" ? "결제 완료" : "결제 대기"} · {reservation.totalAmount.toLocaleString()}원</dd></div></dl></div>{tab === "cancel" && !["CANCELED", "CANCEL_REQUESTED"].includes(reservation.status) && <button className="cancel-reservation" type="button" onClick={() => cancel(reservation)}>예약 취소 요청</button>}</article>)}</div>}
  </div></section>;
}
