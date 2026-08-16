"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Result = { reservation: { themeTitle: string; playDate: string; startTime: string; partySize: number; totalAmount: number }; payment: { enabled: boolean } };

export function ReservationComplete() {
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const stored = sessionStorage.getItem("crimescene-last-reservation");
    if (stored) queueMicrotask(() => setResult(JSON.parse(stored)));
  }, []);
  return <section className="complete-section"><div className="complete-card">
    <span className="complete-seal">CASE<br/>FILED</span><p className="eyebrow">Reservation received</p><h1>예약이 접수되었습니다.</h1><p className="complete-lead">예약 확인과 취소는 예약자 이름과 휴대폰 번호로 간편하게 이용할 수 있습니다.</p>
    {result && <dl><div><dt>사건</dt><dd>{result.reservation.themeTitle}</dd></div><div><dt>일정</dt><dd>{result.reservation.playDate} · {result.reservation.startTime}</dd></div><div><dt>인원</dt><dd>{result.reservation.partySize}명</dd></div><div><dt>금액</dt><dd>{result.reservation.totalAmount.toLocaleString()}원</dd></div></dl>}
    <div className={`payment-state ${result?.payment.enabled ? "is-ready" : ""}`}><strong>{result?.payment.enabled ? "카드 결제 단계가 준비되었습니다." : "현재 결제는 활성화 준비 중입니다."}</strong><p>{result?.payment.enabled ? "KISPG 결제창에서 결제를 완료해 주세요." : "KISPG 가맹점 키 연결 후 카드 결제가 자동 활성화됩니다. 현재 접수 건은 결제 대기 상태로 저장되었습니다."}</p></div>
    <div className="complete-actions"><Link className="button button-primary" href="/reservations/lookup">예약 확인하기</Link><Link className="button button-ghost" href="/">홈으로</Link></div>
  </div></section>;
}
