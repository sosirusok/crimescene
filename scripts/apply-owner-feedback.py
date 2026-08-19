from pathlib import Path
import re

ROOT = Path('.')
js_path = ROOT / 'pages-src/customer-final.js'
css_path = ROOT / 'pages-src/final.css'
shell_path = ROOT / 'pages-src/shell.html'
smoke_path = ROOT / 'scripts/smoke-customer.cjs'
footer_path = ROOT / 'app/components/site-footer.tsx'
themes_data_path = ROOT / 'app/data/themes.ts'
themes_page_path = ROOT / 'app/themes/page.tsx'
theme_detail_path = ROOT / 'app/themes/[slug]/page.tsx'

js = js_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')
shell = shell_path.read_text(encoding='utf-8')
smoke = smoke_path.read_text(encoding='utf-8')
footer = footer_path.read_text(encoding='utf-8')
themes_data = themes_data_path.read_text(encoding='utf-8')
themes_page = themes_page_path.read_text(encoding='utf-8')
theme_detail = theme_detail_path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


# Correct legal business information in the offline fallback as well as the live API.
if 'businessName: "(주)싱글"' not in js:
    js = replace_once(
        js,
        '    branchName: "서면1호점",\n    representativeName:',
        '    branchName: "서면1호점",\n    businessName: "(주)싱글",\n    representativeName:',
        'insert business name',
    )
js = js.replace('representativeName: "윤호권"', 'representativeName: "정지훈"')
js = js.replace('businessRegistrationNumber: "839-87-00850"', 'businessRegistrationNumber: "744-88-01446"')
js = js.replace('email: "dbsehrud93@naver.com"', 'email: "jjhun65@hanmail.net"')
js = js.replace('privacyOfficerName: "개인정보 보호 담당자"', 'privacyOfficerName: "정지훈"')
js = js.replace(
    'privacyOfficerContact: "dbsehrud93@naver.com / 070-4304-4340"',
    'privacyOfficerContact: "jjhun65@hanmail.net / 070-4304-4340"',
)
js = js.replace(
    '${h(s.storeName)} · 대표 ${h(s.representativeName)}',
    '${h(s.businessName||s.storeName)} · 대표 ${h(s.representativeName)}',
)
js = js.replace('${s.storeName}(이하 “매장”)', '${s.businessName||s.storeName}(이하 “매장”)')
js = js.replace('>취소 안내</a>', '>취소 및 환불</a>')
js = js.replace('>예약 취소 안내</a>', '>취소 및 환불 안내</a>')

# Remove difficulty from all customer-facing source and fallback data.
js = re.sub(r',difficulty:"[^"]*"', '', js)
js = js.replace('<div><dt>난이도</dt><dd>${h(theme.difficulty)}</dd></div>', '')

# Use a literal three-line icon so it cannot degrade into a partial SVG arc on mobile browsers.
menu_icon_pattern = re.compile(r'  const iconMenu = `[^`]*`;')
menu_icon = '  const iconMenu = `<span class="menu-lines" aria-hidden="true"><i></i><i></i><i></i></span>`;'
js, menu_count = menu_icon_pattern.subn(menu_icon, js, count=1)
if menu_count != 1:
    raise RuntimeError(f'menu icon replacement: expected 1 occurrence, found {menu_count}')

# Make the drawer relationship explicit for accessibility and reliable mobile hit testing.
if '<aside id="mobile-drawer" class="mobile-drawer"' not in js:
    js = replace_once(
        js,
        '<aside class="mobile-drawer"',
        '<aside id="mobile-drawer" class="mobile-drawer" role="dialog" aria-modal="true" tabindex="-1"',
        'mobile drawer id',
    )
else:
    js = js.replace(
        '<aside id="mobile-drawer" class="mobile-drawer" aria-hidden="true">',
        '<aside id="mobile-drawer" class="mobile-drawer" role="dialog" aria-modal="true" tabindex="-1" aria-hidden="true">',
    )
if 'aria-controls="mobile-drawer"' not in js:
    js = replace_once(
        js,
        'aria-expanded="false">${iconMenu}',
        'aria-expanded="false" aria-controls="mobile-drawer">${iconMenu}',
        'menu aria controls',
    )

# Add a sanitized open-room introduction renderer.
room_helper = '''
  function roomIntroductions(slot = {}, compact = false) {
    const items = Array.isArray(slot.openRoomIntroductions)
      ? slot.openRoomIntroductions.filter((item) => String(item?.message || "").trim())
      : [];
    if (!items.length) return "";
    const shown = items.slice(0, compact ? 1 : 4);
    const rows = shown.map((item) => `<p><b>${Number(item.partySize || 0)}명 팀</b><span>${h(item.message)}</span></p>`).join("");
    const more = items.length > shown.length ? `<small>외 ${items.length - shown.length}팀의 소개가 있습니다.</small>` : "";
    return `<div class="open-room-introductions ${compact ? "compact" : ""}"><strong>함께할 팀 소개</strong>${rows}${more}</div>`;
  }
'''
helper_pattern = re.compile(r'\n  function roomIntroductions\(.*?\n  \}\n', re.S)
if helper_pattern.search(js):
    js = helper_pattern.sub('\n' + room_helper.strip('\n') + '\n', js, count=1)
else:
    marker = '  async function api(endpoint, options = {}, timeout = 12000) {'
    if marker not in js:
        raise RuntimeError('room introduction helper insertion point missing')
    js = js.replace(marker, room_helper + '\n' + marker, 1)

# Show introductions on the schedule cards and on the join confirmation screen.
enabled_old = '<span>${h(info.detail)}</span><b>${h(info.action)} ${iconArrow}</b>'
enabled_new = '<span>${h(info.detail)}</span>${roomIntroductions(slot,true)}<b>${h(info.action)} ${iconArrow}</b>'
if enabled_new not in js:
    js = replace_once(js, enabled_old, enabled_new, 'enabled slot introductions')

disabled_old = '<span>${h(info.detail)}</span><b>${h(info.action)}</b>'
disabled_new = '<span>${h(info.detail)}</span>${roomIntroductions(slot,true)}<b>${h(info.action)}</b>'
if disabled_new not in js:
    js = replace_once(js, disabled_old, disabled_new, 'disabled slot introductions')

status_old = 'status.innerHTML=`<span>${h(info.label)}</span><strong>${h(info.detail)}</strong><small>${info.roomState==="AVAILABLE"?`이 사건은 최대 ${theme.totalCapacity}명까지 참여할 수 있습니다.`:h(info.action)}</small>`;'
status_new = 'status.innerHTML=`<span>${h(info.label)}</span><strong>${h(info.detail)}</strong><small>${info.roomState==="AVAILABLE"?`이 사건은 최대 ${theme.totalCapacity}명까지 참여할 수 있습니다.`:h(info.action)}</small>${roomIntroductions(slot,false)}`;'
if status_new not in js:
    js = replace_once(js, status_old, status_new, 'reservation room introductions')

js = js.replace(
    '같이 플레이할 다른 팀에게만 필요한 간단한 소개를 적어 주세요.',
    '예약 시간표의 해당 오픈룸과 합류 화면에 표시됩니다. 이름이나 연락처는 적지 마세요.',
)
js = js.replace(
    '예약표와 오픈룸 합류 화면에 표시됩니다. 이름이나 연락처는 적지 마세요.',
    '예약 시간표의 해당 오픈룸과 합류 화면에 표시됩니다. 이름이나 연락처는 적지 마세요.',
)

# Replace the fragile mobile menu binding with a resilient touch/click implementation.
final_bind = '''  function bindCommon() {
    const drawer=document.querySelector(".mobile-drawer"),backdrop=document.querySelector(".drawer-backdrop"),openButton=document.querySelector(".menu-open"),closeButton=document.querySelector(".menu-close"),clarity=document.querySelector(".customer-clarity");
    const syncTopOffset=()=>{
      if(!clarity)return;
      const height=Math.ceil(clarity.getBoundingClientRect().height);
      if(height>0)document.documentElement.style.setProperty("--customer-clarity-height",`${height}px`);
    };
    syncTopOffset();
    if(clarity&&globalThis.ResizeObserver)new ResizeObserver(syncTopOffset).observe(clarity);
    addEventListener("resize",syncTopOffset,{passive:true});
    if(!drawer||!backdrop||!openButton)return;
    let lastFocused=null,lastTouch=0;
    function setDrawer(show){
      if(show){
        lastFocused=document.activeElement;
        backdrop.hidden=false;
        requestAnimationFrame(()=>backdrop.classList.add("is-open"));
      }else{
        backdrop.classList.remove("is-open");
        backdrop.hidden=true;
      }
      drawer.classList.toggle("is-open",show);
      drawer.setAttribute("aria-hidden",String(!show));
      openButton.setAttribute("aria-expanded",String(show));
      document.body.classList.toggle("drawer-open",show);
      if(show){drawer.focus();closeButton?.focus();}
      else if(lastFocused?.focus)lastFocused.focus();
    }
    function handleMenuAction(event){
      const target=event.target?.closest?.(".menu-open,.menu-close,.drawer-backdrop,.mobile-drawer a");
      if(!target)return;
      if(target.matches(".menu-open")){event.preventDefault();event.stopPropagation();setDrawer(true);}
      else if(target.matches(".menu-close,.drawer-backdrop")){event.preventDefault();setDrawer(false);}
      else if(target.matches(".mobile-drawer a"))setDrawer(false);
    }
    document.addEventListener("pointerup",event=>{
      if(event.pointerType!=="touch")return;
      lastTouch=Date.now();
      handleMenuAction(event);
    },true);
    document.addEventListener("click",event=>{
      if(Date.now()-lastTouch<650)return;
      handleMenuAction(event);
    },true);
    document.addEventListener("keydown",event=>{
      if(event.key==="Escape"&&drawer.classList.contains("is-open")){event.preventDefault();setDrawer(false);return;}
      if(event.key!=="Tab"||!drawer.classList.contains("is-open"))return;
      const focusable=[...drawer.querySelectorAll("a,button,[tabindex]:not([tabindex='-1'])")].filter(node=>!node.disabled);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    addEventListener("popstate",()=>setDrawer(false));
    addEventListener("scroll",()=>document.querySelector(".site-header")?.classList.toggle("is-scrolled",scrollY>20),{passive:true});
  }
'''
bind_pattern = re.compile(r'  function bindCommon\(\) \{.*?\n  \}\n\n  async function boot\(\)', re.S)
js, bind_count = bind_pattern.subn(final_bind + '\n  async function boot()', js, count=1)
if bind_count != 1:
    raise RuntimeError(f'mobile menu binding replacement: expected 1 occurrence, found {bind_count}')

# Add final layout, touch, drawer, business, and open-room styles.
css_marker = '/* OWNER FEEDBACK FINAL 2026-08-19 */'
if css_marker not in css:
    css += r'''

/* OWNER FEEDBACK FINAL 2026-08-19 */
.customer-clarity{z-index:2400!important;height:auto!important;min-height:52px;overflow:visible}
.customer-ui .site-header{z-index:2300!important;top:var(--customer-clarity-height)!important}
.menu-open{position:relative;z-index:2310;pointer-events:auto!important;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none}
.menu-lines{width:22px;height:16px;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}
.menu-lines i{display:block;width:100%;height:2px;border-radius:2px;background:currentColor;transform:none!important;animation:none!important}
.drawer-backdrop{z-index:4990!important;display:block;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility 0s linear .2s}
.drawer-backdrop.is-open{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}
.mobile-drawer{z-index:5000!important;right:0!important;transform:translateX(105%);visibility:hidden;pointer-events:none;overscroll-behavior:contain;transition:transform .23s ease,visibility 0s linear .23s}
.mobile-drawer.is-open{right:0!important;transform:translateX(0);visibility:visible;pointer-events:auto;transition-delay:0s}
body.drawer-open .site-header,body.drawer-open .customer-clarity{pointer-events:none}
body.drawer-open .mobile-drawer,body.drawer-open .drawer-backdrop{pointer-events:auto}
.theme-list dl{grid-template-columns:repeat(3,minmax(0,1fr))}
.open-room-introductions{margin-top:12px;padding:12px 13px;border:1px solid rgba(183,70,61,.24);border-radius:7px;background:rgba(255,255,255,.82);color:var(--ink)}
.open-room-introductions>strong{display:block;margin:0 0 7px;font-size:12px;font-weight:900;color:var(--red)}
.open-room-introductions p{display:grid;grid-template-columns:auto 1fr;gap:7px;margin:5px 0;font-size:13px;line-height:1.5}
.open-room-introductions p b{font-size:12px;white-space:nowrap;color:#704713}
.open-room-introductions p span{margin:0;color:#454950}
.open-room-introductions>small{display:block;margin-top:7px;color:var(--muted);font-size:12px}
.slot .open-room-introductions{padding:9px 10px;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#fff}
.slot .open-room-introductions>strong{color:#f0b0aa}
.slot .open-room-introductions p{display:block;margin:4px 0;font-size:12px}
.slot .open-room-introductions p b{display:inline;margin-right:5px;color:#f1d19f}
.slot .open-room-introductions p span{color:#e2e5e9}
.room-status .open-room-introductions{width:100%;margin-top:14px}
@media(max-width:860px){.menu-open{display:grid!important}.mobile-drawer{width:min(340px,92vw);padding-top:max(22px,env(safe-area-inset-top))}}
@media(max-width:600px){.theme-list dl{grid-template-columns:1fr}.slot .open-room-introductions{margin-top:8px}.open-room-introductions p{grid-template-columns:1fr;gap:1px}}
'''

# Change the asset version so phones do not keep the old broken JavaScript in cache.
shell = re.sub(r'v=20260818-2', 'v=20260819-2', shell)
shell = re.sub(r'v=20260819-0?1', 'v=20260819-2', shell)

# Keep the non-Pages source consistent with the live customer source.
footer = footer.replace('mailto:dbsehrud93@naver.com', 'mailto:jjhun65@hanmail.net')
footer = footer.replace('dbsehrud93@naver.com', 'jjhun65@hanmail.net')
footer = footer.replace('부산광역시 부산진구 신천대로50번길 64, 4층', '부산광역시 부산진구 신천대로50번길 62, 우성빌딩 4층')
footer = footer.replace('크라임씬플레이 · 대표 윤호권 · 사업자등록번호 839-87-00850', '(주)싱글 · 대표 정지훈 · 사업자등록번호 744-88-01446')

themes_data = themes_data.replace('difficulty: string; ', '')
themes_data = re.sub(r', difficulty: "[^"]*"', '', themes_data)
themes_page = themes_page.replace('<div><dt>난이도</dt><dd>{theme.difficulty}</dd></div>', '')
theme_detail = theme_detail.replace('<div><span className="difficulty-icon">✦</span><span>난이도</span><strong>{theme.difficulty}</strong></div>', '')

# Update the smoke fixture and assertions.
if 'businessName:"(주)싱글"' not in smoke and 'businessName: "(주)싱글"' not in smoke:
    smoke = smoke.replace(
        'branchName:"서면1호점",representativeName:',
        'branchName:"서면1호점",businessName:"(주)싱글",representativeName:',
    )
smoke = smoke.replace('representativeName:"윤호권"', 'representativeName:"정지훈"')
smoke = smoke.replace('businessRegistrationNumber:"839-87-00850"', 'businessRegistrationNumber:"744-88-01446"')
smoke = smoke.replace('email:"dbsehrud93@naver.com"', 'email:"jjhun65@hanmail.net"')
smoke = re.sub(r',difficulty:"[^"]*"', '', smoke)
assertion_marker = '  if(!app.innerHTML.includes("실시간 예약"))throw new Error("예약 진입점이 없습니다.");\n'
extra_assertions = (
    '  if(app.innerHTML.includes("난이도"))throw new Error("고객 화면에 난이도가 남아 있습니다.");\n'
    '  if(!app.innerHTML.includes("(주)싱글"))throw new Error("사업자 상호가 반영되지 않았습니다.");\n'
    '  if(!app.innerHTML.includes("744-88-01446"))throw new Error("사업자등록번호가 반영되지 않았습니다.");\n'
    '  if(!app.innerHTML.includes("jjhun65@hanmail.net"))throw new Error("사업자 이메일이 반영되지 않았습니다.");\n'
)
if '사업자등록번호가 반영되지 않았습니다.' not in smoke:
    smoke = replace_once(smoke, assertion_marker, assertion_marker + extra_assertions, 'smoke assertions')

required_js = [
    'businessName: "(주)싱글"',
    'representativeName: "정지훈"',
    'businessRegistrationNumber: "744-88-01446"',
    'email: "jjhun65@hanmail.net"',
    'function roomIntroductions(',
    '예약 시간표의 해당 오픈룸과 합류 화면에 표시됩니다.',
    'aria-controls="mobile-drawer"',
    'document.addEventListener("pointerup"',
    'ResizeObserver',
    'menu-lines',
]
for needle in required_js:
    if needle not in js:
        raise RuntimeError(f'missing customer change: {needle}')
if '난이도</dt>' in js or 'theme.difficulty' in js or re.search(r',difficulty:"', js):
    raise RuntimeError('difficulty remains in customer renderer')
if 'theme.difficulty' in themes_page or 'theme.difficulty' in theme_detail or 'difficulty:' in themes_data:
    raise RuntimeError('difficulty remains in Next customer source')

js_path.write_text(js, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
shell_path.write_text(shell, encoding='utf-8')
smoke_path.write_text(smoke, encoding='utf-8')
footer_path.write_text(footer, encoding='utf-8')
themes_data_path.write_text(themes_data, encoding='utf-8')
themes_page_path.write_text(themes_page, encoding='utf-8')
theme_detail_path.write_text(theme_detail, encoding='utf-8')

print('Owner feedback customer patch applied')
