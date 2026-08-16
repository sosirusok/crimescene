"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "../../components/icons";
import { themes } from "../../data/themes";

export function ReservationForm() {
  const searchParams = useSearchParams();
  const params = { theme: searchParams.get("theme")?.toUpperCase() ?? "", date: searchParams.get("date") ?? "", time: searchParams.get("time") ?? "" };
  const [partySize, setPartySize] = useState(4);
  const [openRoom, setOpenRoom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const theme = useMemo(() => themes.find((item) => item.id === params.theme), [params.theme]);
  const effectiveOpenRoom = partySize < 4 || openRoom;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = { themeId: params.theme, playDate: params.date, startTime: params.time, customerName: form.get("customerName"), phone: form.get("phone"), partySize, openRoom: effectiveOpenRoom, specialRequest: form.get("specialRequest"), privacyConsent: form.get("privacyConsent") === "on", cancellationConsent: form.get("cancellationConsent") === "on" };
    try { const response = await fetch("/api/reservations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); sessionStorage.setItem("crimescene-last-reservation", JSON.stringify(body)); window.location.href = "/reservations/complete"; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "예약을 완료하지 못했습니다."); setSubmitting(false); }
  }

  if (!theme || !params.date || !params.time) return <section className="section reservation-form-section"><div className="shell invalid-selection"><h2>선택한 예약 정보를 확인할 수 없습니다.</h2><Link className="button button-primary" href="/reservations">예약 현황으로 돌아가기</Link></div></section>;
  return <section className="section reservation-form-section"><div className="shell booking-layout">
    <aside className="booking-summary"><img src={theme.image} alt=""/><div className="booking-summary-copy"><p className="eyebrow">Selected case</p><h2>{theme.shortTitle}</h2><dl><div><dt>예약일</dt><dd>{params.date}</dd></div><div><dt>시작 시간</dt><dd>{params.time}</dd></div><div><dt>진행 시간</dt><dd>90분</dd></div><div><dt>지점</dt><dd>서면1호점</dd></div></dl><Link href={`/reservations?theme=${theme.id}`}>일정 다시 선택</Link></div></aside>
    <form className="booking-form" onSubmit={submit}><div className="form-heading"><span>01</span><div><h2>예약자 정보</h2><p>예약 확인 시 같은 이름과 휴대폰 번호가 필요합니다.</p></div></div>
      <div className="field-grid"><label><span>예약자 이름 <i>필수</i></span><input name="customerName" minLength={2} maxLength={20} placeholder="이름을 입력해 주세요" required /></label><label><span>휴대폰 번호 <i>필수</i></span><input name="phone" inputMode="numeric" pattern="01[0-9]{8,9}" placeholder="01012345678" required /></label></div>
      <div className="form-heading second"><span>02</span><div><h2>인원 및 방식</h2><p>4명 미만은 오픈룸으로만 예약할 수 있습니다.</p></div></div>
      <div className="party-picker">{[1,2,3,4,5].map((count) => <button className={partySize === count ? "is-selected" : ""} type="button" key={count} onClick={() => setPartySize(count)}><strong>{count}</strong><span>명</span></button>)}</div>
      <label className={`open-room-option ${effectiveOpenRoom ? "is-selected" : ""}`}><input type="checkbox" checked={effectiveOpenRoom} disabled={partySize < 4} onChange={(event) => setOpenRoom(event.target.checked)} /><span className="custom-check"/><div><strong>오픈룸으로 예약</strong><p>남은 자리에 다른 플레이어가 참여할 수 있습니다. 1–3명 예약 시 필수입니다.</p></div></label>
      <label className="textarea-field"><span>전달사항 <small>선택</small></span><textarea name="specialRequest" maxLength={300} placeholder="오픈룸 참여자 또는 매장에 전달할 내용을 입력해 주세요." /></label>
      <div className="price-summary"><span>결제 예정 금액</span><strong>{(theme.price * partySize).toLocaleString()}원</strong><small>23,000원 × {partySize}명</small></div>
      <div className="payment-note"><strong>KISPG 카드 결제</strong><p>일반 국내 신용·체크카드 결제 구조로 준비되어 있습니다. 가맹점 계약 정보가 연결되면 예약 접수 후 KISPG 결제창으로 자동 이동합니다.</p></div>
      <div className="consent-list"><label><input type="checkbox" name="privacyConsent" required/><span/>개인정보 수집 및 이용에 동의합니다. <Link href="/policies/privacy" target="_blank">내용 보기</Link></label><label><input type="checkbox" name="cancellationConsent" required/><span/>취소 및 환불 규정을 확인했습니다. <Link href="/policies/refunds" target="_blank">내용 보기</Link></label></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="submit-booking" type="submit" disabled={submitting}><span>{submitting ? "예약을 저장하고 있습니다" : "예약 접수하기"}</span><strong>{(theme.price * partySize).toLocaleString()}원</strong><ArrowUpRight /></button>
    </form>
  </div></section>;
}
