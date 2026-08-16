(() => {
  "use strict";

  const API = "https://jhjbiejqtbidloxcwryr.supabase.co/functions/v1/api";
  const PUBLISHABLE_KEY = "sb_publishable_mA5DOfPA-ExloawT3aJpNw_2PeVgEEc";
  const app = document.querySelector("#app");
  const route = document.body?.dataset?.route || "home";
  const firstPath = location.pathname.split("/").filter(Boolean)[0] || "";
  const BASE = location.hostname.endsWith("github.io") && firstPath ? `/${firstPath}` : "";

  const FALLBACK_SETTINGS = {
    storeName: "크라임씬플레이",
    branchName: "서면1호점",
    representativeName: "윤호권",
    businessRegistrationNumber: "839-87-00850",
    mailOrderRegistrationNumber: "",
    phone: "070-4304-4340",
    email: "dbsehrud93@naver.com",
    addressRoad: "부산광역시 부산진구 신천대로50번길 62",
    addressDetail: "부전동 우성빌딩 4층",
    mapQuery: "부산광역시 부산진구 신천대로50번길 62",
    bookingWindowDays: 15,
    arrivalMinutes: 10,
    cancellationCutoffHours: 24,
    paymentMode: "ONSITE",
    paymentProvider: "KISPG",
    privacyOfficerName: "개인정보 보호 담당자",
    privacyOfficerContact: "dbsehrud93@naver.com / 070-4304-4340",
    refundPolicyConfirmed: false,
    customerNotice: "",
  };

  const FALLBACK_THEMES = [
    { id:"A",slug:"orientation",episode:7,title:"크라임씬 EP.7 신입생 오티 살인사건",shortTitle:"신입생 오티 살인사건",tagline:"모두 같은 밤을 기억하지만, 진술은 서로 다릅니다.",synopsis:"환영회가 끝난 새벽, 연수원에서 한 사람이 숨진 채 발견됩니다. 흩어진 명찰과 끊긴 기억, 서로 어긋나는 진술을 따라 사건의 진실을 찾아야 합니다.",difficulty:"★★★★☆",minPlayers:4,suspectCapacity:4,detectiveCapacity:4,totalCapacity:8,duration:90,price:23000,image:"/images/theme-orientation.webp",times:["10:00","11:30","13:20","15:10","17:00","18:50","20:40","22:30"],status:"ACTIVE" },
    { id:"B",slug:"youtuber",episode:8,title:"크라임씬 EP.8 유튜버 살인사건",shortTitle:"유튜버 살인사건",tagline:"마지막 생방송에서 사라진 12초, 누군가는 편집했습니다.",synopsis:"생방송이 끊긴 스튜디오에서 사건이 발생합니다. 카메라는 계속 돌아갔지만 결정적인 장면만 사라졌습니다. 공개된 얼굴 뒤에 숨은 관계를 추적하세요.",difficulty:"★★★★☆",minPlayers:4,suspectCapacity:5,detectiveCapacity:4,totalCapacity:9,duration:90,price:23000,image:"/images/theme-youtuber.webp",times:["10:00","11:50","13:40","15:30","17:20","19:10","21:00","22:50"],status:"ACTIVE" },
    { id:"C",slug:"hotel",episode:3,title:"크라임씬 EP.3 호텔 살인사건",shortTitle:"호텔 살인사건",tagline:"잠든 듯 발견된 톱 여배우, 객실 열쇠는 하나뿐이었습니다.",synopsis:"화려한 호텔의 가장 조용한 객실에서 국내 톱 여배우가 숨진 채 발견됩니다. 통제된 동선과 서로 맞지 않는 투숙 기록 속에서 범인을 찾아야 합니다.",difficulty:"★★★★★",minPlayers:4,suspectCapacity:5,detectiveCapacity:4,totalCapacity:9,duration:90,price:23000,image:"/images/theme-hotel.webp",times:["10:00","12:10","14:00","15:50","17:40","19:30","21:20","23:10"],status:"ACTIVE" },
    { id:"D",slug:"cabin",episode:4,title:"크라임씬 EP.4 산장 살인사건",shortTitle:"산장 살인사건",tagline:"폭설로 고립된 산장, 발자국은 들어왔지만 나가지 않았습니다.",synopsis:"한밤의 폭설이 모든 길을 지운 뒤 산장 안에서 사건이 발생합니다. 외부인의 흔적은 없고 출입문은 안에서 잠겨 있었습니다.",difficulty:"★★★★★",minPlayers:4,suspectCapacity:4,detectiveCapacity:4,totalCapacity:8,duration:90,price:23000,image:"/images/theme-cabin.webp",times:["11:00","12:30","14:20","16:10","18:00","19:50","21:40","23:30"],status:"ACTIVE" },
  ];

  const state = {
    settings: FALLBACK_SETTINGS,
    themes: FALLBACK_THEMES,
    payment: { mode:"ONSITE",label:"매장 결제",onlineEnabled:false,configured:false,legalReady:false },
    bootstrapOnline: false,
  };

  const STATUS = {
    PENDING_PAYMENT: "접수 중",
    CONFIRMED: "예약 확정",
    COMPLETED: "이용 완료",
    CANCEL_REQUESTED: "취소 확인 중",
    CANCELED: "예약 취소",
    NO_SHOW: "미방문",
  };

  const h = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
  const money = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
  const digits = (value) => String(value ?? "").replace(/\D/g, "");
  const path = (value = "") => `${BASE}/${value}`.replace(/\/$/, value ? "/" : "");
  const image = (value = "") => `${BASE}/images/${String(value).split("/").pop()}`;
  const iconArrow = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg>`;
  const iconMenu = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
  const iconClose = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 5 14 14M19 5 5 19"/></svg>`;
  const iconCheck = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>`;

  function phoneHref(value) { return `tel:${digits(value)}`; }
  function formatPhone(value) {
    const n = digits(value).slice(0, 11);
    if (n.startsWith("02")) return n.length <= 2 ? n : n.length <= 5 ? `${n.slice(0,2)}-${n.slice(2)}` : n.length <= 9 ? `${n.slice(0,2)}-${n.slice(2,5)}-${n.slice(5)}` : `${n.slice(0,2)}-${n.slice(2,6)}-${n.slice(6)}`;
    return n.length <= 3 ? n : n.length <= 7 ? `${n.slice(0,3)}-${n.slice(3)}` : `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7)}`;
  }
  function dateValue(date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit" }).format(date);
  }
  function todayValue() { return dateValue(new Date()); }
  function addDate(value, amount) { const d=new Date(`${value}T12:00:00+09:00`);d.setDate(d.getDate()+amount);return dateValue(d); }
  function formatDate(value, short = false) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("ko-KR", short ? { month:"long",day:"numeric",weekday:"short" } : { year:"numeric",month:"long",day:"numeric",weekday:"short" }).format(new Date(`${value}T12:00:00+09:00`));
  }
  function formatDateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("ko-KR", { timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit" }).format(new Date(value));
  }
  function capacity(theme) { return `용의자 ${theme.suspectCapacity}명 + 탐정 최대 ${theme.detectiveCapacity}명`; }
  function themeById(id) { return state.themes.find((theme) => theme.id === id); }
  function themeBySlug(slug) { return state.themes.find((theme) => theme.slug === slug); }
  function roomInfo(slot = {}, theme = {}) {
    const roomState = slot.state || "AVAILABLE";
    const count = Number(slot.bookedCount || 0);
    const cap = Number(slot.capacity || theme.totalCapacity || 0);
    const min = Number(slot.minimumPlayers || theme.minPlayers || 4);
    const remaining = Math.max(0, Number(slot.remaining ?? cap - count));
    const map = {
      AVAILABLE: { label:"예약 가능",detail:"새 예약을 받을 수 있습니다.",action:"예약하기",tone:"available",canBook:true },
      OPEN_RECRUITING: { label:`${count}/${cap}명 · 오픈룸 모집 중`,detail:`${Math.max(0,min-count)}명 이상 더 모이면 게임을 진행할 수 있습니다.`,action:`남은 ${remaining}자리`,tone:"recruiting",canBook:slot.canJoin===true },
      OPEN_PLAYABLE: { label:`${count}/${cap}명 · 게임 진행 가능`,detail:`최소 인원이 모였습니다. 남은 ${remaining}자리도 합류할 수 있습니다.`,action:`남은 ${remaining}자리`,tone:"playable",canBook:slot.canJoin===true },
      FULL: { label:`${count}/${cap}명 · 정원 마감`,detail:"오픈룸 정원이 모두 찼습니다.",action:"마감",tone:"closed",canBook:false },
      PRIVATE_BOOKED: { label:"단독팀 예약 완료",detail:"다른 팀이 합류하지 않는 회차입니다.",action:"마감",tone:"private",canBook:false },
      BLOCKED: { label:"운영하지 않는 회차",detail:"매장 운영 일정으로 예약할 수 없습니다.",action:"예약 불가",tone:"closed",canBook:false },
    };
    return { roomState,count,cap,min,remaining,...(map[roomState] || map.AVAILABLE) };
  }

  async function api(endpoint, options = {}, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${API}${endpoint}`, {
        ...options,
        cache:"no-store",
        signal:controller.signal,
        headers:{ apikey:PUBLISHABLE_KEY,"Content-Type":"application/json",...(options.headers || {}) },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
      return data;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function toast(message, type = "") {
    let host=document.querySelector(".toast-host");
    if(!host){host=document.createElement("div");host.className="toast-host";document.body.append(host);}
    const node=document.createElement("div");node.className=`toast ${type}`;node.setAttribute("role","status");node.textContent=message;host.append(node);setTimeout(()=>node.remove(),4500);
  }

  function header(current = "") {
    const nav=[["themes","사건 소개"],["reservations","실시간 예약"],["guide","이용 안내"],["notices","공지사항"],["location","오시는 길"]];
    return `<a class="skip-link" href="#main-content">본문으로 바로가기</a><header class="site-header"><div class="header-inner">
      <a class="brand" href="${path()}" aria-label="${h(state.settings.storeName)} ${h(state.settings.branchName)} 홈"><span class="brand-symbol">CS</span><span><b>${h(state.settings.storeName)}</b><small>${h(state.settings.branchName)}</small></span></a>
      <nav class="desktop-nav" aria-label="주요 메뉴">${nav.map(([slug,label])=>`<a class="${current===slug?"is-current":""}" href="${path(slug)}">${label}</a>`).join("")}</nav>
      <div class="header-actions"><a class="header-phone" href="${phoneHref(state.settings.phone)}"><small>예약 문의</small><strong>${h(state.settings.phone)}</strong></a><a class="header-reserve" href="${path("reservations")}">예약하기 ${iconArrow}</a><button class="menu-open" type="button" aria-label="전체 메뉴 열기" aria-expanded="false">${iconMenu}</button></div>
    </div></header>
    <div class="drawer-backdrop" hidden></div><aside class="mobile-drawer" aria-hidden="true"><header><strong>메뉴</strong><button class="menu-close" type="button" aria-label="전체 메뉴 닫기">${iconClose}</button></header><nav>${nav.map(([slug,label])=>`<a href="${path(slug)}">${label}${iconArrow}</a>`).join("")}<a href="${path("reservations/lookup")}">예약 확인·취소${iconArrow}</a><a href="${path("faq")}">자주 묻는 질문${iconArrow}</a></nav><footer><span>예약 문의</span><a href="${phoneHref(state.settings.phone)}">${h(state.settings.phone)}</a></footer></aside>`;
  }

  function footer() {
    const s=state.settings;
    return `<footer class="site-footer"><div class="footer-main"><div class="footer-brand"><strong>${h(s.storeName)}</strong><span>${h(s.branchName)}</span><p>사건 속 배역을 맡아 현장을 조사하고, 대화와 추리로 범인을 찾는 역할형 추리게임입니다.</p></div><div class="footer-columns"><div><b>예약</b><a href="${path("reservations")}">실시간 예약</a><a href="${path("reservations/lookup")}">예약 확인·취소</a><a href="${path("guide")}">이용 안내</a></div><div><b>고객 안내</b><a href="${path("notices")}">공지사항</a><a href="${path("faq")}">자주 묻는 질문·문의</a><a href="${path("location")}">오시는 길</a></div><div><b>매장 정보</b><a href="${phoneHref(s.phone)}">${h(s.phone)}</a><a href="mailto:${h(s.email)}">${h(s.email)}</a><span>${h(s.addressRoad)}<br>${h(s.addressDetail)}</span></div></div></div><div class="footer-legal"><div><span>${h(s.storeName)} · 대표 ${h(s.representativeName)} · 사업자등록번호 ${h(s.businessRegistrationNumber)}</span>${s.mailOrderRegistrationNumber?`<span>통신판매업 신고번호 ${h(s.mailOrderRegistrationNumber)}</span>`:""}</div><nav><a href="${path("policies/terms")}">이용약관</a><a href="${path("policies/privacy")}">개인정보처리방침</a><a href="${path("policies/refunds")}">취소 안내</a></nav></div></footer>`;
  }

  function pageTitle(kicker,title,description,extra="") {
    return `<section class="page-title ${extra}"><div><p>${h(kicker)}</p><h1>${h(title)}</h1><span>${h(description)}</span></div></section>`;
  }
  function reservationNav(active) {
    return `<nav class="reservation-nav" aria-label="예약 메뉴"><a class="${active==="schedule"?"is-active":""}" href="${path("reservations")}">실시간 예약</a><a class="${active==="lookup"?"is-active":""}" href="${path("reservations/lookup")}">예약 확인·취소</a><a href="${path("guide")}">이용 안내</a></nav>`;
  }

  function homePage() {
    return `${header("home")}<main id="main-content"><section class="hero"><img src="${image("hero-evidence-room.webp")}" alt="사건 현장을 연상시키는 추리게임 공간"><div class="hero-overlay"></div><div class="hero-content"><p>${h(state.settings.branchName)} 역할형 추리게임</p><h1>사건 속 인물이 되어<br>직접 범인을 찾습니다.</h1><span>각자 다른 배역과 비밀을 받은 뒤 현장을 조사하고, 서로의 진술을 확인하며 한 편의 사건을 완성합니다.</span><div><a class="button primary" href="${path("reservations")}">예약 가능한 시간 보기 ${iconArrow}</a><a class="button secondary" href="${path("themes")}">사건 먼저 둘러보기</a></div></div><aside class="hero-guide"><strong>처음 예약하신다면</strong><ol><li><span>1</span>사건과 회차 선택</li><li><span>2</span>인원과 예약자 정보 입력</li><li><span>3</span>예약 확정 후 ${state.settings.arrivalMinutes}분 전 도착</li></ol></aside></section>
      <section class="quick-facts"><div><strong>최소 4명</strong><span>게임 진행 기준 인원</span></div><div><strong>약 90분</strong><span>브리핑부터 최종 추리까지</span></div><div><strong>1~3명도 예약 가능</strong><span>오픈룸으로 다른 팀과 합류</span></div><div><strong>최대 8~9명</strong><span>테마별 역할 정원</span></div></section>
      ${state.settings.customerNotice?`<section class="store-notice"><strong>매장 안내</strong><p>${h(state.settings.customerNotice)}</p></section>`:""}
      <section class="section theme-showcase"><header class="section-heading"><div><p>현재 진행 중인 사건</p><h2>원하는 사건을 선택해 보세요.</h2></div><a href="${path("themes")}">사건 비교하기 ${iconArrow}</a></header><div class="theme-cards">${state.themes.map((theme,index)=>`<article><a href="${path(`themes/${theme.slug}`)}"><figure><img src="${image(theme.image)}" alt="${h(theme.shortTitle)}" loading="${index?"lazy":"eager"}"><span>EP.${theme.episode}</span></figure><div><h3>${h(theme.shortTitle)}</h3><p>${h(theme.tagline)}</p><dl><div><dt>인원</dt><dd>최소 ${theme.minPlayers}명 · 최대 ${theme.totalCapacity}명</dd></div><div><dt>시간</dt><dd>${theme.duration}분</dd></div></dl><b>자세히 보기 ${iconArrow}</b></div></a></article>`).join("")}</div></section>
      <section class="section how-it-works"><header><p>게임 진행 방식</p><h2>처음 오셔도 어렵지 않습니다.</h2></header><ol><li><span>01</span><div><h3>배역 확인</h3><p>각자 사건 속 인물과 관계, 본인만 알아야 할 정보를 확인합니다.</p></div></li><li><span>02</span><div><h3>현장 조사</h3><p>공간과 소품을 살피며 사건을 풀 단서를 직접 찾습니다.</p></div></li><li><span>03</span><div><h3>대화와 심문</h3><p>찾은 증거와 서로의 진술을 비교해 의심되는 부분을 확인합니다.</p></div></li><li><span>04</span><div><h3>최종 추리</h3><p>각자의 판단으로 범인을 지목하고 사건의 전말을 확인합니다.</p></div></li></ol></section>
      <section class="open-room-explain"><div><p>인원이 부족할 때</p><h2>1~3명은 오픈룸으로 예약합니다.</h2><span>같은 사건과 같은 회차를 선택한 다른 팀이 남은 자리에 합류합니다. 예약표에서 현재 인원과 정원, 게임 진행 가능 여부를 바로 확인할 수 있습니다.</span><a class="button light" href="${path("reservations")}">오픈룸 확인하기 ${iconArrow}</a></div><div class="room-example"><span>예시</span><article><b>15:10</b><strong>3/8명 · 오픈룸 모집 중</strong><small>1명 이상 더 모이면 진행 가능</small></article><article class="playable"><b>18:50</b><strong>4/8명 · 게임 진행 가능</strong><small>남은 4자리 합류 가능</small></article></div></section>
      <section class="final-cta"><div><p>예약은 어렵지 않습니다.</p><h2>날짜와 시간을 고르면<br>남은 자리를 바로 확인할 수 있습니다.</h2></div><a class="button light" href="${path("reservations")}">실시간 예약 시작 ${iconArrow}</a></section></main>${footer()}`;
  }

  function themesPage() {
    return `${header("themes")}<main id="main-content">${pageTitle("사건 소개","진행 중인 사건","각 사건은 서로 다른 이야기와 배역으로 구성됩니다.")}<section class="section theme-list">${state.themes.map((theme,index)=>`<article><a class="theme-list-image" href="${path(`themes/${theme.slug}`)}"><img src="${image(theme.image)}" alt="${h(theme.shortTitle)}"><span>사건 ${String(index+1).padStart(2,"0")}</span></a><div><p>EP.${theme.episode}</p><h2>${h(theme.shortTitle)}</h2><blockquote>${h(theme.tagline)}</blockquote><span>${h(theme.synopsis)}</span><dl><div><dt>역할 정원</dt><dd>${h(capacity(theme))}<br>최소 ${theme.minPlayers}명 · 최대 ${theme.totalCapacity}명</dd></div><div><dt>이용 시간</dt><dd>${theme.duration}분</dd></div><div><dt>난이도</dt><dd>${h(theme.difficulty)}</dd></div><div><dt>이용 요금</dt><dd>${money(theme.price)} / 1인</dd></div></dl><div class="theme-actions"><a class="button primary" href="${path("reservations")}?theme=${theme.id}">예약 시간 보기 ${iconArrow}</a><a href="${path(`themes/${theme.slug}`)}">상세 소개</a></div></div></article>`).join("")}</section></main>${footer()}`;
  }

  function themePage(slug) {
    const theme=themeBySlug(slug) || state.themes[0];
    return `${header("themes")}<main id="main-content"><section class="theme-hero"><img src="${image(theme.image)}" alt="${h(theme.shortTitle)}"><div></div><article><p>EP.${theme.episode}</p><h1>${h(theme.shortTitle)}</h1><blockquote>${h(theme.tagline)}</blockquote><a class="button primary" href="${path("reservations")}?theme=${theme.id}">이 사건 예약하기 ${iconArrow}</a></article></section><section class="section theme-detail"><div class="theme-story"><p>스포일러 없는 사건 소개</p><h2>사건 개요</h2><span>${h(theme.synopsis)}</span><small>게임의 핵심 단서와 정답은 포함하지 않은 소개입니다.</small></div><aside><article><span>이용 시간</span><strong>${theme.duration}분</strong></article><article><span>최소 인원</span><strong>${theme.minPlayers}명</strong></article><article><span>역할 정원</span><strong>최대 ${theme.totalCapacity}명</strong><small>${h(capacity(theme))}</small></article><article><span>1인 요금</span><strong>${money(theme.price)}</strong></article></aside></section><section class="section before-play"><header><p>예약 전 확인</p><h2>이 사건은 이렇게 예약합니다.</h2></header><div><article><b>4명 이상</b><h3>단독팀 또는 오픈룸 선택</h3><p>예약한 인원끼리만 플레이하거나, 남은 자리를 다른 팀에게 열 수 있습니다.</p></article><article><b>1~3명</b><h3>오픈룸으로 자동 예약</h3><p>같은 회차의 다른 팀과 합류하며 전체 인원이 ${theme.minPlayers}명 이상 모이면 진행할 수 있습니다.</p></article><article><b>도착 시간</b><h3>시작 ${state.settings.arrivalMinutes}분 전</h3><p>배역 배정과 안내가 있으므로 여유 있게 도착해 주세요.</p></article></div></section></main>${footer()}`;
  }

  function dateChoices() {
    const start=todayValue(), length=Math.max(1,Number(state.settings.bookingWindowDays||15));
    return Array.from({length},(_,i)=>{const value=addDate(start,i),date=new Date(`${value}T12:00:00+09:00`);return {value,date,index:i};});
  }

  function reservationsPage() {
    return `${header("reservations")}<main id="main-content">${pageTitle("실시간 예약","날짜와 회차를 선택해 주세요.",`오늘부터 ${state.settings.bookingWindowDays}일간 예약할 수 있습니다.`,"reservation-title")}<section class="section reservation-shell">${reservationNav("schedule")}<div class="reservation-guide"><strong>예약 전 확인</strong><p>게임은 최소 4명부터 진행합니다. 1~3명은 오픈룸으로 예약하며, 같은 회차의 다른 팀과 함께 플레이합니다.</p><a href="${path("guide")}">오픈룸 자세히 보기</a></div><div class="schedule-controls"><section><header><span>1</span><div><strong>날짜 선택</strong><small>원하는 날짜를 눌러 주세요.</small></div></header><div class="date-row" id="date-row"></div></section><section><header><span>2</span><div><strong>사건 선택</strong><small>전체 사건을 한 번에 볼 수도 있습니다.</small></div></header><div class="theme-filter" id="theme-filter"></div></section></div><div class="schedule-heading"><div><span>3</span><div><h2>예약 가능한 회차</h2><p>현재 인원과 남은 자리를 실시간으로 표시합니다.</p></div></div><div class="schedule-legend"><span><i class="available"></i>예약 가능</span><span><i class="recruiting"></i>오픈룸 모집</span><span><i class="playable"></i>게임 가능</span><span><i class="closed"></i>마감</span></div></div><div id="schedule" class="schedule"><div class="loading-panel"><i></i><strong>회차를 확인하고 있습니다.</strong></div></div></section></main>${footer()}`;
  }

  function bindReservationsPage() {
    const dates=document.querySelector("#date-row"),filters=document.querySelector("#theme-filter"),schedule=document.querySelector("#schedule");
    if(!dates||!filters||!schedule)return;
    const initial=new URLSearchParams(location.search).get("theme")||"";
    let selectedDate=dateChoices()[0].value,selectedTheme=initial,request=0;
    dates.innerHTML=dateChoices().map(({value,date,index})=>`<button type="button" data-date="${value}" class="${index===0?"is-selected":""}" aria-pressed="${index===0}"><small>${index===0?"오늘":new Intl.DateTimeFormat("ko-KR",{weekday:"short"}).format(date)}</small><strong>${date.getDate()}</strong><span>${date.getMonth()+1}월</span></button>`).join("");
    filters.innerHTML=`<button type="button" data-theme="" class="${selectedTheme?"":"is-selected"}" aria-pressed="${selectedTheme?"false":"true"}">전체</button>${state.themes.map(theme=>`<button type="button" data-theme="${theme.id}" class="${selectedTheme===theme.id?"is-selected":""}" aria-pressed="${selectedTheme===theme.id}">${h(theme.shortTitle)}</button>`).join("")}`;
    async function load(){
      const id=++request;schedule.innerHTML=`<div class="loading-panel"><i></i><strong>${h(formatDate(selectedDate,true))} 회차를 확인하고 있습니다.</strong></div>`;
      try{
        const data=await api(`/availability?date=${encodeURIComponent(selectedDate)}${selectedTheme?`&theme=${encodeURIComponent(selectedTheme)}`:""}`);
        if(id!==request)return;
        schedule.innerHTML=data.themes.map(theme=>`<article class="schedule-theme"><header><img src="${image(theme.image)}" alt=""><div><p>EP.${theme.episode}</p><h3>${h(theme.shortTitle)}</h3><span>${theme.duration}분 · ${money(theme.price)} / 1인</span><small>${h(capacity(theme))} · 최대 ${theme.totalCapacity}명</small></div><a href="${path(`themes/${theme.slug}`)}">사건 소개</a></header><div class="slot-grid">${theme.times.map(slot=>{const info=roomInfo(slot,theme);const href=`${path("reservations/new")}?${new URLSearchParams({theme:theme.id,date:selectedDate,time:slot.time})}`;return info.canBook?`<a class="slot ${info.tone}" href="${href}"><time>${h(slot.time)}</time><strong>${h(info.label)}</strong><span>${h(info.detail)}</span><b>${h(info.action)} ${iconArrow}</b></a>`:`<div class="slot ${info.tone} disabled" aria-disabled="true"><time>${h(slot.time)}</time><strong>${h(info.label)}</strong><span>${h(info.detail)}</span><b>${h(info.action)}</b></div>`;}).join("")}</div></article>`).join("");
      }catch(error){if(id!==request)return;schedule.innerHTML=`<div class="error-panel"><strong>회차를 불러오지 못했습니다.</strong><p>${h(error.message)}</p><button type="button">다시 확인</button></div>`;schedule.querySelector("button")?.addEventListener("click",load);}
    }
    dates.querySelectorAll("[data-date]").forEach(button=>button.addEventListener("click",()=>{dates.querySelectorAll("button").forEach(x=>{x.classList.remove("is-selected");x.setAttribute("aria-pressed","false");});button.classList.add("is-selected");button.setAttribute("aria-pressed","true");selectedDate=button.dataset.date;load();}));
    filters.querySelectorAll("[data-theme]").forEach(button=>button.addEventListener("click",()=>{filters.querySelectorAll("button").forEach(x=>{x.classList.remove("is-selected");x.setAttribute("aria-pressed","false");});button.classList.add("is-selected");button.setAttribute("aria-pressed","true");selectedTheme=button.dataset.theme||"";load();}));
    load();
  }

  function reservationNewPage() {
    const params=new URLSearchParams(location.search),theme=themeById(params.get("theme")),date=params.get("date")||"",time=params.get("time")||"";
    if(!theme||!date||!time)return `${header("reservations")}<main id="main-content">${pageTitle("예약 정보 입력","선택한 회차가 없습니다.","실시간 예약 화면에서 사건과 시간을 먼저 선택해 주세요.")}<section class="section empty-page"><a class="button primary" href="${path("reservations")}">실시간 예약으로 돌아가기</a></section></main>${footer()}`;
    return `${header("reservations")}<main id="main-content">${pageTitle("예약 정보 입력","예약 내용을 확인해 주세요.","필요한 정보만 입력하면 바로 접수됩니다.","form-title")}<section class="section booking-layout"><aside class="booking-summary"><img src="${image(theme.image)}" alt="${h(theme.shortTitle)}"><div><p>선택한 사건</p><h2>${h(theme.shortTitle)}</h2><dl><div><dt>날짜</dt><dd>${h(formatDate(date))}</dd></div><div><dt>시간</dt><dd>${h(time)}</dd></div><div><dt>이용 시간</dt><dd>${theme.duration}분</dd></div><div><dt>정원</dt><dd>최소 ${theme.minPlayers}명 · 최대 ${theme.totalCapacity}명</dd></div><div><dt>요금</dt><dd>${money(theme.price)} / 1인</dd></div></dl><a href="${path("reservations")}">다른 회차 선택</a></div></aside><form id="booking-form" class="booking-form" novalidate><section class="form-section"><header><span>1</span><div><h2>현재 회차</h2><p>남은 자리와 오픈룸 상태를 먼저 확인합니다.</p></div></header><div id="room-status" class="room-status loading"><i></i><strong>회차를 확인하고 있습니다.</strong></div></section><section class="form-section"><header><span>2</span><div><h2>이용 인원</h2><p>참가할 전체 인원을 선택해 주세요.</p></div></header><div class="party-buttons" id="party-buttons"></div><label class="open-choice" id="open-choice"><input type="checkbox" name="openRoom"><span class="check-box">${iconCheck}</span><div><strong>남은 자리를 다른 팀에게 열기</strong><p>4명 이상일 때 선택할 수 있습니다. 선택하지 않으면 단독팀으로 예약됩니다.</p></div></label><label class="field open-intro" id="open-intro"><span>오픈룸 소개 <em>필수</em></span><textarea name="specialRequest" maxlength="300" placeholder="예: 20대 2명입니다. 즐겁게 플레이하고 싶어요."></textarea><small>같이 플레이할 다른 팀에게만 필요한 간단한 소개를 적어 주세요.</small></label></section><section class="form-section"><header><span>3</span><div><h2>예약자 정보</h2><p>예약 확인과 매장 안내에 사용합니다.</p></div></header><div class="field-grid"><label class="field"><span>예약자 이름 <em>필수</em></span><input name="customerName" autocomplete="name" maxlength="20" required placeholder="이름"></label><label class="field"><span>휴대폰 번호 <em>필수</em></span><input name="phone" autocomplete="tel" inputmode="tel" maxlength="13" required placeholder="010-0000-0000"></label></div></section><section class="form-section"><header><span>4</span><div><h2>최종 확인</h2><p>예약 내용과 필수 안내를 확인해 주세요.</p></div></header><div class="order-summary"><div><span>예약 인원</span><strong><b id="party-count">-</b>명</strong></div><div><span>이용 예정 금액</span><strong id="total-price">-</strong></div></div><div class="payment-guide" id="payment-guide"></div><div class="consents"><label><input type="checkbox" name="privacyConsent" required><span class="check-box">${iconCheck}</span><div><strong>[필수] 개인정보 수집·이용 동의</strong><p>수집 항목: 이름, 휴대폰 번호, 예약 내용, 요청사항. 예약 확인·변경·취소와 운영 안내에 사용하며 계약·취소 기록은 5년간 보관합니다. 동의를 거부할 수 있으나 필수 정보라 예약은 진행할 수 없습니다.</p></div></label><label><input type="checkbox" name="cancellationConsent" required><span class="check-box">${iconCheck}</span><div><strong>[필수] 예약 취소 안내 확인</strong><p>이용 ${state.settings.cancellationCutoffHours}시간 전까지 온라인 취소가 가능하며, 이후에는 매장으로 문의해야 합니다.</p></div></label></div><div id="booking-message" class="form-message" role="alert"></div><button class="submit-booking" type="submit" disabled><span>예약 확정하기</span><strong id="submit-price">-</strong>${iconArrow}</button></section></form></section></main>${footer()}`;
  }

  function bindReservationNewPage() {
    const form=document.querySelector("#booking-form");if(!form)return;
    const params=new URLSearchParams(location.search),theme=themeById(params.get("theme")),playDate=params.get("date"),startTime=params.get("time");
    const status=document.querySelector("#room-status"),picker=document.querySelector("#party-buttons"),openChoice=document.querySelector("#open-choice"),openIntro=document.querySelector("#open-intro"),openInput=form.elements.openRoom,request=form.elements.specialRequest,submit=form.querySelector(".submit-booking"),message=document.querySelector("#booking-message");
    let slot=null,partySize=0,ready=false,userOpen=false;
    form.elements.phone.addEventListener("input",event=>{event.target.value=formatPhone(event.target.value);});
    function joining(){return Boolean(slot&&slot.bookedCount>0&&slot.openRoom&&slot.canJoin);}
    function isOpen(){return joining()||partySize<(theme?.minPlayers||4)||Boolean(openInput.checked);}
    function setMessage(text="",type="error"){message.className=`form-message ${text?type:""}`;message.textContent=text;}
    function renderPicker(max,preferred){picker.innerHTML=Array.from({length:max},(_,i)=>i+1).map(n=>`<button type="button" data-party="${n}" class="${n===preferred?"is-selected":""}" aria-pressed="${n===preferred}"><strong>${n}</strong><span>명</span></button>`).join("");partySize=preferred;picker.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{picker.querySelectorAll("button").forEach(x=>{x.classList.remove("is-selected");x.setAttribute("aria-pressed","false");});button.classList.add("is-selected");button.setAttribute("aria-pressed","true");partySize=Number(button.dataset.party);update();}));}
    function update(){
      const forced=joining()||partySize<theme.minPlayers;
      openInput.disabled=forced;if(forced)openInput.checked=true;else openInput.checked=userOpen;
      openChoice.classList.toggle("is-selected",openInput.checked);openChoice.classList.toggle("is-forced",forced);
      const title=openChoice.querySelector("strong"),desc=openChoice.querySelector("p");
      if(joining()){title.textContent="현재 오픈룸에 합류합니다.";desc.textContent=`현재 ${slot.bookedCount}/${slot.capacity}명입니다. 선택한 인원이 같은 회차에 합산됩니다.`;}
      else if(partySize<theme.minPlayers){title.textContent=`${theme.minPlayers}명 미만은 오픈룸으로 예약합니다.`;desc.textContent="다른 팀이 같은 회차의 남은 자리를 예약할 수 있습니다.";}
      else{title.textContent="남은 자리를 다른 팀에게 열기";desc.textContent="선택하지 않으면 단독팀으로 마감되고, 선택하면 다른 팀이 합류할 수 있습니다.";}
      const open=isOpen();openIntro.hidden=!open;request.required=open;request.minLength=open?2:0;
      document.querySelector("#party-count").textContent=partySize||"-";document.querySelector("#total-price").textContent=partySize?money(theme.price*partySize):"-";document.querySelector("#submit-price").textContent=partySize?money(theme.price*partySize):"-";
    }
    openInput.addEventListener("change",()=>{if(!openInput.disabled)userOpen=openInput.checked;update();});
    async function load(){
      ready=false;submit.disabled=true;status.className="room-status loading";status.innerHTML=`<i></i><strong>회차를 확인하고 있습니다.</strong>`;
      try{
        const data=await api(`/availability?date=${encodeURIComponent(playDate)}&theme=${encodeURIComponent(theme.id)}`),current=data.themes?.[0]?.times?.find(x=>x.time===startTime);
        if(!current)throw new Error("선택한 회차를 찾을 수 없습니다.");slot=current;const info=roomInfo(slot,theme);status.className=`room-status ${info.tone}`;status.innerHTML=`<span>${h(info.label)}</span><strong>${h(info.detail)}</strong><small>${info.roomState==="AVAILABLE"?`이 사건은 최대 ${theme.totalCapacity}명까지 참여할 수 있습니다.`:h(info.action)}</small>`;
        if(!info.canBook){picker.innerHTML="";submit.disabled=true;submit.querySelector("span").textContent="예약할 수 없는 회차입니다";return;}
        const max=info.roomState==="AVAILABLE"?theme.totalCapacity:info.remaining,preferred=info.roomState==="AVAILABLE"?Math.min(theme.minPlayers,max):1;renderPicker(max,preferred);ready=true;submit.disabled=false;submit.querySelector("span").textContent=joining()?"오픈룸 합류 예약":"예약 확정하기";update();
      }catch(error){status.className="room-status closed";status.innerHTML=`<strong>회차를 확인하지 못했습니다.</strong><p>${h(error.message)}</p><button type="button">다시 확인</button>`;status.querySelector("button")?.addEventListener("click",load);}
    }
    const paymentGuide=document.querySelector("#payment-guide");
    if(state.payment.onlineEnabled){paymentGuide.innerHTML=`<strong>온라인 카드 결제</strong><p>예약 정보를 입력한 뒤 카드 결제를 진행합니다. 결제가 완료되어야 예약이 확정됩니다.</p>`;}
    else{paymentGuide.innerHTML=`<strong>매장 결제</strong><p>예약은 바로 확정되며, 이용 금액은 방문하신 날 매장에서 결제합니다.</p>`;}
    form.addEventListener("submit",async event=>{
      event.preventDefault();setMessage();
      if(!ready||!partySize)return;
      if(!form.reportValidity()){setMessage("필수 입력 항목과 동의 내용을 확인해 주세요.");return;}
      const original=submit.querySelector("span").textContent;submit.disabled=true;submit.querySelector("span").textContent="회차를 다시 확인하고 있습니다";
      try{
        const latest=await api(`/availability?date=${encodeURIComponent(playDate)}&theme=${encodeURIComponent(theme.id)}`),latestSlot=latest.themes?.[0]?.times?.find(x=>x.time===startTime);if(!latestSlot)throw new Error("회차 정보를 확인할 수 없습니다.");const info=roomInfo(latestSlot,theme);if(!info.canBook)throw new Error("선택한 회차가 방금 마감되었습니다.");if(info.roomState!=="AVAILABLE"&&partySize>info.remaining)throw new Error(`현재 남은 자리는 ${info.remaining}자리입니다.`);
        const values=Object.fromEntries(new FormData(form)),open=(latestSlot.bookedCount>0&&latestSlot.openRoom&&latestSlot.canJoin)||partySize<theme.minPlayers||Boolean(openInput.checked),intro=String(values.specialRequest||"").trim();if(open&&intro.length<2)throw new Error("오픈룸 소개를 입력해 주세요.");
        const result=await api("/reservations",{method:"POST",body:JSON.stringify({themeId:theme.id,playDate,startTime,customerName:values.customerName,phone:values.phone,partySize,openRoom:open,specialRequest:intro,privacyConsent:true,cancellationConsent:true})},16000);
        sessionStorage.setItem("crimescene-last-reservation",JSON.stringify(result));location.href=path("reservations/complete");
      }catch(error){setMessage(error.message);submit.disabled=false;submit.querySelector("span").textContent=original;await load();}
    });
    load();
  }

  function reservationCompletePage() {
    let result=null;try{result=JSON.parse(sessionStorage.getItem("crimescene-last-reservation")||"null");}catch{}
    const r=result?.reservation;
    if(!r)return `<main id="main-content" class="complete-page"><section><div class="complete-mark">!</div><h1>예약 정보를 찾을 수 없습니다.</h1><p>예약 확인 화면에서 이름과 휴대폰 번호로 다시 조회할 수 있습니다.</p><div><a class="button primary" href="${path("reservations/lookup")}">예약 확인</a><a class="button secondary" href="${path()}">홈으로</a></div></section></main>`;
    const info=roomInfo(r.room||{}),isPrivate=r.bookingMode==="PRIVATE";
    return `<main id="main-content" class="complete-page"><section><div class="complete-mark">${iconCheck}</div><p>예약 완료</p><h1>예약이 확정되었습니다.</h1><span>${state.payment.onlineEnabled?"결제 결과와 예약 내용을 확인해 주세요.":"이용 금액은 방문하신 날 매장에서 결제합니다."}</span><dl><div><dt>사건</dt><dd>${h(r.themeTitle)}</dd></div><div><dt>날짜</dt><dd>${h(formatDate(r.playDate))}</dd></div><div><dt>시간</dt><dd>${h(r.startTime)}</dd></div><div><dt>인원</dt><dd>${r.partySize}명</dd></div><div><dt>이용 금액</dt><dd>${money(r.totalAmount)}</dd></div><div><dt>예약 상태</dt><dd>${h(STATUS[r.status]||"예약 확정")}</dd></div></dl><article class="complete-room ${isPrivate?"private":info.tone}"><span>${isPrivate?"예약 방식":"오픈룸 현황"}</span><strong>${isPrivate?"단독팀 예약":h(info.label)}</strong><p>${isPrivate?"예약한 인원끼리만 플레이합니다.":h(info.detail)}</p></article><p class="arrival-note">배역 안내를 위해 시작 ${state.settings.arrivalMinutes}분 전까지 도착해 주세요.</p><div><a class="button primary" href="${path("reservations/lookup")}">예약 확인하기</a><a class="button secondary" href="${path()}">홈으로</a></div></section></main>`;
  }

  function reservationLookupPage() {
    return `${header("reservations")}<main id="main-content">${pageTitle("예약 확인·취소","예약할 때 입력한 정보를 적어 주세요.","이름과 휴대폰 번호가 일치하는 최근 예약을 확인합니다.","lookup-title")}<section class="section lookup-shell">${reservationNav("lookup")}<div class="lookup-layout"><aside><p>예약 조회</p><h2>별도의 예약번호는<br>필요하지 않습니다.</h2><span>예약할 때 사용한 이름과 휴대폰 번호만 입력하면 예약 상태, 오픈룸 현황과 취소 가능 여부를 확인할 수 있습니다.</span><dl><div><dt>온라인 취소</dt><dd>이용 ${state.settings.cancellationCutoffHours}시간 전까지</dd></div><div><dt>이후 변경</dt><dd>${h(state.settings.phone)}로 문의</dd></div></dl></aside><div><form id="lookup-form" class="lookup-form"><label class="field"><span>예약자 이름</span><input name="customerName" autocomplete="name" maxlength="20" required placeholder="이름"></label><label class="field"><span>휴대폰 번호</span><input name="phone" autocomplete="tel" inputmode="tel" maxlength="13" required placeholder="010-0000-0000"></label><button type="submit">예약 조회하기</button><div id="lookup-message" role="alert"></div></form><div id="lookup-results"></div></div></div></section></main>${footer()}`;
  }

  function bindLookupPage() {
    const form=document.querySelector("#lookup-form"),results=document.querySelector("#lookup-results"),message=document.querySelector("#lookup-message");if(!form)return;
    form.elements.phone.addEventListener("input",event=>{event.target.value=formatPhone(event.target.value);});let identity=null;
    function render(items){
      if(!items.length){results.innerHTML=`<div class="empty-results"><strong>일치하는 예약이 없습니다.</strong><p>이름과 휴대폰 번호를 다시 확인해 주세요.</p></div>`;return;}
      results.innerHTML=`<div class="result-heading"><strong>예약 내역</strong><span>${items.length}건</span></div><div class="reservation-results">${items.map(item=>{const info=roomInfo(item.room||{}),privateRoom=!item.openRoom,cancelable=!["CANCELED","CANCEL_REQUESTED","COMPLETED","NO_SHOW"].includes(item.status);return `<article><header><span class="status status-${String(item.status).toLowerCase()}">${h(STATUS[item.status]||item.status)}</span><h3>${h(item.themeTitle)}</h3><time>${h(formatDate(item.playDate))} · ${h(item.startTime)}</time></header><dl><div><dt>예약 인원</dt><dd>${item.partySize}명</dd></div><div><dt>연락처</dt><dd>${h(item.phoneMasked)}</dd></div><div><dt>이용 금액</dt><dd>${money(item.totalAmount)}</dd></div><div><dt>예약 방식</dt><dd>${privateRoom?"단독팀":"오픈룸"}</dd></div></dl><section class="lookup-room ${privateRoom?"private":info.tone}"><span>${privateRoom?"단독팀 예약":h(info.label)}</span><p>${privateRoom?"다른 팀이 합류하지 않습니다.":h(info.detail)}</p>${item.openRoomMessage?`<small>내가 남긴 소개: ${h(item.openRoomMessage)}</small>`:""}</section>${cancelable?`<footer><button type="button" data-cancel="${h(item.lookupCode)}">예약 취소</button></footer>`:""}</article>`;}).join("")}</div>`;
      results.querySelectorAll("[data-cancel]").forEach(button=>button.addEventListener("click",async()=>{if(!identity||!confirm(`예약을 취소하시겠습니까?\n이용 ${state.settings.cancellationCutoffHours}시간 전부터는 온라인 취소가 제한됩니다.`))return;button.disabled=true;try{const response=await api("/reservations/cancel",{method:"POST",body:JSON.stringify({lookupCode:button.dataset.cancel,customerName:identity.customerName,phone:identity.phone,reason:"고객 온라인 취소"})});toast(response.message,"success");form.requestSubmit();}catch(error){toast(error.message,"error");button.disabled=false;}}));
    }
    form.addEventListener("submit",async event=>{event.preventDefault();if(!form.reportValidity())return;identity=Object.fromEntries(new FormData(form));message.innerHTML=`<div class="mini-loader"><i></i>예약을 찾고 있습니다.</div>`;results.innerHTML="";try{const data=await api("/reservations/lookup",{method:"POST",body:JSON.stringify(identity)});message.innerHTML="";render(data.reservations||[]);}catch(error){message.innerHTML=`<p class="inline-error">${h(error.message)}</p>`;}});
  }

  function guidePage() {
    return `${header("guide")}<main id="main-content">${pageTitle("이용 안내","예약부터 플레이까지","처음 방문하셔도 순서대로 안내해 드립니다.")}<section class="section guide-overview"><div><p>크라임씬플레이란?</p><h2>모든 참가자가 사건 속 인물이 되는 추리게임입니다.</h2></div><span>단순히 자물쇠를 푸는 방식이 아니라, 각자 맡은 배역으로 현장을 조사하고 증거를 모은 뒤 서로 대화하며 범인을 찾습니다.</span></section><section class="section guide-steps"><article><span>1</span><div><h3>사건과 회차 예약</h3><p>실시간 예약표에서 날짜, 사건, 시간을 선택합니다. 1~3명은 오픈룸으로 예약합니다.</p></div></article><article><span>2</span><div><h3>${state.settings.arrivalMinutes}분 전 도착</h3><p>예약자 이름을 말씀해 주시면 배역 배정과 게임 안내를 시작합니다.</p></div></article><article><span>3</span><div><h3>배역과 개인 정보 확인</h3><p>본인이 맡은 인물의 관계와 사건 당시 상황을 확인합니다.</p></div></article><article><span>4</span><div><h3>현장 조사와 대화</h3><p>공간과 소품에서 단서를 찾고, 서로의 진술을 비교합니다.</p></div></article><article><span>5</span><div><h3>범인 지목과 해설</h3><p>최종 추리를 제출한 뒤 사건의 전말과 각 인물의 이야기를 확인합니다.</p></div></article></section><section class="section open-room-guide"><header><p>오픈룸 안내</p><h2>적은 인원도 같은 회차의 다른 팀과 함께 예약할 수 있습니다.</h2></header><div><article><strong>1~3명</strong><p>오픈룸으로 자동 예약됩니다. 같이 플레이할 분들이 확인할 간단한 소개를 남겨 주세요.</p></article><article><strong>4명 이상</strong><p>예약한 인원끼리만 플레이할지, 남은 자리를 오픈룸으로 열지 선택할 수 있습니다.</p></article><article><strong>진행 기준</strong><p>전체 인원이 4명 이상 모이면 게임을 진행할 수 있습니다. 예약표에 상태가 표시됩니다.</p></article></div></section><section class="section guide-notes"><header><p>방문 전 확인</p><h2>원활한 진행을 위한 안내</h2></header><ul><li><strong>시간</strong><span>게임 시작 후에는 배역 설명과 진행 흐름 때문에 중도 입장이 어렵습니다.</span></li><li><strong>내용 보호</strong><span>다음 참가자를 위해 사건의 정답과 핵심 단서는 외부에 공개하지 말아 주세요.</span></li><li><strong>예약 정보</strong><span>휴대폰 번호를 잘못 입력하면 예약 확인과 운영 안내가 어려울 수 있습니다.</span></li><li><strong>취소</strong><span>이용 ${state.settings.cancellationCutoffHours}시간 전까지 온라인 취소가 가능하며 이후에는 매장으로 문의해 주세요.</span></li></ul></section></main>${footer()}`;
  }

  function noticesPage() {
    return `${header("notices")}<main id="main-content">${pageTitle("공지사항","매장 운영 안내","예약 전에 확인해야 할 내용을 알려드립니다.")}<section class="section notice-layout"><aside><strong>공지사항</strong><span>중요한 안내는 위쪽에 먼저 표시됩니다.</span><a href="${path("faq")}">궁금한 점 문의하기 ${iconArrow}</a></aside><div id="notice-list"><div class="loading-panel"><i></i><strong>공지사항을 불러오고 있습니다.</strong></div></div></section></main>${footer()}`;
  }
  async function bindNoticesPage() {
    const host=document.querySelector("#notice-list");if(!host)return;try{const data=await api("/notices");if(!data.notices?.length){host.innerHTML=`<div class="empty-results"><strong>등록된 공지가 없습니다.</strong><p>새로운 안내가 생기면 이곳에 게시됩니다.</p></div>`;return;}host.innerHTML=`<div class="notice-list">${data.notices.map((notice,index)=>`<article><header><span>${notice.pinned?"중요":"공지"}</span><time>${h(formatDateTime(notice.created_at))}</time></header><h2>${h(notice.title)}</h2><p>${h(notice.content).replace(/\n/g,"<br>")}</p></article>`).join("")}</div>`;}catch(error){host.innerHTML=`<div class="error-panel"><strong>공지사항을 불러오지 못했습니다.</strong><p>${h(error.message)}</p></div>`;}
  }

  function faqPage() {
    const faqs=[
      ["몇 명부터 게임을 진행할 수 있나요?","전체 참가자가 4명 이상 모여야 합니다. 1~3명은 오픈룸으로 예약해 같은 회차의 다른 팀과 합류할 수 있습니다."],
      ["오픈룸은 어떻게 예약하나요?","실시간 예약표에서 오픈룸 모집 중인 회차를 선택하면 기존 팀에 합류합니다. 빈 회차에서 1~3명을 선택하면 새 오픈룸이 만들어집니다."],
      ["처음 해보는 사람도 참여할 수 있나요?","가능합니다. 입장 전에 배역과 게임 진행 방법을 안내하므로 별도의 사전 경험이 필요하지 않습니다."],
      ["플레이 시간은 얼마나 걸리나요?",`대부분의 사건은 약 90분 진행됩니다. 배역 안내를 위해 시작 ${state.settings.arrivalMinutes}분 전까지 도착해 주세요.`],
      ["예약은 어떻게 확인하나요?","예약번호 없이 예약자 이름과 휴대폰 번호로 확인할 수 있습니다."],
      ["예약을 취소하려면 어떻게 하나요?",`예약 확인·취소 화면에서 이용 ${state.settings.cancellationCutoffHours}시간 전까지 취소할 수 있습니다. 이후에는 매장으로 문의해 주세요.`],
    ];
    return `${header("guide")}<main id="main-content">${pageTitle("자주 묻는 질문","궁금한 내용을 확인해 보세요.","찾는 내용이 없으면 아래 문의 양식을 이용해 주세요.")}<section class="section faq-layout"><div class="faq-list">${faqs.map(([q,a],i)=>`<details ${i===0?"open":""}><summary><span>${String(i+1).padStart(2,"0")}</span><strong>${h(q)}</strong><i>+</i></summary><p>${h(a)}</p></details>`).join("")}</div><aside class="inquiry-card"><p>1:1 문의</p><h2>문의 내용을 남겨 주세요.</h2><span>확인 후 입력하신 연락처로 안내드립니다.</span><form id="inquiry-form"><label class="field"><span>이름</span><input name="customerName" maxlength="20" required></label><label class="field"><span>휴대폰 번호</span><input name="phone" inputmode="tel" maxlength="13" required></label><label class="field"><span>제목</span><input name="subject" maxlength="100" required></label><label class="field"><span>문의 내용</span><textarea name="content" minlength="10" maxlength="2000" required></textarea></label><label class="simple-check"><input type="checkbox" name="privacyConsent" required><span class="check-box">${iconCheck}</span><span>수집 항목: 이름, 휴대폰 번호, 문의 내용. 문의 확인과 답변에 사용하며 분쟁 처리 기록은 3년간 보관합니다. 동의를 거부할 수 있으나 문의 접수는 진행할 수 없습니다.</span></label><div id="inquiry-message" role="alert"></div><button type="submit">문의 접수하기</button></form></aside></section></main>${footer()}`;
  }
  function bindFaqPage() {
    const form=document.querySelector("#inquiry-form");if(!form)return;form.elements.phone.addEventListener("input",event=>{event.target.value=formatPhone(event.target.value);});form.addEventListener("submit",async event=>{event.preventDefault();if(!form.reportValidity())return;const button=form.querySelector("button"),message=document.querySelector("#inquiry-message"),values=Object.fromEntries(new FormData(form));button.disabled=true;button.textContent="접수 중";try{const result=await api("/inquiries",{method:"POST",body:JSON.stringify({...values,privacyConsent:true})});message.innerHTML=`<p class="inline-success">${h(result.message)}</p>`;form.reset();}catch(error){message.innerHTML=`<p class="inline-error">${h(error.message)}</p>`;}finally{button.disabled=false;button.textContent="문의 접수하기";}});
  }

  function locationPage() {
    const s=state.settings,map=encodeURIComponent(s.mapQuery||`${s.addressRoad} ${s.addressDetail}`),naver=encodeURIComponent(`${s.addressRoad} ${s.addressDetail}`);
    return `${header("location")}<main id="main-content">${pageTitle("오시는 길",`${s.storeName} ${s.branchName}`,"주소와 연락처를 확인해 주세요.")}<section class="section location-layout"><div class="map-frame"><iframe title="${h(s.storeName)} ${h(s.branchName)} 지도" src="https://www.google.com/maps?q=${map}&z=17&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div><article><p>${h(s.branchName)}</p><h2>${h(s.addressRoad)}<br>${h(s.addressDetail)}</h2><dl><div><dt>예약 문의</dt><dd><a href="${phoneHref(s.phone)}">${h(s.phone)}</a></dd></div><div><dt>도착 시간</dt><dd>예약 시작 ${s.arrivalMinutes}분 전</dd></div><div><dt>운영 방식</dt><dd>회차별 예약 운영</dd></div></dl><div><a class="button primary" href="https://map.naver.com/p/search/${naver}" target="_blank" rel="noreferrer">네이버 지도 열기 ${iconArrow}</a><a class="button secondary" href="${phoneHref(s.phone)}">전화 문의</a></div><small>지도 위치와 건물명은 방문 전에 한 번 더 확인해 주세요.</small></article></section></main>${footer()}`;
  }

  function policyPage(kind) {
    const s=state.settings;
    const policies={
      terms:{title:"이용약관",desc:"예약 및 체험 서비스 이용에 관한 기본 조건입니다.",sections:[
        ["1. 목적",`${s.storeName}(이하 “매장”)이 제공하는 예약 및 체험 서비스의 이용 조건과 이용자와 매장 사이의 권리·의무를 정합니다.`],
        ["2. 예약의 성립",state.payment.onlineEnabled?"이용자가 예약 정보를 제출하고 온라인 결제를 완료한 뒤 매장이 예약을 확정하면 예약이 성립합니다.":"이용자가 예약 정보를 제출하고 화면에 예약 확정 결과가 표시되면 예약이 성립합니다. 이용 금액은 방문 당일 매장에서 결제합니다."],
        ["3. 정확한 정보 입력","이용자는 예약 확인과 운영 안내를 받을 수 있도록 정확한 이름과 휴대폰 번호를 입력해야 합니다. 잘못된 정보로 안내를 받지 못한 경우 매장으로 문의해 주세요."],
        ["4. 이용 시간과 입장",`배역 배정과 안내를 위해 시작 ${s.arrivalMinutes}분 전까지 도착해 주세요. 시작 후에는 전체 진행 흐름 때문에 입장이 제한되거나 이용 시간이 줄어들 수 있습니다.`],
        ["5. 콘텐츠 보호","사건의 정답, 핵심 단서와 진행 내용을 외부에 공개해 다른 이용자의 체험을 방해해서는 안 됩니다."],
        ["6. 서비스 변경","시설 점검, 안전 또는 불가피한 운영 사유가 발생하면 매장은 일정을 변경하거나 예약을 취소할 수 있으며, 유료 결제가 완료된 경우 해당 금액을 환급합니다."],
        ["7. 문의",`${s.phone} / ${s.email}`],
      ]},
      privacy:{title:"개인정보처리방침",desc:"예약과 문의 처리에 필요한 정보만 수집하고 안전하게 관리합니다.",sections:[
        ["1. 수집하는 개인정보","예약 시 이름, 휴대폰 번호, 선택한 사건·날짜·시간·인원, 오픈룸 소개 또는 요청사항을 수집합니다. 문의 시 이름, 휴대폰 번호, 제목과 문의 내용을 수집합니다."],
        ["2. 이용 목적","예약 확인·변경·취소, 회차 및 오픈룸 운영, 매장 안내, 결제 처리(온라인 결제 사용 시), 문의 답변과 분쟁 대응에 사용합니다."],
        ["3. 보유 기간","계약 또는 청약철회·예약 취소 기록과 대금결제 및 서비스 제공 기록은 5년, 소비자 불만 또는 분쟁 처리 기록은 3년간 보관합니다. 그 밖에 법령상 보존 의무가 없는 정보는 이용 목적이 끝난 뒤 지체 없이 파기합니다."],
        ["4. 제3자 제공","법령에 근거가 있거나 이용자가 별도로 동의한 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다. 온라인 결제를 사용하는 경우 결제 처리를 위해 결제대행사에 필요한 정보가 전달될 수 있으며 결제 화면에서 별도로 안내합니다."],
        ["5. 안전성 확보 조치","개인정보에 대한 접근 권한을 제한하고 전송 구간 보호, 중요 정보의 암호화, 접속 기록 관리 등 필요한 보호 조치를 적용합니다."],
        ["6. 이용자의 권리","이용자는 본인의 개인정보 열람, 정정, 삭제 또는 처리 정지를 요청할 수 있습니다. 법령상 보관 의무가 있는 정보는 해당 기간 동안 삭제가 제한될 수 있습니다."],
        ["7. 개인정보 보호 문의",`${s.privacyOfficerName} · ${s.privacyOfficerContact}`],
      ]},
      refunds:{title:"예약 취소 안내",desc:"예약 변경과 취소에 적용되는 기준입니다.",sections:[
        ["1. 온라인 취소",`이용 시작 ${s.cancellationCutoffHours}시간 전까지 예약 확인·취소 화면에서 직접 취소할 수 있습니다.`],
        ["2. 취소 가능 시간이 지난 경우",`이용 시작 ${s.cancellationCutoffHours}시간 전부터는 온라인 취소가 제한됩니다. ${s.phone}로 문의해 주세요. 결제 완료 예약의 환급 여부와 금액은 예약 시 표시된 기준과 관계 법령에 따릅니다.`],
        ["3. 예약 변경","사건, 날짜, 시간 또는 인원 변경이 필요한 경우 매장으로 문의해 주세요. 변경할 회차의 잔여 인원에 따라 변경이 어려울 수 있습니다."],
        ["4. 지각과 미방문","지각하면 전체 이용 시간이 줄어들 수 있으며 시작 후 입장이 제한될 수 있습니다. 연락 없이 방문하지 않은 경우 환급이 제한될 수 있습니다."],
        ["5. 매장 사유 취소","시설 또는 운영상의 사유로 예약한 서비스를 제공하지 못하는 경우 일정 변경 또는 결제 금액 전액 환급을 안내합니다."],
        ["6. 문의",`${s.phone} / ${s.email}`],
      ]},
    };
    const data=policies[kind]||policies.terms;
    return `${header("guide")}<main id="main-content">${pageTitle("약관 및 정책",data.title,data.desc,"policy-title")}<section class="section policy-layout"><aside><strong>약관 및 정책</strong><a class="${kind==="terms"?"is-current":""}" href="${path("policies/terms")}">이용약관</a><a class="${kind==="privacy"?"is-current":""}" href="${path("policies/privacy")}">개인정보처리방침</a><a class="${kind==="refunds"?"is-current":""}" href="${path("policies/refunds")}">예약 취소 안내</a><small>시행일: 2026년 8월 16일</small></aside><article>${data.sections.map(([title,content])=>`<section><h2>${h(title)}</h2><p>${h(content)}</p></section>`).join("")}</article></section></main>${footer()}`;
  }

  function notFoundPage() { return `<main id="main-content" class="not-found"><strong>404</strong><h1>페이지를 찾을 수 없습니다.</h1><p>주소가 바뀌었거나 존재하지 않는 페이지입니다.</p><a class="button primary" href="${path()}">홈으로 돌아가기</a></main>`; }

  function render() {
    if(!app)return;
    let html="";
    if(route==="home")html=homePage();
    else if(route==="themes")html=themesPage();
    else if(route.startsWith("theme:"))html=themePage(route.split(":")[1]);
    else if(route==="reservations")html=reservationsPage();
    else if(route==="reservation-new")html=reservationNewPage();
    else if(route==="reservation-complete")html=reservationCompletePage();
    else if(route==="reservation-lookup")html=reservationLookupPage();
    else if(route==="guide")html=guidePage();
    else if(route==="notices")html=noticesPage();
    else if(route==="faq")html=faqPage();
    else if(route==="location")html=locationPage();
    else if(route.startsWith("policy:"))html=policyPage(route.split(":")[1]);
    else html=notFoundPage();
    app.innerHTML=html;
  }

  function bindCommon() {
    const drawer=document.querySelector(".mobile-drawer"),backdrop=document.querySelector(".drawer-backdrop"),open=document.querySelector(".menu-open"),close=document.querySelector(".menu-close");
    function setDrawer(show){if(!drawer||!backdrop||!open)return;drawer.classList.toggle("is-open",show);drawer.setAttribute("aria-hidden",String(!show));backdrop.hidden=!show;open.setAttribute("aria-expanded",String(show));document.body.classList.toggle("drawer-open",show);}
    open?.addEventListener("click",()=>setDrawer(true));close?.addEventListener("click",()=>setDrawer(false));backdrop?.addEventListener("click",()=>setDrawer(false));addEventListener("keydown",event=>{if(event.key==="Escape")setDrawer(false);});
    addEventListener("scroll",()=>document.querySelector(".site-header")?.classList.toggle("is-scrolled",scrollY>20),{passive:true});
  }

  async function boot() {
    document.documentElement.classList.add("customer-ui");
    try {
      const data=await api("/bootstrap",{},7000);
      if(data?.settings)state.settings={...FALLBACK_SETTINGS,...data.settings};
      if(Array.isArray(data?.themes)&&data.themes.length)state.themes=data.themes;
      if(data?.payment)state.payment=data.payment;
      state.bootstrapOnline=true;
    } catch (error) {
      console.warn("기본 운영 정보로 화면을 표시합니다.",error);
    }
    render();bindCommon();
    if(route==="reservations")bindReservationsPage();
    if(route==="reservation-new")bindReservationNewPage();
    if(route==="reservation-lookup")bindLookupPage();
    if(route==="notices")bindNoticesPage();
    if(route==="faq")bindFaqPage();
    return true;
  }

  globalThis.__CRIMESCENE_READY__=boot().catch(error=>{
    console.error(error);
    if(app)app.innerHTML=`<main class="fatal-page"><section><h1>페이지를 불러오지 못했습니다.</h1><p>잠시 후 새로고침해 주세요. 같은 문제가 계속되면 ${h(FALLBACK_SETTINGS.phone)}으로 문의해 주세요.</p><div><button type="button" onclick="location.reload()">새로고침</button><a href="${path("reservations")}">예약 화면</a></div></section></main>`;
    return false;
  });
})();
