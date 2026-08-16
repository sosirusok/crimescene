import { encryptPhone, ensureDatabase, hashPhone, maskPhone, normalizePhone } from "../../../db/runtime";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { customerName?: string; phone?: string; subject?: string; content?: string; privacyConsent?: boolean };
  const name = payload.customerName?.trim() ?? "";
  const phone = normalizePhone(payload.phone ?? "");
  const subject = payload.subject?.trim() ?? "";
  const content = payload.content?.trim() ?? "";
  if (name.length < 2 || !/^01\d{8,9}$/.test(phone) || subject.length < 2 || content.length < 10) return Response.json({ error: "이름, 연락처, 제목, 문의 내용을 확인해 주세요." }, { status: 400 });
  if (!payload.privacyConsent) return Response.json({ error: "개인정보 수집 및 이용 동의가 필요합니다." }, { status: 400 });
  try {
    const db = await ensureDatabase();
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO inquiries (id, customer_name, phone_hash, phone_masked, phone_encrypted, subject, content) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, name, await hashPhone(phone), maskPhone(phone), await encryptPhone(phone), subject.slice(0, 100), content.slice(0, 2000)),
      db.prepare("INSERT INTO audit_logs (actor, action, target_type, target_id, metadata) VALUES ('customer', 'INQUIRY_CREATED', 'inquiry', ?, '{}')").bind(id),
    ]);
    return Response.json({ id, message: "문의가 접수되었습니다. 확인 후 입력하신 연락처로 안내드립니다." }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "문의를 저장하지 못했습니다." }, { status: 503 }); }
}
