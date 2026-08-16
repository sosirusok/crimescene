(() => {
  "use strict";

  const API = "https://jhjbiejqtbidloxcwryr.supabase.co/functions/v1/api";
  const PUBLISHABLE_KEY = "sb_publishable_mA5DOfPA-ExloawT3aJpNw_2PeVgEEc";
  const route = document.body.dataset.route || "home";
  const firstSegment = location.pathname.split("/").filter(Boolean)[0];
  const BASE = location.hostname.endsWith("github.io") && firstSegment ? `/${firstSegment}` : "";
  const app = document.querySelector("#app");

  const fallbackThemes = [
    { id:"A",slug:"orientation",episode:7,title:"크라임씬 EP.7 신입생 오티 살인사건",shortTitle:"신입생 오티 살인사건",tagline:"모두가 같은 밤을 기억하지만, 진술은 서로 다르다.",synopsis:"환영회가 끝난 새벽, 텅 빈 연수원에 남겨진 것은 흩어진 명찰과 끊긴 기억뿐입니다. 가장 가까이 있었던 사람들이 가장 중요한 사실을 숨기고 있습니다.",difficulty:"★★★★☆",players:"용의자 4명 + 탐정 최대 4명",minPlayers:4,suspectCapacity:4,detectiveCapacity:4,totalCapacity:8,duration:90,price:23000,image:"/images/theme-orientation.webp",times:["10:00","11:30","13:20","15:10","17:00","18:50","20:40","22:30"] },
    { id:"B",slug:"youtuber",episode:8,title:"크라임씬 EP.8 유튜버 살인사건",shortTitle:"유튜버 살인사건",tagline:"마지막 생방송에서 사라진 12초, 누군가는 편집했다.",synopsis:"생방송이 끊긴 스튜디오. 카메라는 여전히 돌아가고 있지만 결정적인 장면만 사라졌습니다. 구독자에게 공개된 얼굴과 실제 관계 사이에서 진실을 찾아야 합니다.",difficulty:"★★★★☆",players:"용의자 5명 + 탐정 최대 4명",minPlayers:4,suspectCapacity:5,detectiveCapacity:4,totalCapacity:9,duration:90,price:23000,image:"/images/theme-youtuber.webp",times:["10:00","11:50","13:40","15:30","17:20","19:10","21:00","22:50"] },
    { id:"C",slug:"hotel",episode:3,title:"크라임씬 EP.3 호텔 살인사건",shortTitle:"호텔 살인사건",tagline:"잠든 듯 발견된 톱 여배우, 객실 열쇠는 하나뿐이었다.",synopsis:"화려한 호텔의 가장 조용한 객실에서 국내 톱 여배우가 숨진 채 발견됩니다. 완벽하게 통제된 동선과 서로 맞지 않는 투숙 기록을 추적하세요.",difficulty:"★★★★★",players:"용의자 5명 + 탐정 최대 4명",minPlayers:4,suspectCapacity:5,detectiveCapacity:4,totalCapacity:9,duration:90,price:23000,image:"/images/theme-hotel.webp",times:["10:00","12:10","14:00","15:50","17:40","19:30","21:20","23:10"] },
    { id:"D",slug:"cabin",episode:4,title:"크라임씬 EP.4 산장 살인사건",shortTitle:"산장 살인사건",tagline:"폭설로 고립된 산장, 발자국은 들어왔지만 나가지 않았다.",synopsis:"한밤의 폭설이 모든 길을 지운 뒤 산장 안에서 사건이 발생합니다. 외부인의 흔적은 없고, 출입문은 안에서 잠겨 있었습니다.",difficulty:"★★★★★",players:"용의자 4명 + 탐정 최대 4명",minPlayers:4,suspectCapacity:4,detectiveCapacity:4,totalCapacity:8,duration:90,price:23000,image:"/images/theme-cabin.webp",times:["11:00","12:30","14:20","16:10","18:00","19:50","21:40","23:30"] },
  ];

  const reservationStatusLabels = {
    PENDING_PAYMENT: "접수 완료",
    CONFIRMED: "예약 확정",
    COMPLETED: "이용 완료",
    CANCEL_REQUESTED: "취소 처리 중",
    CANCELED: "예약 취소",
    NO_SHOW: "미방문",
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
  const money = (value) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
  const pagePath = (value = "") => `${BASE}/${value}`.replace(/\/$/, value ? "/" : "");
  const asset = (value = "") => `${BASE}/images/${String(value).split("/").pop()}`;
  const arrow = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" stroke="currentColor" stroke-width="1.5"/></svg>`;
  const formatDate = (value) => new Intl.DateTimeFormat("ko-KR", { year:"numeric",month:"long",day:"numeric",weekday:"short" }).format(new Date(`${value}T12:00:00+09:00`));

  async function api(url, options = {}) {
    const response = await fetch(`${API}${url}`, {
      ...options,
      cache: "no-store",
      headers: { apikey:PUBLISHABLE_KEY, "Content-Type":"application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
    return data;
  }

  function replaceWithClone(element, deep = true) {
    if (!element) return null;
    const clone = element.cloneNode(deep);
    element.replaceWith(clone);
    return clone;
  }

  function toast(message, type = "") {
    let stack = document.querySelector(".toast-stack");
    if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; document.body.append(stack); }
    const item = document.createElement("div"); item.className = `toast ${type}`; item.textContent = message; stack.append(item);
    setTimeout(() => item.remove(), 4600);
  }

  function roomInfo(room = {}, theme = {}) {
    const state = room.state || room.roomState || "AVAILABLE";
    const count = Number(room.bookedCount || 0);
    const capacity = Number(room.capacity || theme.totalCapacity || 0);
    const minimum = Number(room.minimumPlayers || theme.minPlayers || 4);
    const remaining = Math.max(0, Number(room.remaining ?? capacity - count));
    const map = {
      AVAILABLE: { className:"cs-room-available", label:"예약 가능", detail:"새 팀이 단독 예약 또는 오픈룸 예약을 시작할 수 있습니다.", action:"예약하기" },
      OPEN_RECRUITING: { className:"cs-room-recruiting", label:`${count}/${capacity}명 · 오픈룸 모집 중`, detail:`현재 ${count}명입니다. ${Math.max(0, minimum-count)}명 이상 더 모이면 게임을 진행할 수 있습니다.`, action:`${remaining}자리 합류 가능` },
      OPEN_PLAYABLE: { className:"cs-room-playable", label:`${count}/${capacity}명 · 게임 진행 가능`, detail:`최소 인원 ${minimum}명이 충족되었습니다. 남은 ${remaining}자리도 합류할 수 있습니다.`, action:`${remaining}자리 합류 가능` },
      FULL: { className:"cs-room-full", label:`${count}/${capacity}명 · 정원 마감`, detail:"오픈룸 정원이 모두 예약되었습니다.", action:"예약 마감" },
      PRIVATE_BOOKED: { className:"cs-room-private", label:"단독팀 예약 완료", detail:"오픈룸이 아닌 단독팀 예약이므로 다른 팀은 합류할 수 없습니다.", action:"추가 예약 불가" },
      BLOCKED: { className:"cs-room-blocked", label:"운영 중지", detail:"매장 운영 사정으로 예약할 수 없는 회차입니다.", action:"예약 불가" },
    };
    return { state,count,capacity,minimum,remaining,...(map[state] || map.AVAILABLE) };
  }

  function normalizedThemes(input) {
    return (input || []).map((theme) => ({
      ...theme,
      minPlayers: Number(theme.minPlayers || 4),
      suspectCapacity: Number(theme.suspectCapacity || (theme.id === "B" || theme.id === "C" ? 5 : 4)),
      detectiveCapacity: Number(theme.detectiveCapacity || 4),
      totalCapacity: Number(theme.totalCapacity || (theme.id === "B" || theme.id === "C" ? 9 : 8)),
      duration: Number(theme.duration || 90),
      price: Number(theme.price || 23000),
      times: Array.isArray(theme.times) ? theme.times : [],
    }));
  }

  function capacityText(theme) {
    return `용의자 ${theme.suspectCapacity}명 + 탐정 최대 ${theme.detectiveCapacity}명 · 총 ${theme.totalCapacity}명`;
  }

  function patchHeader() {
    const copy = document.querySelector(".brand-copy small");
    if (copy) copy.textContent = "서면1호점 · 역할형 추리게임";
    const drawer = document.querySelector(".drawer-contact small");
    if (drawer) drawer.textContent = "서면1호점 예약 및 오픈룸 문의";
  }

  function exactOperatingGuide(themes) {
    return `<section class="cs-operation-guide"><div class="shell">
      <header><p>예약 전에 반드시 확인해 주세요</p><h2>최소 4명, 부족하면 오픈룸으로 합류합니다.</h2><span>이 게임은 각자 역할을 맡아 진행하는 추리게임입니다. 예약자가 1~3명인 경우 같은 사건과 같은 회차를 예약한 다른 팀과 합쳐서 플레이합니다.</span></header>
      <div class="cs-operation-rules"><article><b>01</b><strong>4명부터 게임 진행</strong><p>전체 참가자가 4명 이상 모여야 정상적으로 사건을 진행할 수 있습니다.</p></article><article><b>02</b><strong>1~3명은 오픈룸</strong><p>오픈룸을 선택하면 동일 회차의 다른 팀이 남은 자리를 추가 예약할 수 있습니다.</p></article><article><b>03</b><strong>현재 인원 실시간 표시</strong><p>예약표에서 현재 인원과 정원, 게임 가능 여부를 바로 확인할 수 있습니다.</p></article></div>
      <div class="cs-capacity-list">${themes.map((theme) => `<article><span>EP.${theme.episode}</span><h3>${escapeHtml(theme.shortTitle)}</h3><p>${escapeHtml(capacityText(theme))}</p><strong>최소 ${theme.minPlayers}명 · 최대 ${theme.totalCapacity}명</strong></article>`).join("")}</div>
    </div></section>`;
  }

  function patchHome(themes) {
    const dossier = document.querySelector(".hero-dossier dl");
    if (dossier) dossier.innerHTML = `<div><dt>이용 시간</dt><dd>90분</dd></div><div><dt>최소 인원</dt><dd>4명</dd></div><div><dt>예약 방식</dt><dd>단독 / 오픈룸</dd></div><div><dt>최대 인원</dt><dd>8~9명</dd></div>`;
    const statItems = document.querySelectorAll(".stat-grid > div");
    if (statItems[2]) statItems[2].innerHTML = `<svg viewBox="0 0 48 48" fill="none"><path d="M16 31c0-5 3-8 8-8s8 3 8 8M24 20a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM10 37h28" stroke="currentColor"/></svg><strong>최소 4명 · 최대 8~9명</strong><span>1~3명은 다른 팀과 합류하는 오픈룸으로 예약</span>`;
    const caseGrid = document.querySelector(".case-grid");
    if (caseGrid) caseGrid.innerHTML = themes.map((theme,index) => `<article class="case-card"><a href="${pagePath(`themes/${theme.slug}`)}"><img src="${asset(theme.image)}" alt="${escapeHtml(theme.shortTitle)}" loading="${index ? "lazy" : "eager"}"><span class="case-shade"></span><b class="case-index">사건 0${index+1}</b><div class="case-content"><p>에피소드 ${theme.episode} · ${theme.duration}분</p><h3>${escapeHtml(theme.shortTitle)}</h3><span>${escapeHtml(capacityText(theme))}</span></div></a></article>`).join("");
    const intro = document.querySelector(".intro-strip");
    if (intro && !document.querySelector(".cs-operation-guide")) intro.insertAdjacentHTML("afterend", exactOperatingGuide(themes));
    const heroLead = document.querySelector(".hero-lead");
    if (heroLead) heroLead.innerHTML = "사건 속 인물이 되어 현장을 조사하고 서로의 거짓을 밝혀내세요.<br>4명 이상 단독팀 또는 1~3명 오픈룸 합류 방식으로 예약할 수 있습니다.";
  }

  function patchThemesPage(themes) {
    const host = document.querySelector(".theme-list-section .shell");
    if (!host) return;
    host.innerHTML = themes.map((theme,index) => `<article class="theme-row"><a class="theme-row-image" href="${pagePath(`themes/${theme.slug}`)}"><img src="${asset(theme.image)}" alt="${escapeHtml(theme.shortTitle)}"><span>사건 파일 0${index+1}</span></a><div class="theme-row-copy"><p class="eyebrow">에피소드 ${theme.episode}</p><h2>${escapeHtml(theme.shortTitle)}</h2><blockquote>${escapeHtml(theme.tagline)}</blockquote><p>${escapeHtml(theme.synopsis)}</p><dl><div><dt>이용 시간</dt><dd>${theme.duration}분</dd></div><div><dt>역할 정원</dt><dd>${escapeHtml(capacityText(theme))}</dd></div><div><dt>난이도</dt><dd>${escapeHtml(theme.difficulty)}</dd></div><div><dt>이용 요금</dt><dd>${money(theme.price)} / 1인</dd></div></dl><div class="cs-minimum-note">최소 ${theme.minPlayers}명부터 진행 · 1~3명은 오픈룸 예약</div><div class="row-actions"><a class="button button-primary" href="${pagePath("reservations")}?theme=${theme.id}">예약 시간 보기 ${arrow}</a><a class="text-link" href="${pagePath(`themes/${theme.slug}`)}">사건 상세</a></div></div></article>`).join("");
  }

  function patchThemeDetail(themes) {
    const slug = route.split(":")[1];
    const theme = themes.find((item) => item.slug === slug);
    if (!theme) return;
    const hero = document.querySelector(".theme-detail-hero");
    hero?.querySelector("img")?.setAttribute("src", asset(theme.image));
    hero?.querySelector("img")?.setAttribute("alt", theme.shortTitle);
    const eyebrow = hero?.querySelector(".eyebrow"); if (eyebrow) eyebrow.textContent = `에피소드 ${theme.episode} · 최소 ${theme.minPlayers}명`;
    const title = hero?.querySelector("h1"); if (title) title.textContent = theme.shortTitle;
    const quote = hero?.querySelector("blockquote"); if (quote) quote.textContent = theme.tagline;
    const book = hero?.querySelector("a.button"); if (book) book.href = `${pagePath("reservations")}?theme=${theme.id}`;
    const synopsis = document.querySelector(".theme-brief .synopsis"); if (synopsis) synopsis.textContent = theme.synopsis;
    const aside = document.querySelector(".theme-brief aside");
    if (aside) aside.innerHTML = `<div><div class="difficulty-icon">${escapeHtml(theme.difficulty)}</div><span>난이도</span><strong>추리 난이도</strong></div><div><div class="price-icon">₩</div><span>1인 이용 요금</span><strong>${money(theme.price)}</strong></div><div><span class="difficulty-icon">${theme.duration}</span><span>이용 시간</span><strong>${theme.duration}분</strong></div><div><span class="difficulty-icon">${theme.totalCapacity}</span><span>역할 정원</span><strong>${escapeHtml(capacityText(theme))}</strong></div>`;
    const cards = document.querySelectorAll(".notice-cards article");
    if (cards[2]) cards[2].innerHTML = `<span>03</span><h3>최소 ${theme.minPlayers}명</h3><p>1~3명은 오픈룸으로 다른 팀과 합류할 수 있습니다. 이 사건은 최대 ${theme.totalCapacity}명까지 참여합니다.</p>`;
  }

  function patchGuide(themes) {
    const intro = document.querySelector(".guide-intro");
    if (intro && !document.querySelector(".cs-guide-openroom")) intro.insertAdjacentHTML("afterend", `<section class="cs-guide-openroom"><div><b>오픈룸 운영 방식</b><h3>인원이 부족해도 같은 회차의 다른 팀과 함께 예약할 수 있습니다.</h3><p>1~3명은 오픈룸을 선택해 예약하고, 예약표에는 현재 인원과 정원이 표시됩니다. 전체 인원이 4명 이상 모이면 게임을 진행할 수 있습니다.</p></div><div>${themes.map((theme)=>`<span><strong>${escapeHtml(theme.shortTitle)}</strong>${escapeHtml(capacityText(theme))}</span>`).join("")}</div></section>`);
    const firstStep = document.querySelector(".guide-steps article:first-child p");
    if (firstStep) firstStep.textContent = "실시간 예약표에서 현재 인원과 정원을 확인하고 단독팀 또는 오픈룸으로 예약한 뒤 시작 10분 전까지 도착합니다.";
  }

  function patchFaq() {
    const first = document.querySelector(".faq-list details:first-child p");
    if (first) first.textContent = "게임은 최소 4명부터 진행됩니다. 1~3명은 오픈룸으로 예약해 같은 사건과 같은 회차의 다른 팀과 합류할 수 있으며, 테마별 최대 인원은 8명 또는 9명입니다.";
  }

  function dateButtons() {
    const today = new Date();
    return Array.from({length:15},(_,index)=>{
      const date=new Date(today); date.setDate(today.getDate()+index);
      const value=[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
      return {value,date,index};
    });
  }

  function patchReservationBoard(themes) {
    const oldSchedule=document.querySelector("#schedule"),oldDates=document.querySelector(".date-scroll"),oldFilters=document.querySelector(".filter-buttons");
    if(!oldSchedule||!oldDates||!oldFilters) return;
    const schedule=replaceWithClone(oldSchedule,false),dates=replaceWithClone(oldDates,false),filters=replaceWithClone(oldFilters,false);
    if(!schedule||!dates||!filters) return;
    dates.innerHTML=dateButtons().map(({value,date,index})=>`<button type="button" data-date="${value}" class="${index===0?"is-selected":""}"><small>${index===0?"오늘":new Intl.DateTimeFormat("ko-KR",{weekday:"short"}).format(date)}</small><strong>${date.getDate()}</strong><span>${date.getMonth()+1}월</span></button>`).join("");
    const initialTheme=new URLSearchParams(location.search).get("theme")||"";
    filters.innerHTML=`<button type="button" data-theme="" class="${initialTheme?"":"is-selected"}">전체 사건</button>${themes.map((t)=>`<button type="button" data-theme="${t.id}" class="${initialTheme===t.id?"is-selected":""}">${escapeHtml(t.shortTitle)}</button>`).join("")}`;
    const notice=document.querySelector(".reservation-notice p"); if(notice) notice.textContent="게임은 최소 4명부터 진행됩니다. 1~3명은 오픈룸으로 예약하여 같은 회차의 다른 팀과 합류합니다. 예약표에서 현재 인원과 테마별 정원 8명 또는 9명을 확인해 주세요.";
    const legend=document.querySelector(".slot-legend"); if(legend) legend.innerHTML=`<span><i class="available"></i>새 예약</span><span><i class="open"></i>오픈룸 모집</span><span><i class="cs-legend-playable"></i>진행 가능</span><span><i></i>마감</span>`;
    let selectedDate=dates.querySelector("[data-date]")?.dataset.date||"",selectedTheme=initialTheme,requestId=0;
    async function load(){
      const current=++requestId; schedule.innerHTML=`<div class="schedule-state"><span class="loader"></span><p>오픈룸 인원과 남은 자리를 확인하고 있습니다.</p></div>`;
      try{
        const data=await api(`/availability?date=${encodeURIComponent(selectedDate)}${selectedTheme?`&theme=${encodeURIComponent(selectedTheme)}`:""}`); if(current!==requestId)return;
        schedule.innerHTML=`<div class="schedule-list">${data.themes.map((theme)=>`<article class="schedule-theme"><div class="schedule-theme-info"><img src="${asset(theme.image)}" alt="${escapeHtml(theme.shortTitle)}"><div><small>EP.${theme.episode}</small><h3>${escapeHtml(theme.shortTitle)}</h3><p>${theme.duration}분 · ${money(theme.price)} / 1인</p><strong>${escapeHtml(capacityText(theme))}</strong></div></div><div class="time-grid">${theme.times.map((slot)=>{
          const info=roomInfo(slot,theme),reservable=info.state==="AVAILABLE"||slot.canJoin===true;
          const href=`${pagePath("reservations/new")}?${new URLSearchParams({theme:theme.id,date:selectedDate,time:slot.time})}`;
          return reservable?`<a class="time-slot ${info.className}" href="${href}"><strong>${escapeHtml(slot.time)}</strong><span>${escapeHtml(info.label)}</span><small>${escapeHtml(info.action)}</small>${arrow}</a>`:`<div class="time-slot is-disabled ${info.className}"><strong>${escapeHtml(slot.time)}</strong><span>${escapeHtml(info.label)}</span><small>${escapeHtml(info.action)}</small></div>`;
        }).join("")}</div></article>`).join("")}</div>`;
      }catch(error){if(current!==requestId)return;schedule.innerHTML=`<div class="schedule-state error"><strong>회차를 불러오지 못했습니다.</strong><p>${escapeHtml(error.message)}</p><button type="button">다시 시도</button></div>`;schedule.querySelector("button")?.addEventListener("click",load);}
    }
    dates.querySelectorAll("[data-date]").forEach((button)=>button.addEventListener("click",()=>{dates.querySelectorAll("[data-date]").forEach((x)=>x.classList.remove("is-selected"));button.classList.add("is-selected");selectedDate=button.dataset.date;load();}));
    filters.querySelectorAll("[data-theme]").forEach((button)=>button.addEventListener("click",()=>{filters.querySelectorAll("[data-theme]").forEach((x)=>x.classList.remove("is-selected"));button.classList.add("is-selected");selectedTheme=button.dataset.theme||"";load();}));
    load();
  }

  async function patchReservationForm(themes) {
    const oldForm=document.querySelector("#booking-form"); if(!oldForm)return;
    const form=replaceWithClone(oldForm,true); if(!form)return;
    const params=new URLSearchParams(location.search),theme=themes.find((t)=>t.id===params.get("theme")),playDate=params.get("date")||"",startTime=params.get("time")||"";
    if(!theme||!playDate||!startTime){return;}
    const summary=document.querySelector(".booking-summary");
    if(summary){summary.querySelector("img")?.setAttribute("src",asset(theme.image));summary.querySelector("img")?.setAttribute("alt",theme.shortTitle);const copy=summary.querySelector(".booking-summary-copy");if(copy)copy.innerHTML=`<p class="eyebrow">선택한 사건</p><h2>${escapeHtml(theme.shortTitle)}</h2><dl><div><dt>일정</dt><dd>${escapeHtml(formatDate(playDate))}</dd></div><div><dt>회차</dt><dd>${escapeHtml(startTime)}</dd></div><div><dt>이용 시간</dt><dd>${theme.duration}분</dd></div><div><dt>역할 정원</dt><dd>${escapeHtml(capacityText(theme))}</dd></div><div><dt>이용 요금</dt><dd>${money(theme.price)} / 1인</dd></div></dl><a href="${pagePath("reservations")}">회차 다시 선택</a>`;}
    const picker=form.querySelector(".party-picker"),openInput=form.querySelector('[name="openRoom"]'),openBox=form.querySelector(".open-room-option"),request=form.querySelector('[name="specialRequest"]'),requestLabel=request?.closest("label"),message=form.querySelector("#booking-message"),submit=form.querySelector('[type="submit"]');
    const heading=form.querySelector(".form-heading.second"),panel=document.createElement("section"); panel.className="cs-form-room cs-loading";panel.innerHTML="<strong>회차 상태 확인 중</strong><p>현재 인원과 남은 자리를 확인하고 있습니다.</p>";heading?.after(panel);
    let slot=null,partySize=0,userOpen=false,ready=false;
    function feedback(text=""){if(message)message.innerHTML=text?`<p class="form-message">${escapeHtml(text)}</p>`:"";}
    function joining(){return Boolean(slot&&slot.bookedCount>0&&slot.openRoom&&slot.canJoin);}
    function actualOpen(){return joining()||partySize<theme.minPlayers||Boolean(openInput?.checked);}
    function renderPicker(maximum,preferred){if(!picker)return;picker.innerHTML=Array.from({length:maximum},(_,i)=>i+1).map((n)=>`<button type="button" data-cs-size="${n}" class="${n===preferred?"is-selected":""}"><strong>${n}</strong><span>명</span></button>`).join("");partySize=preferred;picker.querySelectorAll("[data-cs-size]").forEach((button)=>button.addEventListener("click",()=>{picker.querySelectorAll("[data-cs-size]").forEach((x)=>x.classList.remove("is-selected"));button.classList.add("is-selected");partySize=Number(button.dataset.csSize);update();}));}
    function update(){
      const forced=joining()||partySize<theme.minPlayers;
      if(openInput){openInput.disabled=forced;if(forced)openInput.checked=true;else openInput.checked=userOpen;}
      openBox?.classList.toggle("is-selected",Boolean(openInput?.checked));openBox?.classList.toggle("cs-forced-open",forced);
      const strong=openBox?.querySelector("strong"),desc=openBox?.querySelector("p");
      if(joining()){if(strong)strong.textContent="현재 모집 중인 오픈룸에 합류합니다.";if(desc)desc.textContent=`현재 ${slot.bookedCount}/${slot.capacity}명입니다. 내 예약 인원이 같은 방에 합산됩니다.`;}
      else if(partySize<theme.minPlayers){if(strong)strong.textContent=`${theme.minPlayers}명 미만은 오픈룸으로 자동 접수됩니다.`;if(desc)desc.textContent="다른 팀이 같은 회차의 남은 자리를 추가 예약할 수 있습니다.";}
      else{if(strong)strong.textContent="남은 자리를 다른 팀에게 공개합니다.";if(desc)desc.textContent="선택하지 않으면 단독팀 예약으로 마감되고, 선택하면 오픈룸으로 추가 합류를 받습니다.";}
      const open=actualOpen();if(request){request.required=open;request.minLength=open?2:0;request.placeholder=open?"함께 플레이할 다른 팀에게 전할 간단한 소개를 입력해 주세요.":"매장에 전달할 내용이 있다면 입력해 주세요.";}const label=requestLabel?.querySelector(":scope > span");if(label)label.textContent=open?"오픈룸 소개 · 필수":"요청 사항";requestLabel?.classList.toggle("cs-open-message",open);
      form.querySelector("#total-price")?.replaceChildren(document.createTextNode(money(theme.price*partySize)));form.querySelector("#submit-price")?.replaceChildren(document.createTextNode(money(theme.price*partySize)));form.querySelector("#party-count")?.replaceChildren(document.createTextNode(String(partySize)));
    }
    openInput?.addEventListener("change",()=>{if(!openInput.disabled)userOpen=openInput.checked;update();});
    async function loadSlot(){ready=false;if(submit)submit.disabled=true;panel.className="cs-form-room cs-loading";panel.innerHTML="<strong>회차 상태 확인 중</strong><p>현재 인원과 남은 자리를 확인하고 있습니다.</p>";
      try{const data=await api(`/availability?date=${encodeURIComponent(playDate)}&theme=${encodeURIComponent(theme.id)}`);slot=data.themes?.[0]?.times?.find((s)=>s.time===startTime);if(!slot)throw new Error("선택한 회차를 찾을 수 없습니다.");const info=roomInfo(slot,theme);panel.className=`cs-form-room ${info.className}`;panel.innerHTML=`<span>${escapeHtml(info.label)}</span><strong>${escapeHtml(info.detail)}</strong><p>${info.state==="AVAILABLE"?`4명 이상은 단독팀과 오픈룸 중 선택할 수 있습니다. 이 사건의 최대 인원은 ${theme.totalCapacity}명입니다.`:escapeHtml(info.action)}</p>`;const reservable=info.state==="AVAILABLE"||slot.canJoin===true;if(!reservable){if(picker)picker.innerHTML="";if(submit){submit.disabled=true;submit.querySelector("span")?.replaceChildren(document.createTextNode("예약할 수 없는 회차입니다"));}return;}const max=info.state==="AVAILABLE"?theme.totalCapacity:info.remaining,preferred=info.state==="AVAILABLE"?Math.min(theme.minPlayers,max):1;renderPicker(max,preferred);if(submit){submit.disabled=false;submit.querySelector("span")?.replaceChildren(document.createTextNode(joining()?"오픈룸 합류 예약":"예약 접수하기"));}ready=true;update();}
      catch(error){panel.className="cs-form-room cs-room-blocked";panel.innerHTML=`<strong>회차 상태를 확인하지 못했습니다.</strong><p>${escapeHtml(error.message)}</p><button type="button">다시 확인</button>`;panel.querySelector("button")?.addEventListener("click",loadSlot);}
    }
    form.addEventListener("submit",async(event)=>{event.preventDefault();event.stopImmediatePropagation();feedback();if(!ready||!partySize||!form.reportValidity())return;const original=submit?.querySelector("span")?.textContent||"예약 접수하기";if(submit){submit.disabled=true;submit.querySelector("span")?.replaceChildren(document.createTextNode("현재 인원을 다시 확인하고 있습니다"));}
      try{const latest=await api(`/availability?date=${encodeURIComponent(playDate)}&theme=${encodeURIComponent(theme.id)}`),latestSlot=latest.themes?.[0]?.times?.find((s)=>s.time===startTime);if(!latestSlot)throw new Error("회차 정보를 확인할 수 없습니다.");const latestInfo=roomInfo(latestSlot,theme),can=latestInfo.state==="AVAILABLE"||latestSlot.canJoin===true;if(!can)throw new Error("선택한 회차가 방금 마감되었습니다.");if(partySize>latestInfo.remaining&&latestInfo.state!=="AVAILABLE")throw new Error(`남은 자리는 ${latestInfo.remaining}자리입니다.`);const values=Object.fromEntries(new FormData(form)),open=(latestSlot.bookedCount>0&&latestSlot.openRoom&&latestSlot.canJoin)||partySize<theme.minPlayers||Boolean(openInput?.checked),intro=String(values.specialRequest||"").trim();if(open&&intro.length<2)throw new Error("오픈룸에 합류할 다른 팀이 확인할 소개를 입력해 주세요.");const result=await api("/reservations",{method:"POST",body:JSON.stringify({themeId:theme.id,playDate,startTime,customerName:values.customerName,phone:values.phone,partySize,openRoom:open,specialRequest:intro,privacyConsent:form.querySelector('[name="privacyConsent"]')?.checked===true,cancellationConsent:form.querySelector('[name="cancellationConsent"]')?.checked===true})});sessionStorage.setItem("crimescene-last-reservation",JSON.stringify(result));location.href=pagePath("reservations/complete");}
      catch(error){feedback(error.message);if(submit){submit.disabled=false;submit.querySelector("span")?.replaceChildren(document.createTextNode(original));}await loadSlot();}
    },true);
    loadSlot();
  }

  function patchComplete() {
    const card=document.querySelector(".complete-card");if(!card||card.querySelector(".cs-complete-room"))return;let result=null;try{result=JSON.parse(sessionStorage.getItem("crimescene-last-reservation")||"null");}catch{}const reservation=result?.reservation,room=reservation?.room;if(!reservation||!room)return;const info=roomInfo(room);const panel=document.createElement("section");panel.className=`cs-complete-room ${info.className}`;panel.innerHTML=reservation.bookingMode==="PRIVATE"?`<span>예약 방식</span><strong>단독팀 예약</strong><p>다른 팀이 합류하지 않고 예약한 인원만 플레이합니다.</p>`:`<span>오픈룸 현황</span><strong>${escapeHtml(info.label)}</strong><p>${escapeHtml(info.detail)}</p><small>${reservation.bookingMode==="OPEN_JOIN"?"기존 오픈룸에 합류되어 접수되었습니다.":"남은 자리는 다른 팀이 같은 회차에 추가 예약할 수 있습니다."}</small>`;card.querySelector(".payment-state")?.before(panel);
  }

  function patchLookup() {
    const old=document.querySelector("#lookup-form"),results=document.querySelector("#lookup-results");if(!old||!results)return;const form=replaceWithClone(old,true);if(!form)return;const feedback=form.querySelector("#lookup-feedback");let identity=null;
    function render(items){if(!items.length){results.innerHTML=`<p class="lookup-feedback">입력한 정보와 일치하는 예약이 없습니다.</p>`;return;}results.innerHTML=`<div class="lookup-results"><div class="results-heading"><strong>예약 내역</strong><span>${items.length}건</span></div>${items.map((item)=>{const info=roomInfo(item.room||{}),cancelable=!["CANCELED","CANCEL_REQUESTED","COMPLETED","NO_SHOW"].includes(item.status);return `<article class="reservation-result cs-lookup-result"><div class="result-main"><span class="status-badge status-${escapeHtml(String(item.status).toLowerCase())}">${escapeHtml(reservationStatusLabels[item.status]||item.status)}</span><h3>${escapeHtml(item.themeTitle)}</h3><dl><div><dt>일정</dt><dd>${escapeHtml(formatDate(item.playDate))} · ${escapeHtml(item.startTime)}</dd></div><div><dt>내 예약 인원</dt><dd>${item.partySize}명</dd></div><div><dt>연락처</dt><dd>${escapeHtml(item.phoneMasked)}</dd></div><div><dt>금액</dt><dd>${money(item.totalAmount)}</dd></div></dl><section class="cs-lookup-room ${item.openRoom?info.className:"cs-room-private"}"><span>${item.openRoom?"오픈룸 현황":"예약 방식"}</span><strong>${item.openRoom?escapeHtml(info.label):"단독팀 예약"}</strong><p>${item.openRoom?escapeHtml(info.detail):"다른 팀이 합류하지 않는 예약입니다."}</p>${item.openRoomMessage?`<small>내가 남긴 소개: ${escapeHtml(item.openRoomMessage)}</small>`:""}</section></div>${cancelable?`<button class="cancel-reservation" type="button" data-cancel="${escapeHtml(item.lookupCode)}">예약 취소</button>`:""}</article>`;}).join("")}</div>`;results.querySelectorAll("[data-cancel]").forEach((button)=>button.addEventListener("click",async()=>{if(!identity||!confirm("이 예약을 취소하시겠습니까? 이용 24시간 전부터는 온라인 취소가 제한됩니다."))return;button.disabled=true;try{const data=await api("/reservations/cancel",{method:"POST",body:JSON.stringify({lookupCode:button.dataset.cancel,customerName:identity.customerName,phone:identity.phone,reason:"고객 온라인 취소"})});toast(data.message);form.requestSubmit();}catch(error){toast(error.message,"error");button.disabled=false;}}));}
    form.addEventListener("submit",async(event)=>{event.preventDefault();event.stopImmediatePropagation();if(!form.reportValidity())return;identity=Object.fromEntries(new FormData(form));feedback.innerHTML=`<div class="loading-bar"></div>`;try{const data=await api("/reservations/lookup",{method:"POST",body:JSON.stringify(identity)});feedback.innerHTML="";render(data.reservations||[]);}catch(error){feedback.innerHTML=`<p class="lookup-feedback error">${escapeHtml(error.message)}</p>`;}},true);
  }

  async function boot() {
    document.documentElement.classList.add("cs-v3");
    if (!app) return;
    let themes=fallbackThemes;
    try { const data=await api("/themes"); themes=normalizedThemes(data.themes?.length?data.themes:fallbackThemes); }
    catch { themes=normalizedThemes(fallbackThemes); }
    patchHeader();
    if(route==="home")patchHome(themes);
    if(route==="themes")patchThemesPage(themes);
    if(route.startsWith("theme:"))patchThemeDetail(themes);
    if(route==="guide")patchGuide(themes);
    if(route==="faq")patchFaq();
    if(route==="reservations")patchReservationBoard(themes);
    if(route==="reservation-new")patchReservationForm(themes);
    if(route==="reservation-complete")patchComplete();
    if(route==="reservation-lookup")patchLookup();
  }

  boot().catch((error)=>console.error("CrimeScene v3",error));
})();
