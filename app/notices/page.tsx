import type { Metadata } from "next";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { NoticeList } from "./notice-list";

export const metadata: Metadata = { title: "공지사항 | 크라임씬플레이" };

export default function NoticesPage() {
  return <><SiteHeader /><main><section className="page-hero support-page-hero"><div className="shell"><p className="eyebrow">Operations desk</p><h1>공지사항</h1><p>사건 진행, 예약, 결제와 관련된 운영 공지를 확인해 주세요.</p></div></section><NoticeList /></main><SiteFooter /></>;
}
