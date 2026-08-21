# 크라임씬플레이 서면1호점 고객 사이트

크라임씬플레이 서면1호점의 GitHub Pages 고객 사이트입니다. 사건 소개, 실시간 예약, 예약 정보 입력, 이름·휴대폰 번호 기반 예약 확인·취소, 공지, FAQ·문의, 이용 안내, 오시는 길과 정책 페이지를 제공합니다.

## 현재 운영 기능

- 운영 설정을 따르는 예약 가능 기간(현재 30일)과 날짜별 실시간 회차
- 4개 사건의 정원·가격·시간표와 오픈룸 모집/합류 상태
- 1~3명 오픈룸 예약, 4명 이상 단독팀 또는 오픈룸 선택
- 예약번호를 고객에게 노출하지 않는 이름·휴대폰 번호 조회
- Supabase PostgreSQL 좌석 동시성 제어, 연락처 보호 저장, 공지·문의 저장
- KISPG 연동 전 매장 결제, 추후 카드 결제를 붙일 수 있는 결제 상태 모델
- 실제 Google 지도와 네이버 지도 연결

## GitHub Pages 배포 소스

```text
pages-src/customer-final.js   고객 화면과 예약 기능
pages-src/final.css           공통 디자인
pages-src/customer-polish.css 브랜드·폰트·모바일 가독성 보강
pages-src/shell.html          HTML 문서 셸
pages-src/build.mjs           17개 정적 페이지 빌드
public/images/                사이트 이미지
public/fonts/                 self-hosted Pretendard 웹폰트
.github/workflows/pages.yml   빌드·검증·GitHub Pages 배포
```

로컬 검증:

```bash
node pages-src/build.mjs
node scripts/smoke-customer.cjs
node --check _site/assets/customer-final.js
```

`main`에 반영되면 GitHub Actions가 고객 API, CORS, 오픈룸 응답과 생성 파일을 검증한 뒤 GitHub Pages에 배포합니다. Supabase 운영 함수의 현재 소스는 `supabase/functions/api`와 `supabase/functions/customer-api`에 동기화되어 있으며, 비밀키는 저장소에 포함하지 않습니다.
