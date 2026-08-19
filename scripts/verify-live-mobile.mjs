import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = (process.env.BASE_URL || "https://www.xn--oi2bkkl05a1gchcr33e50h.com/").replace(/\/?$/, "/");
const testDate = process.env.TEST_DATE || "2026-09-01";
const introduction = process.env.TEST_INTRO || "20대 두 명입니다. 추리는 처음이지만 즐겁게 참여하겠습니다.";
const outputDir = "verification-output";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert(size.content <= size.viewport + 2, `${label}: 가로 스크롤이 발생합니다 (${size.content}/${size.viewport}).`);
}

async function verifyMenu(page, label) {
  const button = page.getByRole("button", { name: "메뉴 열기" });
  await button.waitFor({ state: "visible", timeout: 20_000 });

  const buttonState = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const lines = [...element.querySelectorAll(".menu-lines i")].map((line) => {
      const box = line.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    return {
      width: rect.width,
      height: rect.height,
      hit: hit === element || element.contains(hit),
      lines,
    };
  });

  assert(buttonState.width >= 40 && buttonState.height >= 40, `${label}: 메뉴 버튼의 터치 영역이 너무 작습니다.`);
  assert(buttonState.hit, `${label}: 메뉴 버튼 위를 다른 요소가 가리고 있습니다.`);
  assert(buttonState.lines.length === 3, `${label}: 가로줄 세 개 아이콘이 아닙니다.`);
  assert(buttonState.lines.every((line) => line.width >= 16 && line.height >= 1), `${label}: 메뉴 아이콘 선이 정상 크기가 아닙니다.`);

  await button.tap();
  await page.waitForFunction(() => document.querySelector(".menu-open")?.getAttribute("aria-expanded") === "true");
  await page.waitForFunction(() => {
    const drawer = document.querySelector("#mobile-drawer");
    if (!drawer?.classList.contains("is-open")) return false;
    const rect = drawer.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.width >= 260;
  }, null, { timeout: 5_000 });

  const drawer = page.locator("#mobile-drawer");
  const drawerState = await drawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const visibleLinks = [...element.querySelectorAll("a")].filter((link) => {
      const style = getComputedStyle(link);
      const box = link.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    }).length;
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth, visibleLinks };
  });

  assert(drawerState.left >= -1, `${label}: 메뉴 왼쪽이 화면 밖으로 나갔습니다.`);
  assert(drawerState.right <= drawerState.viewport + 1, `${label}: 메뉴 오른쪽이 화면 밖으로 나갔습니다.`);
  assert(drawerState.visibleLinks >= 5, `${label}: 메뉴 항목이 정상적으로 표시되지 않습니다.`);
  await page.screenshot({ path: `${outputDir}/${label}-menu-open.png`, fullPage: false });

  await page.getByRole("button", { name: "메뉴 닫기" }).tap();
  await page.waitForFunction(() => document.querySelector(".menu-open")?.getAttribute("aria-expanded") === "false");
  await page.waitForFunction(() => !document.querySelector("#mobile-drawer")?.classList.contains("is-open"));
}

async function clickDate(page, value) {
  const [, monthRaw, dayRaw] = value.split("-");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const result = await page.evaluate(({ value, month, day }) => {
    const buttons = [...document.querySelectorAll("button")];
    const direct = buttons.find((button) =>
      button.dataset.date === value || button.dataset.value === value || button.getAttribute("value") === value
    );
    if (direct) {
      direct.click();
      return { found: true, method: "data", text: direct.textContent || "" };
    }

    const monthText = `${month}월`;
    const dayPattern = new RegExp(`(^|\\D)${day}(\\D|$)`);
    const byText = buttons.find((button) => {
      const text = (button.textContent || "").replace(/\s+/g, " ").trim();
      return text.includes(monthText) && dayPattern.test(text);
    });
    if (byText) {
      byText.click();
      return { found: true, method: "text", text: byText.textContent || "" };
    }
    return {
      found: false,
      buttons: buttons.map((button) => (button.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 80),
    };
  }, { value, month, day });
  assert(result.found, `${value} 날짜 버튼을 찾지 못했습니다. ${JSON.stringify(result.buttons || [])}`);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));

const report = {
  baseUrl,
  viewport: "390x844",
  testDate,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  const homeResponse = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  assert(homeResponse?.ok(), `고객 사이트 접속 실패: ${homeResponse?.status()}`);
  await page.waitForSelector("#app:not(:has(.boot-screen))", { timeout: 20_000 });
  await assertNoOverflow(page, "홈 화면");
  await verifyMenu(page, "home-mobile");
  report.checks.push("홈 화면 가로줄 세 개 메뉴 열기와 닫기 정상");

  const home = await bodyText(page);
  assert(home.includes("방탈출카페가 아닙니다"), "게임 방식 안내가 홈 화면에 없습니다.");
  assert(home.includes("이용 당일 고객 사유 취소는 환불되지 않습니다"), "당일 취소 안내가 홈 화면에 없습니다.");
  report.checks.push("게임 방식과 당일 취소 필수 안내 정상");

  const footer = page.locator(".site-footer");
  await footer.scrollIntoViewIfNeeded();
  const footerText = await footer.innerText();
  assert(footerText.includes("(주)싱글"), "사업자 상호가 푸터에 없습니다.");
  assert(footerText.includes("정지훈"), "대표자명이 푸터에 없습니다.");
  assert(footerText.includes("744-88-01446"), "사업자등록번호가 푸터에 없습니다.");
  assert(footerText.includes("jjhun65@hanmail.net"), "사업자 이메일이 푸터에 없습니다.");
  report.checks.push("사업자 정보 푸터 표시 정상");
  await page.screenshot({ path: `${outputDir}/home-full.png`, fullPage: true });

  await page.goto(`${baseUrl}themes/`, { waitUntil: "networkidle", timeout: 60_000 });
  await assertNoOverflow(page, "사건 목록");
  assert(!(await bodyText(page)).includes("난이도"), "사건 목록에 난이도가 남아 있습니다.");
  report.checks.push("사건 목록 난이도 제거 정상");

  await page.goto(`${baseUrl}themes/cabin/`, { waitUntil: "networkidle", timeout: 60_000 });
  await assertNoOverflow(page, "사건 상세");
  assert(!(await bodyText(page)).includes("난이도"), "사건 상세에 난이도가 남아 있습니다.");
  report.checks.push("사건 상세 난이도 제거 정상");

  await page.goto(`${baseUrl}reservations/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForSelector("button", { timeout: 20_000 });
  await assertNoOverflow(page, "실시간 예약");
  await verifyMenu(page, "reservation-mobile");
  report.checks.push("실시간 예약 화면 모바일 메뉴 정상");

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes(`/availability?date=${testDate}`) && response.ok(),
    { timeout: 30_000 },
  );
  await clickDate(page, testDate);
  await responsePromise;
  await page.waitForFunction((text) => document.body.innerText.includes(text), introduction, { timeout: 30_000 });

  const intro = page.getByText(introduction, { exact: false }).first();
  await intro.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outputDir}/open-room-introduction-schedule.png`, fullPage: true });
  report.checks.push("손님이 작성한 오픈룸 소개가 예약 시간표에 표시됨");

  const opened = await page.evaluate((text) => {
    const node = [...document.querySelectorAll("span,p")].find((element) => (element.textContent || "").includes(text));
    const link = node?.closest("a.slot") || node?.closest("a") || node?.closest(".slot")?.querySelector("a");
    if (!link) return false;
    link.click();
    return true;
  }, introduction);
  assert(opened, "소개가 표시된 오픈룸 회차를 열지 못했습니다.");
  await page.waitForURL(/\/reservations\/new\//, { timeout: 30_000 });
  await page.waitForFunction((text) => document.body.innerText.includes(text), introduction, { timeout: 30_000 });
  await assertNoOverflow(page, "예약 입력");
  await page.screenshot({ path: `${outputDir}/open-room-introduction-form.png`, fullPage: true });
  report.checks.push("손님이 작성한 오픈룸 소개가 합류 예약 화면에도 표시됨");

  assert(pageErrors.length === 0, `브라우저 실행 오류: ${pageErrors.join(" | ")}`);
  const seriousConsoleErrors = consoleErrors.filter((message) => !/favicon|Failed to load resource.*404/i.test(message));
  assert(seriousConsoleErrors.length === 0, `브라우저 콘솔 오류: ${seriousConsoleErrors.join(" | ")}`);
  report.checks.push("브라우저 실행 오류 없음");
  report.result = "success";
} catch (error) {
  report.result = "failure";
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: `${outputDir}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(`${outputDir}/mobile-live-result.json`, JSON.stringify(report, null, 2), "utf8");
  const markdown = [
    "# 고객 사이트 모바일 실기 검증",
    "",
    `- 결과: ${report.result === "success" ? "성공" : "실패"}`,
    `- 검증 주소: ${baseUrl}`,
    `- 화면 크기: ${report.viewport}`,
    `- 오픈룸 검증 날짜: ${testDate}`,
    ...report.checks.map((check) => `- ${check}`),
    ...(report.error ? ["", "## 오류", "", "```text", report.error, "```"] : []),
    "",
  ].join("\n");
  await writeFile(`${outputDir}/mobile-live-result.md`, markdown, "utf8");
  await browser.close();
}
