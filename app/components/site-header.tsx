"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Close, Menu } from "./icons";

const links = [["사건 소개", "/themes"], ["실시간 예약", "/reservations"], ["예약 확인", "/reservations/lookup"], ["오시는 길", "/location"], ["안내", "/guide"]];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className={`site-header ${solid ? "is-solid" : ""}`}>
      <div className="visitor-notice" role="note" aria-label="필수 이용 안내">
        <div className="visitor-notice-inner">
          <strong>크라임씬 카페 안내</strong>
          <span>방탈출카페가 아닙니다. 사건 속 인물이 되어 단서와 진술로 범인을 찾는 추리게임입니다.</span>
          <Link href="/policies/refunds">이용 당일 고객 사유 취소는 환불되지 않습니다.</Link>
        </div>
      </div>
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="크라임씬플레이 홈">
          <span className="brand-mark"><img src="/favicon.svg" alt="" /></span>
          <span className="brand-copy"><b>CRIME SCENE</b><small>SEOMYEON · ROLEPLAY MYSTERY</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="주 메뉴">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        <div className="header-actions">
          <a className="phone-link" href="tel:07043044340"><small>서면1호점</small><strong>070-4304-4340</strong></a>
          <Link className="header-book" href="/reservations">예약하기 <ArrowUpRight /></Link>
          <button className="menu-button" type="button" onClick={() => setOpen(true)} aria-label="메뉴 열기"><Menu /></button>
        </div>
      </div>
      <div className={`mobile-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="drawer-top"><span>MENU</span><button type="button" onClick={() => setOpen(false)} aria-label="메뉴 닫기"><Close /></button></div>
        <nav>{links.map(([label, href], i) => <Link key={href} href={href} onClick={() => setOpen(false)}><span>0{i + 1}</span>{label}<ArrowUpRight /></Link>)}</nav>
        <div className="drawer-contact"><small>서면1호점 예약 문의</small><a href="tel:07043044340">070-4304-4340</a></div>
      </div>
    </header>
  );
}
