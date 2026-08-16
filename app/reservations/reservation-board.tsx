"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "../components/icons";
import { themes } from "../data/themes";

type ApiTheme = { id: string; title: string; shortTitle: string; image: string; times: Array<{ time: string; status: string; remaining: number; bookedCount: number; openRoom: boolean }> };
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export function ReservationBoard() {
  const searchParams = useSearchParams();
  const dates = useMemo(() => Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; }), []);
  const [date, setDate] = useState(formatDate(dates[0]));
  const requestedTheme = searchParams.get("theme")?.toUpperCase();
  const [themeId, setThemeId] = useState(requestedTheme && themes.some((theme) => theme.id === requestedTheme) ? requestedTheme : "ALL");
  const [data, setData] = useState<ApiTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/availability?date=${date}${themeId !== "ALL" ? `&theme=${themeId}` : ""}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then((body) => setData(body.themes)).catch((reason) => { if (reason.name !== "AbortError") setError(reason.message ?? "예약 현황을 불러오지 못했습니다."); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [date, themeId]);

  return <section className="section reservation-board-section"><div className="shell">
    <div className="reservation-tabs"><Link className="is-active" href="/reservations">실시간 예약</Link><Link href="/reservations/lookup">예약 확인</Link><Link href="/reservations/lookup?tab=cancel">예약 취소</Link></div>
    <div className="reservation-notice"><strong>예약 전 확인</strong><p>최소 진행 인원은 4명입니다. 1–3명은 오픈룸을 선택하면 다른 팀과 함께 예약할 수 있습니다. 예약 시간 10분 전까지 도착해 주세요.</p></div>
    <div className="date-picker"><div className="filter-label"><span>01</span><div><strong>날짜 선택</strong><small>14일 이내 예약 가능</small></div></div><div className="date-scroll">{dates.map((item, index) => { const value = formatDate(item); return <button className={date === value ? "is-selected" : ""} type="button" key={value} onClick={() => { setLoading(true); setError(""); setDate(value); }}><small>{index === 0 ? "오늘" : item.toLocaleDateString("ko-KR", { weekday: "short" })}</small><strong>{item.getDate()}</strong><span>{item.getMonth() + 1}월</span></button>; })}</div></div>
    <div className="theme-filter"><div className="filter-label"><span>02</span><div><strong>사건 선택</strong><small>전체 또는 한 사건</small></div></div><div className="filter-buttons"><button className={themeId === "ALL" ? "is-selected" : ""} type="button" onClick={() => { setLoading(true); setError(""); setThemeId("ALL"); }}>전체 사건</button>{themes.map((theme) => <button className={themeId === theme.id ? "is-selected" : ""} type="button" key={theme.id} onClick={() => { setLoading(true); setError(""); setThemeId(theme.id); }}>EP.{theme.episode} {theme.shortTitle}</button>)}</div></div>
    <div className="schedule-header"><div><span>03</span><h2>시간 선택</h2></div><div className="slot-legend"><span><i className="available"/>예약 가능</span><span><i className="open"/>오픈룸</span><span><i/>예약 완료</span></div></div>
    {loading && <div className="schedule-state"><span className="loader"/><p>예약 현황을 확인하고 있습니다.</p></div>}
    {error && <div className="schedule-state error"><strong>예약 현황을 불러오지 못했습니다.</strong><p>{error}</p><button type="button" onClick={() => window.location.reload()}>다시 시도</button></div>}
    {!loading && !error && <div className="schedule-list">{data.map((theme) => <article className="schedule-theme" key={theme.id}><div className="schedule-theme-info"><img src={theme.image} alt=""/><div><small>CRIME SCENE</small><h3>{theme.shortTitle}</h3><p>90분 · 1인 23,000원 · 4–5명</p></div></div><div className="time-grid">{theme.times.map((slot) => { const available = slot.status === "OPEN" && slot.remaining > 0; const openRoom = available && slot.openRoom && slot.bookedCount > 0; return available ? <Link className={openRoom ? "time-slot is-open" : "time-slot is-available"} key={slot.time} href={`/reservations/new?theme=${theme.id}&date=${date}&time=${slot.time}`}><strong>{slot.time}</strong><span>{openRoom ? `[${slot.bookedCount}/5] 오픈룸` : "예약 가능"}</span><ArrowUpRight /></Link> : <div className="time-slot is-disabled" key={slot.time}><strong>{slot.time}</strong><span>예약 완료</span></div>; })}</div></article>)}</div>}
  </div></section>;
}
