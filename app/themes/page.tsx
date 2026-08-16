import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "../components/icons";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { themes } from "../data/themes";

export const metadata: Metadata = { title: "사건 소개" };

export default function ThemesPage() {
  return <main><SiteHeader />
    <section className="page-hero compact-hero"><div className="shell"><p className="eyebrow">Case archive</p><h1>사건 기록 보관소</h1><p>각 사건은 서로 다른 인물, 단서, 관계로 구성됩니다.<br />결말은 여러분의 선택으로 완성됩니다.</p></div></section>
    <section className="section theme-list-section"><div className="shell theme-list">
      {themes.map((theme, index) => <article className="theme-row" key={theme.id}>
        <Link className="theme-row-image" href={`/themes/${theme.slug}`}><img src={theme.image} alt="" /><span>CASE 0{index + 1}</span></Link>
        <div className="theme-row-copy"><p className="eyebrow">EP.{theme.episode}</p><h2>{theme.shortTitle}</h2><blockquote>{theme.tagline}</blockquote><p>{theme.synopsis}</p><dl><div><dt>난이도</dt><dd>{theme.difficulty}</dd></div><div><dt>인원</dt><dd>{theme.players}</dd></div><div><dt>시간</dt><dd>{theme.duration}분</dd></div></dl><div className="row-actions"><Link className="button button-primary" href={`/reservations?theme=${theme.id}`}>예약하기 <ArrowUpRight /></Link><Link className="text-link" href={`/themes/${theme.slug}`}>사건 자세히 보기</Link></div></div>
      </article>)}
    </div></section><SiteFooter /></main>;
}
