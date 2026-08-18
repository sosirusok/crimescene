import Link from "next/link";
import { ArrowUpRight, Clock, Fingerprint, Users } from "./components/icons";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { themes } from "./data/themes";

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-media" aria-hidden="true" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="shell hero-inner">
          <div className="hero-copy">
            <p className="eyebrow"><span>부산 서면</span> Roleplay Mystery</p>
            <h1 id="hero-title">당신의 진술이<br />사건의 결말을 바꾼다</h1>
            <p className="hero-lead">
              사건 속 인물이 되어 현장을 조사하고 단서와 진술을 검증하세요.<br />
              용의자 가운데 진짜 범인을 찾아내는 90분 크라임씬 추리게임입니다.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/reservations">실시간 예약 <ArrowUpRight /></Link>
              <Link className="button button-ghost" href="/themes">사건 파일 보기</Link>
            </div>
          </div>
          <aside className="hero-dossier" aria-label="이용 정보">
            <p className="dossier-label">Case briefing</p>
            <dl>
              <div><dt>플레이</dt><dd>90분</dd></div>
              <div><dt>인원</dt><dd>4–5명 권장</dd></div>
              <div><dt>이용료</dt><dd>1인 23,000원</dd></div>
              <div><dt>지점</dt><dd>부산 서면1호점</dd></div>
            </dl>
          </aside>
        </div>
        <a className="scroll-cue" href="#service-definition"><span>Scroll to investigate</span><i /></a>
      </section>

      <section className="service-definition" id="service-definition" aria-labelledby="service-definition-title">
        <div className="shell service-definition-inner">
          <div>
            <p className="eyebrow">Before you book</p>
            <h2 id="service-definition-title">사건 속 인물이 되어<br />범인을 찾는 크라임씬 카페입니다.</h2>
          </div>
          <div className="service-definition-copy">
            <p>잠금장치를 풀고 공간에서 나오는 방식이 아닙니다. 각자 맡은 인물의 비밀과 진술을 바탕으로 현장을 조사하고, 용의자 중 진범을 찾아내는 역할 추리게임입니다.</p>
            <p className="service-definition-warning"><strong>예약 전 확인</strong><span>이용 당일 고객 사유 취소와 무단 불참은 환불되지 않습니다.</span></p>
          </div>
        </div>
      </section>

      <section className="section intro-strip">
        <div className="shell stat-grid">
          <div><Fingerprint /><strong>직접 수사</strong><span>현장 조사와 증거 수집</span></div>
          <div><Users /><strong>인물 몰입</strong><span>각자의 비밀과 진술</span></div>
          <div><Clock /><strong>90분의 사건</strong><span>브리핑부터 최종 지목까지</span></div>
        </div>
      </section>

      <section className="section cases-section" id="cases">
        <div className="shell">
          <div className="section-heading split-heading">
            <div><p className="eyebrow">Open case files</p><h2>오늘, 어떤 사건에<br />투입되시겠습니까?</h2></div>
            <p>모든 사건은 독립적인 인물과 단서로 구성됩니다. 결말을 미리 알 수 없도록 사건 정보는 꼭 필요한 만큼만 공개합니다.</p>
          </div>
          <div className="case-grid">
            {themes.map((theme, index) => (
              <article className="case-card" key={theme.id}>
                <Link href={`/themes/${theme.slug}`} aria-label={`${theme.title} 상세 보기`}>
                  <img src={theme.image} alt="" />
                  <div className="case-shade" />
                  <div className="case-index">0{index + 1}</div>
                  <div className="case-content">
                    <p>EP.{theme.episode} · 난이도 {theme.difficulty}</p>
                    <h3>{theme.shortTitle}</h3>
                    <span>사건 파일 열기 <ArrowUpRight /></span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
          <div className="section-action"><Link className="text-link" href="/themes">모든 사건 자세히 보기 <ArrowUpRight /></Link></div>
        </div>
      </section>

      <section className="section experience-section">
        <div className="shell experience-grid">
          <div className="experience-title"><p className="eyebrow">The experience</p><h2>탈출이 목표가 아닙니다.<br />사건의 진실을 밝히는 게임입니다.</h2></div>
          <ol className="experience-list">
            <li><span>01</span><div><h3>인물을 배정받습니다</h3><p>사건 속 인물의 관계와 비밀을 확인하고, 자신의 방식으로 역할을 완성합니다.</p></div></li>
            <li><span>02</span><div><h3>현장을 조사합니다</h3><p>숨겨진 물건과 기록을 직접 찾아 서로의 진술을 검증합니다.</p></div></li>
            <li><span>03</span><div><h3>진범을 지목합니다</h3><p>수집한 단서를 조합해 최종 추리를 제시하면 사건의 전말이 공개됩니다.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="section reservation-cta">
        <div className="shell reservation-cta-inner">
          <div><p className="eyebrow">Your case awaits</p><h2>사건은 이미 시작되었습니다.</h2><p>원하는 날짜와 테마의 남은 시간을 바로 확인하세요.</p></div>
          <Link className="button button-light" href="/reservations">예약 가능한 시간 보기 <ArrowUpRight /></Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
