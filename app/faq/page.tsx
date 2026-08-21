import type { Metadata } from "next";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { InquiryForm } from "./inquiry-form";

export const metadata: Metadata = { title: "자주 묻는 질문 | 크라임씬플레이" };

const questions = [
  ["어떤 게임인가요?", "각자 사건 속 인물을 맡아 현장을 조사하고, 단서와 진술을 바탕으로 용의자 중 진범을 찾는 크라임씬 추리게임입니다. 탈출이 목표인 게임이 아닙니다."],
  ["몇 명부터 예약할 수 있나요?", "권장 인원은 4–5명입니다. 1–3명은 오픈룸을 선택하면 같은 회차를 예약한 다른 플레이어와 함께 진행합니다."],
  ["소요 시간은 얼마나 되나요?", "게임 진행과 사전 안내를 포함해 총 90분입니다. 원활한 안내를 위해 시작 10분 전까지 도착해 주세요."],
  ["추리 경험이 없어도 참여할 수 있나요?", "가능합니다. 현장에서 진행 방식과 역할을 안내하며, 각 사건의 난이도는 사건 소개 페이지에서 확인할 수 있습니다."],
  ["당일에 예약을 취소하면 환불되나요?", "이용 당일 고객 사유 취소와 무단 불참은 환불되지 않습니다. 예약 전 일정과 인원을 반드시 확인해 주세요."],
  ["예약을 직접 취소할 수 있나요?", "예약자 이름과 휴대폰 번호로 예약을 조회한 뒤 게임 시작 24시간 전까지 직접 취소할 수 있습니다. 이후 취소는 매장으로 문의해 주세요."],
  ["결제는 어떻게 하나요?", "온라인 결제가 활성화된 경우 나이스페이먼츠의 안전한 결제창에서 국내 일반 신용·체크카드로 결제합니다. 결제 기능이 준비되기 전에는 방문 당일 매장에서 결제합니다."],
  ["주차가 가능한가요?", "전용 주차장은 제공하지 않습니다. 서면역 인근 유료 주차장 또는 대중교통 이용을 권장합니다."],
];

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="page-hero support-page-hero">
          <div className="shell"><p className="eyebrow">Before the case</p><h1>자주 묻는 질문</h1><p>게임 방식과 예약 전 반드시 확인할 내용을 정리했습니다.</p></div>
        </section>
        <section className="section support-section">
          <div className="shell faq-layout">
            <div className="faq-list">{questions.map(([question, answer], index) => <details key={question} open={index === 0}><summary><span>{String(index + 1).padStart(2, "0")}</span>{question}<i>+</i></summary><p>{answer}</p></details>)}</div>
            <InquiryForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
