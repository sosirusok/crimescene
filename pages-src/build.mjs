import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
];
const routes = adminOnly ? [["", "admin", "운영 관리"]] : publicRoutes;

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "assets"), { recursive: true });
const sourceShell = await readFile(join(source, "shell.html"), "utf8");

if (!adminOnly) {
  if (!sourceShell.includes("/assets/site.js") || !sourceShell.includes("/assets/public-v3.js")) {
    throw new Error("The public shell must load both the base renderer and the enhanced runtime.");
  }
}

const shell = adminOnly
  ? sourceShell
      .replace(
        '<meta name="description" content="크라임씬플레이 서면1호점 역할형 추리게임 예약 사이트" />',
        '<meta name="description" content="크라임씬플레이 서면1호점 예약 및 운영 관리" />\n  <meta name="robots" content="noindex,nofollow,noarchive" />',
      )
      .replace(
        '<meta property="og:description" content="최소 4명, 1~3명은 오픈룸으로 다른 팀과 함께 플레이합니다." />',
        '<meta property="og:description" content="크라임씬플레이 서면1호점 예약 및 운영 관리" />',
      )
      .replace(/^\s*<meta property="og:image".*\n/m, "")
      .replace(/^\s*<link rel="preload".*\n/m, "")
      .replace(/^\s*<script defer src="\{\{BASE\}\}\/assets\/site\.js.*\n/m, "")
      .replace(/^\s*<script defer src="\{\{BASE\}\}\/assets\/public-v3\.js.*\n/m, '  <script defer src="{{BASE}}/assets/admin-v3.js?v=20260816-12"></script>\n')
  : sourceShell;

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
css += `\n${await readFile(join(source, "v3.css"), "utf8")}`;
await writeFile(join(output, "assets/site.css"), css);

if (adminOnly) {
  const adminSource = join(source, "admin-v3.js");
  const adminTarget = join(output, "assets/admin-v3.js");
  await cp(adminSource, adminTarget);
  execFileSync(process.execPath, ["--check", adminTarget], { stdio: "inherit" });
} else {
  const rendererSource = join(source, "site.js");
  const rendererTarget = join(output, "assets/site.js");
  const runtimeSource = join(source, "public-v3.js");
  const runtimeTarget = join(output, "assets/public-v3.js");

  const renderer = await readFile(rendererSource, "utf8");
  const runtime = await readFile(runtimeSource, "utf8");
  if (!renderer.includes("app.innerHTML=html")) {
    throw new Error("The base renderer no longer writes the selected page into #app.");
  }
  if (!runtime.includes("function patchReservationBoard") || !runtime.includes("boot().catch")) {
    throw new Error("The enhanced public runtime is incomplete.");
  }

  await cp(rendererSource, rendererTarget);
  await cp(runtimeSource, runtimeTarget);
  execFileSync(process.execPath, ["--check", rendererTarget], { stdio: "inherit" });
  execFileSync(process.execPath, ["--check", runtimeTarget], { stdio: "inherit" });
  await cp(join(root, "public/images"), join(output, "images"), { recursive: true });
}

await cp(join(root, "public/favicon.svg"), join(output, "favicon.svg"));
await writeFile(join(output, ".nojekyll"), "");
await writeFile(join(output, "robots.txt"), adminOnly ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n");

if (!adminOnly) {
  const adminFolder = join(output, "admin");
  await mkdir(adminFolder, { recursive: true });
  await writeFile(join(adminFolder, "index.html"), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=https://sosirusok.github.io/crimescene-admin/"><link rel="canonical" href="https://sosirusok.github.io/crimescene-admin/"><title>운영 관리로 이동</title></head><body><a href="https://sosirusok.github.io/crimescene-admin/">운영 관리 페이지로 이동</a></body></html>`);
  const fallback = shell.replaceAll("{{BASE}}", base).replaceAll("{{ROUTE}}", "not-found").replaceAll("{{TITLE}}", "페이지를 찾을 수 없습니다");
  await writeFile(join(output, "404.html"), fallback);

  const builtHome = await readFile(join(output, "index.html"), "utf8");
  if (!builtHome.includes("/assets/site.js?v=20260816-12") || !builtHome.includes("/assets/public-v3.js?v=20260816-12")) {
    throw new Error("The generated home page is missing a required JavaScript runtime.");
  }
}

console.log(`Built ${routes.length} ${adminOnly ? "admin" : "public"} pages in ${output}`);
