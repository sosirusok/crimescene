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

`main`에 반영되면 GitHub Actions가 고객 API, CORS, 오픈룸 응답과 생성 파일을 검증한 뒤 GitHub Pages에 배포합니다. Supabase 운영 함수의 소스는 `supabase/functions/api`와 `supabase/functions/customer-api`이며, 아래 워크플로가 운영 프로젝트에 배포합니다. 비밀키는 저장소에 포함하지 않습니다.

## Supabase 함수 배포

`.github/workflows/supabase-functions.yml`은 `main`에 `supabase/functions/**`, 이 워크플로 또는 배포 스크립트(`scripts/verify-supabase-functions.py`, `scripts/supabase-functions-revision.py`와 그 테스트) 변경이 반영되면 실행됩니다.

1. Deno로 두 함수를 타입 검사하고 `supabase/functions/tests`의 단위 테스트(기존 코드 `210e83a`와 응답을 비교하는 golden 테스트 포함)를 실행합니다. 이어서 `scripts/supabase-functions-revision.py check`로 `REVISION`이 올라갔는지 확인합니다.
2. Supabase CLI로 `api`, `customer-api` 순서로 운영 프로젝트(`jhjbiejqtbidloxcwryr`)에 배포합니다. 고객 사이트는 JWT 없이 호출하므로 항상 `--no-verify-jwt`로 배포합니다.
3. `scripts/verify-supabase-functions.py`로 실서비스를 확인합니다. 두 함수의 `/health`(version `5.0.0`과 새 `revision`), 한국어 도메인 CORS, `apikey` 없는 `bootstrap`·오늘 `availability`·`notices` 응답, `customer-api`의 `/admin/*` 404, `api` 관리자 경로 401, 가짜 이름·번호 예약 조회(빈 목록), 잘못된 예약 요청 400을 봅니다. 예약·문의·결제를 만드는 요청은 보내지 않습니다.

`supabase/functions/api` 또는 `supabase/functions/customer-api`를 바꾸는 커밋은 `supabase/functions/api/router.ts`의 `REVISION`을 새 값으로 올려야 합니다. 한 `REVISION` 값은 한 가지 소스만 가리켜야 하며, 이전 커밋과 같은 값으로 소스가 다르면 배포 전에 실패합니다(`main`의 first-parent 이력 기준이라 squash·merge 커밋 안의 중간 커밋은 보지 않습니다). 배포 확인은 두 함수가 이 값을 응답할 때까지 최대 3분 기다립니다(`version`은 `5.0.0` 유지).

**최초 1회 설정:** <https://supabase.com/dashboard/account/tokens>에서 개인 액세스 토큰을 만들고, GitHub 저장소 Settings → Secrets and variables → Actions → New repository secret에 이름 `SUPABASE_ACCESS_TOKEN`으로 저장합니다. 토큰이 없으면 검사와 테스트만 하고 경고를 남긴 뒤 배포 없이 성공으로 끝납니다. 토큰을 저장한 뒤에는 이전 실행을 Re-run하지 말고 Actions → Deploy Supabase functions → Run workflow에서 `main`을 골라 새로 실행합니다.

**수동 실행:** Actions 탭 → Deploy Supabase functions → Run workflow에서 `main`을 고릅니다(`gh workflow run supabase-functions.yml --ref main`). `main`이 아닌 브랜치는 검사만 하며 별도 동시 실행 그룹을 쓰므로 대기 중인 `main` 배포를 취소하지 않습니다. 배포는 한 번에 하나만 실행되며 진행 중인 배포는 취소되지 않습니다. 배포 중에 여러 번 push하면 GitHub가 대기 중인 이전 실행을 취소하고 가장 최근 실행만 기다립니다. Re-run은 원래 실행의 커밋을 그대로 쓰므로, 배포 직전에 GitHub API로 지금 `main` 끝 커밋을 읽어 그 커밋과 `api`·`customer-api` 소스가 다르면 오래된 코드를 올리지 않도록 배포를 건너뛰고 경고를 남깁니다(소스가 같고 클라이언트 파일만 달라졌으면 그대로 배포). 그때는 위 방법으로 `main`을 새로 실행합니다.

**롤백:** 배포 전에 운영 함수의 `/health`가 응답하는 `revision`을 읽고, `main` 이력에서 같은 `revision`을 가진 가장 최근 커밋을 롤백 대상으로 고릅니다(`revision`이 없는 현재 운영 코드는 `REVISION` 도입 직전 커밋). push 이전 커밋이나 `HEAD~1`을 쓰지 않으므로 배포되지 않았거나 실패했던 커밋으로 돌아가지 않습니다. 배포 단계나 실서비스 확인이 실패하거나(단계별 시간 초과 포함) 작업이 취소되면 그 커밋의 함수를 별도 디렉터리에 체크아웃해 다시 배포하고, 두 함수의 `/health`가 그 `revision`으로 돌아왔는지 확인한 뒤 작업을 실패로 표시합니다. 운영 상태를 알 수 없거나(응답 없음, 두 함수의 `revision` 불일치, 이력에 없는 `revision`, 같은 `revision`이 서로 다른 소스에 쓰인 경우) 이 커밋이 이미 운영 중이면 자동 롤백 없이 배포만 하고, 실패 시 그 사유를 오류로 남깁니다. 특정 변경을 직접 되돌리려면 그 커밋을 `git revert`해 `main`에 push하면 같은 워크플로가 배포합니다. 모든 단계에 개별 시간 제한이 있고 그 합이 작업 시간 제한(90분)보다 작아서, 멈춘 단계는 작업 전체가 끊기기 전에 실패로 끝나고 롤백이 실행됩니다. 롤백 중에 Cancel을 눌러도 롤백과 재확인은 계속되며, 꼭 멈춰야 할 때만 Force cancel을 씁니다.

```bash
DENO_NO_PACKAGE_JSON=1 deno check --node-modules-dir=none supabase/functions/api/index.ts supabase/functions/customer-api/index.ts
DENO_NO_PACKAGE_JSON=1 deno test --node-modules-dir=none -A supabase/functions/tests/
python3 scripts/test_supabase_functions_revision.py
python3 scripts/supabase-functions-revision.py check  # 전체 이력 필요(shallow clone 불가)
python3 scripts/verify-supabase-functions.py --expect-revision-from supabase/functions/api/router.ts  # 운영 확인(읽기 전용)
```

NICEPAY 가맹점 키 등록과 실결제 전환 절차는 [`docs/NICEPAY_SETUP.md`](docs/NICEPAY_SETUP.md)를 따릅니다.
