import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Clock, Users } from "../../components/icons";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { getTheme, themes } from "../../data/themes";

export function generateStaticParams() { return themes.map((theme) => ({ slug: theme.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const theme = getTheme(slug); return { title: theme?.shortTitle ?? "사건 소개" }; }

export default async function ThemeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const theme = getTheme(slug);
  if (!theme) notFound();
  return <main><SiteHeader />
    <section className="theme-detail-hero" style={{ "--theme-accent": theme.accent } as CSSProperties}><img src={theme.image} alt="" /><div className="theme-detail-overlay"/><div className="shell theme-detail-copy"><p className="eyebrow">Crime scene · Episode {theme.episode}</p><h1>{theme.shortTitle}</h1><blockquote>{theme.tagline}</blockquote><Link className="button button-primary" href={`/reservations?theme=${theme.id}`}>이 사건 예약하기 <ArrowUpRight /></Link></div><div className="theme-detail-number">EP.{theme.episode}</div></section>
    <section className="section theme-brief"><div className="shell theme-brief-grid"><div><p className="eyebrow">Case synopsis</p><h2>사건 개요</h2><p className="synopsis">{theme.synopsis}</p><p className="spoiler-note">몰입을 위해 공개 정보는 최소화했습니다. 세부 배역과 단서는 현장에서 제공됩니다.</p></div><aside><div><Clock /><span>진행 시간</span><strong>{theme.duration}분</strong></div><div><Users /><span>권장 인원</span><strong>{theme.players}</strong></div><div><span className="price-icon">₩</span><span>이용 요금</span><strong>1인 {theme.price.toLocaleString()}원</strong></div></aside></div></section>
    <section className="section detail-process"><div className="shell"><p className="eyebrow">Before entering</p><h2>입장 전 확인하세요</h2><div className="notice-cards"><article><span>01</span><h3>10분 전 도착</h3><p>배역 배정과 사전 설명이 있으므로 예약 시간 10분 전까지 도착해 주세요.</p></article><article><span>02</span><h3>스포일러 금지</h3><p>모든 콘텐츠와 소품은 다음 플레이어를 위해 촬영하거나 외부에 공개할 수 없습니다.</p></article><article><span>03</span><h3>오픈룸 가능</h3><p>4명 미만이라면 오픈룸으로 예약해 다른 플레이어와 함께 사건을 진행할 수 있습니다.</p></article></div></div></section>
    <section className="section next-case"><div className="shell"><p>CASE {theme.id} / EPISODE {theme.episode}</p><h2>준비되셨습니까?</h2><Link className="button button-light" href={`/reservations?theme=${theme.id}`}>예약 가능한 시간 보기 <ArrowUpRight /></Link></div></section><SiteFooter /></main>;
}
