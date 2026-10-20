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

if(/addEventListener\(\s*["']pointer(up|down)["']/.test(code))fail("모바일 메뉴가 pointerup/pointerdown으로 동작하면 터치 후 클릭이 메뉴 뒤 화면에 눌립니다.");
if(!code.includes('document.addEventListener("click",handleMenuAction,true)'))fail("모바일 메뉴 열기·닫기·이동이 click 이벤트로 처리되지 않습니다.");
if(!code.includes('document.documentElement.classList.toggle("drawer-open",show)')||!css.includes("html.drawer-open,body.drawer-open{overflow:hidden}"))fail("메뉴가 열린 동안 뒤 화면 스크롤이 잠기지 않습니다.");
if(!css.includes(".mobile-drawer{display:flex;flex-direction:column;overflow-y:auto}")||!css.includes(".mobile-drawer footer{position:static;"))fail("낮은 화면에서 메뉴 하단 연락처가 링크를 가리고 메뉴를 스크롤할 수 없습니다.");

const pages=[];
(function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith(".html"))pages.push(full);}})(site);
for(const page of pages){
  const html=fs.readFileSync(page,"utf8");
  if(page.endsWith(path.join("admin","index.html")))continue;
  const viewport=html.match(/<meta name="viewport" content="([^"]+)">/);
  if(!viewport||viewport[1]!=="width=device-width,initial-scale=1")fail(`${page}: viewport 설정이 올바르지 않습니다.`);
  const ogImage=html.match(/<meta property="og:image" content="([^"]+)">/);
  if(!ogImage||!ogImage[1].startsWith("https://"))fail(`${page}: og:image가 절대 주소가 아닙니다.`);
  const home=page===path.join(site,"index.html");
  if(home?!html.includes('<link rel="preload" as="image" href="./images/hero-evidence-room.webp" fetchpriority="high">'):html.includes('rel="preload"'))fail(`${page}: 홈 첫 화면 이미지 preload는 홈 페이지에만 있어야 합니다.`);
}

const fontFaces=[...polish.matchAll(/@font-face\{([^}]*)\}/g)].map(([,rule])=>({file:(rule.match(/url\("\.\.\/fonts\/([^"]+)"\)/)||[])[1]||"",weight:(rule.match(/font-weight:([^;]+)/)||[])[1],range:((rule.match(/unicode-range:([^;]+)/)||[])[1]||"").split(",").filter(Boolean).map(part=>part.slice(2).split("-").map(hex=>parseInt(hex,16)))}));
const siteChars=[...new Set([code,css,polish,...pages.map(page=>fs.readFileSync(page,"utf8")),"일월화수목금토오전후년"].join(""))];
for(const weight of ["400","700","800 900"]){
  const subset=fontFaces.find(face=>face.weight===weight&&face.file.startsWith("SiteSubset-")),full=fontFaces.find(face=>face.weight===weight&&face.file.startsWith("Pretendard-"));
  if(!subset||!subset.range.length||!fs.existsSync(path.join(site,"fonts",subset.file))||!full||!full.range.length)fail(`font-weight ${weight}의 사이트 글자 부분 폰트가 없습니다. python3 scripts/subset-fonts.py를 실행해 주세요.`);
  const missing=siteChars.filter(char=>full.range.some(([from,to=from])=>char.codePointAt(0)>=from&&char.codePointAt(0)<=to));
  if(missing.length)fail(`사이트 문구의 "${missing.join("")}" 글자가 부분 폰트에 없어 ${full.file} 전체를 내려받습니다. python3 scripts/subset-fonts.py를 실행해 주세요.`);
}

const notFound=read("404.html");
const rootBase=(process.env.PAGES_BASE_PATH||"").replace(/\/+$/,"");
if(rootBase&&!rootBase.startsWith("/"))fail("PAGES_BASE_PATH는 /로 시작해야 404.html 경로가 루트 기준이 됩니다.");
for(const asset of ["assets/final.css","assets/customer-polish.css","assets/customer-final.js","favicon.svg"]){
  if(!notFound.includes(`="${rootBase}/${asset}?v=`))fail(`404.html의 ${asset} 경로가 루트 기준이 아니어서 하위 주소에서 스타일이 깨집니다.`);
}

console.log(`Responsive static checks passed (${pages.length} pages).`);
