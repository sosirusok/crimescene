"use client";

import { useEffect, useState } from "react";

type Notice = { id: number; title: string; content: string; pinned: boolean; created_at: string };

export function NoticeList() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/notices").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then((body) => setNotices(body.notices)).catch((reason) => setError(reason.message)); }, []);
  return <section className="section support-section"><div className="shell support-layout"><aside><span>NOTICE ARCHIVE</span><strong>{String(notices.length).padStart(2, "0")}</strong><p>운영 공지는 예약 전 반드시 확인해 주세요.</p></aside><div className="notice-list">{error && <p className="support-error">{error}</p>}{!error && notices.length === 0 && <p className="support-loading">공지사항을 확인하고 있습니다.</p>}{notices.map((notice) => <article key={notice.id}><div><span>{notice.pinned ? "IMPORTANT" : "NOTICE"}</span><time>{notice.created_at.slice(0, 10)}</time></div><h2>{notice.title}</h2><p>{notice.content}</p></article>)}</div></div></section>;
}
