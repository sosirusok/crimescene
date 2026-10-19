const fs=require("node:fs");
const path=require("node:path");

// Static guards for the mobile layout regressions fixed on 2026-10-19. Run after `node pages-src/build.mjs`.
const site="_site";
const read=file=>fs.readFileSync(path.join(site,file),"utf8");
const fail=message=>{throw new Error(message);};

const css=read("assets/final.css");
const polish=read("assets/customer-polish.css");
const code=read("assets/customer-final.js");

if(css.includes(":has("))fail("final.css에 :has() 선택자가 있습니다. 미지원 모바일 브라우저에서 규칙 전체가 무시됩니다.");
if(/body\{[^}]*min-width:320px/.test(css))fail("body min-width:320px가 남아 있어 320px 미만 화면의 오른쪽이 잘립니다.");
if(!css.includes("-webkit-text-size-adjust:100%"))fail("iOS 가로 모드 글자 자동 확대 방지가 없습니다.");
if(!css.includes("RESPONSIVE RELIABILITY 2026-10-19"))fail("반응형 안정화 규칙이 빌드에 포함되지 않았습니다.");
if(!css.includes("@media(max-width:860px){.header-actions{margin-left:auto}}"))fail("모바일 메뉴 버튼 오른쪽 정렬 규칙이 없습니다.");
if(!/@media\(pointer:coarse\),\(max-width:600px\)\{input:not\(\[type=checkbox\]\):not\(\[type=radio\]\),select,textarea\{font-size:16px!important\}\}/.test(css))fail("모바일 입력칸 16px 규칙이 없어 iPhone에서 입력 시 화면이 확대됩니다.");
if(!css.includes(".open-choice,.consents label,.simple-check{position:relative}"))fail("숨김 체크박스가 라벨 밖으로 벗어나 가로 스크롤을 만들 수 있습니다.");

const desktopHero=polish.indexOf("clamp(50px, 6.5vw, 84px)");
if(desktopHero<0||polish.lastIndexOf("@media (min-width: 861px)",desktopHero)<0)fail("데스크톱 히어로 제목 크기가 모바일 규칙을 덮어씁니다.");

if(/crypto\.randomUUID\(\)/.test(code.replace(/if\(typeof crypto\.randomUUID==="function"\)return crypto\.randomUUID\(\);/,"")))fail("crypto.randomUUID를 대체 경로 없이 호출합니다.");

const pages=[];
(function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith(".html"))pages.push(full);}})(site);
for(const page of pages){
  const html=fs.readFileSync(page,"utf8");
  if(page.endsWith(path.join("admin","index.html")))continue;
  const viewport=html.match(/<meta name="viewport" content="([^"]+)">/);
  if(!viewport||viewport[1]!=="width=device-width,initial-scale=1")fail(`${page}: viewport 설정이 올바르지 않습니다.`);
  const ogImage=html.match(/<meta property="og:image" content="([^"]+)">/);
  if(!ogImage||!ogImage[1].startsWith("https://"))fail(`${page}: og:image가 절대 주소가 아닙니다.`);
}

const notFound=read("404.html");
for(const asset of ["assets/final.css","assets/customer-polish.css","assets/customer-final.js","favicon.svg"]){
  if(!new RegExp(`(href|src)="/${asset.replace(".","\\.")}\\?v=`).test(notFound))fail(`404.html의 ${asset} 경로가 루트 기준이 아니어서 하위 주소에서 스타일이 깨집니다.`);
}

console.log(`Responsive static checks passed (${pages.length} pages).`);
