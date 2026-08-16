import type { Metadata } from "next";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { ReservationForm } from "./reservation-form";

export const metadata: Metadata = { title: "예약 정보 입력" };

export default function NewReservationPage() { return <main><SiteHeader /><section className="page-hero form-page-hero"><div className="shell"><p className="eyebrow">Reservation details</p><h1>예약 정보 입력</h1><p>선택한 일정을 확인하고 예약자 정보를 입력해 주세요.</p></div></section><ReservationForm /><SiteFooter /></main>; }
