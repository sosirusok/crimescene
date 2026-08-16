const fs = require("node:fs");
const path = "pages-src/customer-final.js";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  [
    "이름과 휴대폰 번호를 예약 확인, 변경·취소 및 운영 안내에 사용합니다. 관련 법령에 따른 보관 기간 후 파기합니다.",
    "수집 항목: 이름, 휴대폰 번호, 예약 내용, 요청사항. 예약 확인·변경·취소와 운영 안내에 사용하며 계약·취소 기록은 5년간 보관합니다. 동의를 거부할 수 있으나 필수 정보라 예약은 진행할 수 없습니다.",
  ],
  [
    "문의 답변을 위한 개인정보 수집·이용에 동의합니다.",
    "수집 항목: 이름, 휴대폰 번호, 문의 내용. 문의 확인과 답변에 사용하며 분쟁 처리 기록은 3년간 보관합니다. 동의를 거부할 수 있으나 문의 접수는 진행할 수 없습니다.",
  ],
  [
    "예약 계약 및 취소 관련 기록과 결제·서비스 제공 기록은 관계 법령에 따라 필요한 기간 동안 보관합니다. 소비자 불만 또는 분쟁 처리 기록은 3년간 보관하며, 법령상 의무가 없는 정보는 이용 목적이 끝난 뒤 지체 없이 파기합니다.",
    "계약 또는 청약철회·예약 취소 기록과 대금결제 및 서비스 제공 기록은 5년, 소비자 불만 또는 분쟁 처리 기록은 3년간 보관합니다. 그 밖에 법령상 보존 의무가 없는 정보는 이용 목적이 끝난 뒤 지체 없이 파기합니다.",
  ],
  ["결제 예정 금액", "이용 예정 금액"],
];

for (const [before, after] of replacements) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`Expected exactly one match for: ${before} (found ${matches})`);
  }
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);
console.log("Final customer consent and amount wording updated.");
