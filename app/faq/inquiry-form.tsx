"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export function InquiryForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(""); setError(false);
    const form = event.currentTarget; const data = new FormData(form);
    try {
      const response = await fetch("/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName: data.get("customerName"), phone: data.get("phone"), subject: data.get("subject"), content: data.get("content"), privacyConsent: data.get("privacyConsent") === "on" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setMessage(body.message); form.reset();
    } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : "문의를 접수하지 못했습니다."); }
    finally { setLoading(false); }
  }
  return <aside className="inquiry-panel"><p className="eyebrow">Private inquiry</p><h2>해결되지 않았나요?</h2><p>문의 내용을 남겨 주시면 운영자가 확인 후 안내해 드립니다.</p><form onSubmit={submit}><label><span>이름</span><input name="customerName" minLength={2} maxLength={20} required /></label><label><span>휴대폰 번호</span><input name="phone" inputMode="numeric" pattern="01[0-9]{8,9}" placeholder="01012345678" required /></label><label><span>제목</span><input name="subject" minLength={2} maxLength={100} required /></label><label><span>문의 내용</span><textarea name="content" minLength={10} maxLength={2000} required /></label><label className="inquiry-consent"><input type="checkbox" name="privacyConsent" required /> 문의 처리에 필요한 개인정보 수집에 동의합니다.</label>{message && <p className={error ? "support-error" : "support-success"}>{message}</p>}<button type="submit" disabled={loading}>{loading ? "접수 중" : "1:1 문의 접수"}</button></form></aside>;
}
