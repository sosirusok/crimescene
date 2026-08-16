import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";

export function PolicyPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated: string; children: ReactNode }) {
  return <><SiteHeader /><main><section className="page-hero policy-page-hero"><div className="shell"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>시행일 및 최종 업데이트: {updated}</p></div></section><section className="section policy-section"><div className="shell policy-layout"><aside><b>POLICY INDEX</b><Link href="/policies/terms">이용약관</Link><Link href="/policies/privacy">개인정보처리방침</Link><Link href="/policies/refunds">취소 및 환불 규정</Link><small>본 문서는 서비스 운영을 위한 초안이며, 실제 결제 계약과 운영 정책 확정 시 최종 법률 검토가 필요합니다.</small></aside><article>{children}</article></div></section></main><SiteFooter /></>;
}
