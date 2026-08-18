import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const source = join(root, "pages-src");
const output = join(root, "_site");
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
  ["reservations/complete", "reservation-complete", "예약 완료"],
  ["reservations/lookup", "reservation-lookup", "예약 확인·취소"],
  ["guide", "guide", "이용 안내"],
  ["notices", "notices", "공지사항"],
  ["faq", "faq", "자주 묻는 질문"],
  ["location", "location", "오시는 길"],
  ["policies/terms", "policy:terms", "이용약관"],
  ["policies/privacy", "policy:privacy", "개인정보처리방침"],
  ["policies/refunds", "policy:refunds", "취소 및 환불 안내"],
];
const routes = adminOnly ? [["", "admin", "운영 관리"]] : publicRoutes;
const scriptName = adminOnly ? "admin-final.js" : "customer-final.js";

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "assets"), { recursive: true });
const template = await readFile(join(source, "shell.html"), "utf8");

function relativeBase(folderPath) {
  const depth = folderPath ? folderPath.split("/").filter(Boolean).length : 0;
  return depth === 0 ? "." : Array(depth).fill("..").join("/");
}

function documentFor(folderPath, route, title) {
  const pageBase = relativeBase(folderPath);
  const description = adminOnly
    ? "크라임씬플레이 서면1호점 예약 및 운영 관리"
    : "사건 속 인물이 되어 단서와 진술로 용의자 중 범인을 찾는 크라임씬플레이 서면1호점 추리게임 예약 사이트";
  return template
    .replaceAll("{{BASE}}", pageBase)
    .replaceAll("{{ROUTE}}", route)
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{DESCRIPTION}}", description)
    .replaceAll("{{ROBOTS}}", adminOnly ? "noindex,nofollow,noarchive" : "index,follow,max-image-preview:large")
    .replaceAll("{{OG_IMAGE}}", adminOnly ? "" : `<meta property="og:image" content="${pageBase}/images/hero-evidence-room.webp">`)
    .replaceAll("{{SCRIPT}}", scriptName)
    .replaceAll("{{BODY_CLASS}}", adminOnly ? "admin-document" : "customer-document")
    .replaceAll("{{LOADING_TITLE}}", "크라임씬플레이 서면1호점")
    .replaceAll("{{LOADING_TEXT}}", adminOnly ? "운영 관리 화면을 여는 중입니다." : "예약 화면을 준비하고 있습니다.")
    .replaceAll("{{FALLBACK_LINK}}", adminOnly ? "https://sosirusok.github.io/crimescene/" : `${pageBase}/reservations/`)
    .replaceAll("{{FALLBACK_LABEL}}", adminOnly ? "고객 사이트" : "예약 화면");
}

for (const [folderPath, route, title] of routes) {
  const folder = join(output, folderPath);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "index.html"), documentFor(folderPath, route, title));
}

await cp(join(source, "final.css"), join(output, "assets/final.css"));
await cp(join(source, scriptName), join(output, "assets", scriptName));
execFileSync(process.execPath, ["--check", join(output, "assets", scriptName)], { stdio: "inherit" });

if (!adminOnly) {
  await cp(join(root, "public/images"), join(output, "images"), { recursive: true });
  const adminFolder = join(output, "admin");
  await mkdir(adminFolder, { recursive: true });
  await writeFile(join(adminFolder, "index.html"), '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=https://sosirusok.github.io/crimescene-admin/"><title>운영 관리로 이동</title></head><body><a href="https://sosirusok.github.io/crimescene-admin/">운영 관리 페이지로 이동</a></body></html>');
  await writeFile(join(output, "404.html"), documentFor("", "not-found", "페이지를 찾을 수 없습니다"));
} else {
  await writeFile(join(output, "404.html"), documentFor("", "admin", "운영 관리"));
}

await cp(join(root, "public/favicon.svg"), join(output, "favicon.svg"));
await writeFile(join(output, ".nojekyll"), "");
await writeFile(join(output, "robots.txt"), adminOnly ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n");
console.log(`Built ${routes.length} ${adminOnly ? "admin" : "customer"} pages in ${output}`);
