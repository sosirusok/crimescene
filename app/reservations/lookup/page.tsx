import type { Metadata } from "next";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { ReservationLookup } from "./reservation-lookup";

export const metadata: Metadata = { title: "예약 확인 및 취소" };
export default function LookupPage() { return <main><SiteHeader /><section className="page-hero lookup-page-hero"><div className="shell"><p className="eyebrow">Find reservation</p><h1>예약 확인</h1><p>기존 사이트와 같은 방식으로 예약자 이름과 휴대폰 번호만 입력해 조회할 수 있습니다.</p></div></section><ReservationLookup /><SiteFooter /></main>; }
