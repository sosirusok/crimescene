import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const source = join(root, "pages-src");
const output = join(root, "_site");
const base = process.env.PAGES_BASE ?? "/crimescene";
const adminOnly = process.env.ADMIN_ONLY === "1";

const publicRoutes = [
  ["", "home", "홈"],
  ["themes", "themes", "사건 소개"],
  ["themes/orientation", "theme:orientation", "신입생 오티 살인사건"],
  ["themes/youtuber", "theme:youtuber", "유튜버 살인사건"],
  ["themes/hotel", "theme:hotel", "호텔 살인사건"],
  ["themes/cabin", "theme:cabin", "산장 살인사건"],
  ["reservations", "reservations", "실시간 예약"],
  ["reservations/new", "reservation-new", "예약 정보 입력"],
  ["reservations/complete", "reservation-complete", "예약 접수 완료"],
  ["reservations/lookup", "reservation-lookup", "예약 확인·취소"],
  ["guide", "guide", "이용 안내"],
  ["notices", "notices", "공지사항"],
  ["faq", "faq", "자주 묻는 질문"],
  ["location", "location", "오시는 길"],
  ["policies/terms", "policy:terms", "이용약관"],
  ["policies/privacy", "policy:privacy", "개인정보처리방침"],
  ["policies/refunds", "policy:refunds", "취소 및 환불 규정"],
  ["admin", "admin", "운영 콘솔"],
];
const routes = adminOnly ? [["", "admin", "운영 콘솔"]] : publicRoutes;

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "assets"), { recursive: true });
const shell = await readFile(join(source, "shell.html"), "utf8");
for (const [path, route, title] of routes) {
  const folder = join(output, path);
  await mkdir(folder, { recursive: true });
  const html = shell
    .replaceAll("{{BASE}}", base)
    .replaceAll("{{ROUTE}}", route)
    .replaceAll("{{TITLE}}", title);
  await writeFile(join(folder, "index.html"), html);
}

let css = await readFile(join(root, "app/globals.css"), "utf8");
css = css.replace(/^@import "tailwindcss";\s*/, "").replaceAll('url("/images/', `url("${base}/images/`);
css += `\n${await readFile(join(source, "static.css"), "utf8")}`;
await writeFile(join(output, "assets/site.css"), css);
await cp(join(source, "site.js"), join(output, "assets/site.js"));
if (!adminOnly) await cp(join(root, "public/images"), join(output, "images"), { recursive: true });
await cp(join(root, "public/favicon.svg"), join(output, "favicon.svg"));
await writeFile(join(output, ".nojekyll"), "");
if (!adminOnly) {
  const fallback = shell.replaceAll("{{BASE}}", base).replaceAll("{{ROUTE}}", "not-found").replaceAll("{{TITLE}}", "페이지를 찾을 수 없습니다");
  await writeFile(join(output, "404.html"), fallback);
}
console.log(`Built ${routes.length} pages in ${output}`);
