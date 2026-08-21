import { env } from "cloudflare:workers";
import { themes } from "../app/data/themes";

export function getDatabase() {
  if (!env.DB) throw new Error("예약 데이터베이스 연결을 확인할 수 없습니다.");
  return env.DB;
}

export async function ensureDatabase() {
  const db = getDatabase();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS themes (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, episode INTEGER NOT NULL, title TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 23000, duration_minutes INTEGER NOT NULL DEFAULT 90, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS availability (id INTEGER PRIMARY KEY AUTOINCREMENT, theme_id TEXT NOT NULL, play_date TEXT NOT NULL, start_time TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 5, booked_count INTEGER NOT NULL DEFAULT 0, open_room INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'OPEN', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(theme_id, play_date, start_time))"),
    db.prepare("CREATE INDEX IF NOT EXISTS availability_date_idx ON availability(play_date)"),
    db.prepare("CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, lookup_code TEXT NOT NULL UNIQUE, theme_id TEXT NOT NULL, play_date TEXT NOT NULL, start_time TEXT NOT NULL, customer_name TEXT NOT NULL, phone_hash TEXT NOT NULL, phone_masked TEXT NOT NULL, party_size INTEGER NOT NULL, open_room INTEGER NOT NULL DEFAULT 0, special_request TEXT NOT NULL DEFAULT '', total_amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'CONFIRMED', payment_status TEXT NOT NULL DEFAULT 'READY', cancellation_reason TEXT, canceled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS reservations_phone_idx ON reservations(phone_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS reservations_slot_idx ON reservations(theme_id, play_date, start_time)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'ONSITE', provider_transaction_id TEXT, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'READY', approved_at TEXT, raw_result_code TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS payments_reservation_idx ON payments(reservation_id)"),
    db.prepare("CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, phone_hash TEXT NOT NULL, phone_masked TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEW', response TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS inquiries_status_idx ON inquiries(status)"),
    db.prepare("CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  ]);
  await addColumnIfMissing(db, "reservations", "phone_encrypted", "TEXT");
  await addColumnIfMissing(db, "inquiries", "phone_encrypted", "TEXT");
  await db.batch(themes.map((theme) => db.prepare("INSERT OR IGNORE INTO themes (id, slug, episode, title, price, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)").bind(theme.id, theme.slug, theme.episode, theme.title, theme.price, theme.duration)));
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO notices (id, title, content, pinned, published) VALUES (1, '예약 전 필수 안내', '모든 회차는 시작 10분 전 도착을 권장합니다. 지각 시 전체 진행 시간이 줄어들 수 있습니다.', 1, 1)"),
    db.prepare("INSERT OR IGNORE INTO notices (id, title, content, pinned, published) VALUES (2, '오픈룸 운영 안내', '1–3명 예약은 다른 플레이어와 함께 사건을 해결하는 오픈룸으로 진행됩니다.', 1, 1)"),
    db.prepare("INSERT OR IGNORE INTO notices (id, title, content, pinned, published) VALUES (3, '결제 안내', '온라인 카드 결제가 활성화되기 전에는 방문 당일 매장에서 결제합니다.', 0, 1)"),
  ]);
  return db;
}

async function addColumnIfMissing(db: D1Database, table: string, column: string, type: string) {
  const columns = await db.prepare(`PRAGMA table_info(${table})`).all();
  if (!(columns.results as Array<{ name: string }>).some((item) => item.name === column)) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
}

export function normalizePhone(value: string) { return value.replace(/\D/g, ""); }
export function maskPhone(phone: string) { return phone.length === 11 ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}` : `***-****-${phone.slice(-4)}`; }
export async function hashPhone(value: string) {
  const bytes = new TextEncoder().encode(normalizePhone(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function encryptPhone(value: string) {
  const config = env as unknown as Record<string, string | undefined>;
  if (!config.PII_ENCRYPTION_KEY) return null;
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.PII_ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(normalizePhone(value)));
  const packed = new Uint8Array(iv.byteLength + encrypted.byteLength);
  packed.set(iv); packed.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...packed));
}
export async function decryptPhone(value: string | null) {
  const config = env as unknown as Record<string, string | undefined>;
  if (!value || !config.PII_ENCRYPTION_KEY) return null;
  try {
    const packed = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.PII_ENCRYPTION_KEY));
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, key, packed.slice(12));
    return new TextDecoder().decode(decrypted);
  } catch { return null; }
}
export function makeLookupCode(playDate: string) { return `CS-${playDate.replaceAll("-", "").slice(2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }
export function isReservableDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const nowInKorea = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = nowInKorea.toISOString().slice(0, 10);
  const lastDate = new Date(`${today}T00:00:00Z`); lastDate.setUTCDate(lastDate.getUTCDate() + 14);
  return value >= today && value <= lastDate.toISOString().slice(0, 10);
}
