# 크라임씬플레이 서면1호점 고객 사이트

크라임씬플레이 서면1호점의 GitHub Pages 고객 사이트입니다. 사건 소개, 실시간 예약, 예약 정보 입력, 이름·휴대폰 번호 기반 예약 확인·취소, 공지, FAQ·문의, 이용 안내, 오시는 길과 정책 페이지를 제공합니다.

## 현재 운영 기능

- 오늘부터 15일 이내 날짜별 실시간 예약 회차
- 4개 사건의 정원·가격·시간표와 오픈룸 모집/합류 상태
- 1~3명 오픈룸 예약, 4명 이상 단독팀 또는 오픈룸 선택
- 이름과 휴대폰 번호만 사용하는 간편 예약 조회
- Supabase PostgreSQL 좌석 동시성 제어, 연락처 보호 저장, 공지·문의 저장
- NICEPAY 키가 없으면 매장 결제, 키를 등록하면 국내 일반 신용·체크카드 온라인 결제
- 실제 Google 지도와 네이버 지도 연결

## GitHub Pages 배포 소스

```text
pages-src/customer-final.js   고객 화면과 예약 기능
pages-src/final.css           공통 디자인
pages-src/customer-polish.css 브랜드·폰트·모바일 가독성 보강
pages-src/shell.html          HTML 문서 셸
pages-src/build.mjs           17개 정적 페이지 빌드
public/images/                사이트 이미지와 예약 시간표용 썸네일(*-thumb.webp)
public/fonts/                 self-hosted Pretendard 웹폰트와 사이트 글자 부분 폰트(SiteSubset-*.woff2)
scripts/subset-fonts.py       사이트 글자 부분 폰트와 @font-face 규칙 생성
.github/workflows/pages.yml   빌드·검증·GitHub Pages 배포
```

로컬 검증:

```bash
node pages-src/build.mjs
node scripts/smoke-customer.cjs
node scripts/smoke-responsive.cjs
node --check _site/assets/customer-final.js
```

### 웹폰트 부분 집합

Pretendard 전체 파일은 굵기마다 약 270KB입니다. 그래서 사이트 문구에 쓰이는 글자만 담은 `public/fonts/SiteSubset-*.woff2`(굵기마다 약 49KB)를 `customer-polish.css`에 먼저 선언하고, 나머지 글자는 기존 `Pretendard-*.woff2`가 unicode-range로 맡습니다. 예약자 이름이나 새 공지처럼 부분 집합에 없는 글자가 나오면 그 굵기의 전체 파일만 추가로 내려받으므로 글꼴은 항상 Pretendard로 표시됩니다. 부분 집합은 OFL의 예약 글꼴 이름 규정에 따라 폰트 내부 이름을 `SiteSubset`으로 바꿔 둡니다.

고객 화면 문구(`customer-final.js`, `shell.html`, `build.mjs`, CSS)를 바꾼 뒤에는 다시 생성해 함께 커밋합니다. 사건 소개·공지 문구가 바뀌었다면 `--api`를 붙여 실서비스의 공개 GET 응답에서 글자를 다시 받아 `scripts/subset-fonts-api.txt`에 저장합니다.

```bash
pip install fonttools brotli
python3 scripts/subset-fonts.py        # 소스 문구와 저장된 API 글자로 생성
python3 scripts/subset-fonts.py --api  # 사건 소개·공지 글자를 새로 받아 생성
```

사이트 문구의 글자가 부분 집합에서 빠지면 `node scripts/smoke-responsive.cjs`가 실패합니다.

### 예약 시간표 썸네일

예약 시간표의 작은 사건 이미지는 `public/images/theme-*-thumb.webp`(480px 폭)를 씁니다. 썸네일이 없으면 원본 이미지로 바뀌어 표시되지만, 새 사건 이미지를 추가할 때는 썸네일도 함께 만들어 주세요.

```bash
python3 - public/images/theme-new.webp <<'PY'
import sys
from PIL import Image
for path in sys.argv[1:]:
    image = Image.open(path)
    image.resize((480, round(image.height * 480 / image.width)), Image.LANCZOS).save(path.replace(".webp", "-thumb.webp"), quality=78, method=6)
PY
```

`main`에 반영되면 GitHub Actions가 고객 API, CORS, 오픈룸 응답과 생성 파일을 검증한 뒤 GitHub Pages에 배포합니다. Supabase 운영 함수의 현재 소스는 `supabase/functions/api`와 `supabase/functions/customer-api`에 동기화되어 있으며, 비밀키는 저장소에 포함하지 않습니다.

NICEPAY 가맹점 키 등록과 실결제 전환 절차는 [`docs/NICEPAY_SETUP.md`](docs/NICEPAY_SETUP.md)를 따릅니다.
