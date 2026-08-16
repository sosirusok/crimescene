import type { Metadata } from "next";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { ReservationBoard } from "./reservation-board";

export const metadata: Metadata = { title: "실시간 예약" };

export default function ReservationsPage() {
  return <main><SiteHeader /><section className="page-hero reservation-page-hero"><div className="shell"><p className="eyebrow">Live reservation</p><h1>실시간 예약</h1><p>날짜와 사건을 선택하면 예약 가능한 시간이 바로 표시됩니다.</p></div></section><ReservationBoard /><SiteFooter /></main>;
}
