import type { Metadata } from "next";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { ReservationComplete } from "./reservation-complete";

export const metadata: Metadata = { title: "예약 접수 완료" };
export default function CompletePage() { return <main><SiteHeader /><ReservationComplete /><SiteFooter /></main>; }
