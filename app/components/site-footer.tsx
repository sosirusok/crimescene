import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-brand"><strong>CRIME<br />SCENE</strong><span>ROLEPLAY<br />MYSTERY</span></div>
        <div className="footer-links">
          <div><b>EXPLORE</b><Link href="/themes">사건 소개</Link><Link href="/reservations">실시간 예약</Link><Link href="/location">오시는 길</Link></div>
          <div><b>SUPPORT</b><Link href="/guide">이용 안내</Link><Link href="/notices">공지사항</Link><Link href="/faq">자주 묻는 질문</Link></div>
          <div><b>CONTACT</b><a href="tel:07043044340">070-4304-4340</a><a href="mailto:dbsehrud93@naver.com">dbsehrud93@naver.com</a><span>부산광역시 부산진구 신천대로50번길 64, 4층</span></div>
        </div>
      </div>
      <div className="shell footer-bottom">
        <p>크라임씬플레이 · 대표 윤호권 · 사업자등록번호 839-87-00850</p>
        <div><Link href="/policies/terms">이용약관</Link><Link href="/policies/privacy">개인정보처리방침</Link><Link href="/policies/refunds">취소 및 환불 규정</Link></div>
        <p>© CRIME SCENE PLAY</p>
      </div>
    </footer>
  );
}
