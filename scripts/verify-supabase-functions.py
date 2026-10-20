#!/usr/bin/env python3
"""Live checks for the production Supabase Edge Functions (api, customer-api).

Used by .github/workflows/supabase-functions.yml after a deploy (--mode full) and after a rollback (--mode health).
Every request is read-only: GETs, a reservation lookup for a fake name/phone, and a reservation POST whose payload
fails validation before anything is written. No apikey/Authorization header is sent, because the customer site calls
the functions without one (JWT verification is off).

  python3 scripts/verify-supabase-functions.py --expect-revision-from supabase/functions/api/router.ts
  python3 scripts/verify-supabase-functions.py --mode health --expect-revision none
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("SUPABASE_FUNCTIONS_BASE", "https://jhjbiejqtbidloxcwryr.supabase.co/functions/v1")
ORIGIN = "https://www.xn--oi2bkkl05a1gchcr33e50h.com"
VERSION = "5.0.0"
KST = timezone(timedelta(hours=9))  # Asia/Seoul has no DST
GITHUB = os.environ.get("GITHUB_ACTIONS") == "true"
results = []


def request(method, url, body=None, headers=None, retry=True):
    """Returns (status, lowercase headers, text). Retries network errors and 5xx (GET) / gateway errors (POST)."""
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    sent = {"Origin": ORIGIN, "Accept": "application/json", "User-Agent": "crimescene-deploy-check"}
    if data is not None:
        sent["Content-Type"] = "application/json"
    sent.update(headers or {})
    retryable = {500, 502, 503, 504} if method == "GET" else {502, 504}
    attempts = 4 if retry else 1
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=sent, method=method), timeout=30) as res:
                status, head, text = res.status, res.headers, res.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as error:
            status, head, text = error.code, error.headers, error.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            if attempt == attempts:
                return 0, {}, f"network error: {error}"
            time.sleep(2 ** attempt)
            continue
        if status in retryable and attempt < attempts:
            time.sleep(2 ** attempt)
            continue
        return status, {k.lower(): v for k, v in head.items()}, text
    raise AssertionError("unreachable")


def as_json(text):
    try:
        return json.loads(text)
    except ValueError:
        return None


def record(name, ok, detail):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}", flush=True)
    if not ok and GITHUB:
        print(f"::error title=Live check failed::{name}: {detail}", flush=True)


def check(name, fn):
    try:
        detail = fn()
        record(name, True, detail or "ok")
    except AssertionError as error:
        record(name, False, str(error) or "assertion failed")


def expect(condition, message):
    if not condition:
        raise AssertionError(message)


def expect_cors(headers):
    got = headers.get("access-control-allow-origin")
    expect(got == ORIGIN, f"Access-Control-Allow-Origin is {got!r}, expected {ORIGIN}")


def health_problem(fn, status, headers, data, revision):
    """None when the health answer matches; otherwise why not. revision: None = not checked, "none" = field absent."""
    if status != 200 or not isinstance(data, dict):
        return f"HTTP {status}"
    if data.get("ok") is not True or data.get("version") != VERSION or data.get("paymentProvider") != "NICEPAY":
        return f"unexpected body {json.dumps(data, ensure_ascii=False)[:200]}"
    if revision == "none":
        if "revision" in data or "transport" in data:
            return f"revision={data.get('revision')!r} transport={data.get('transport')!r}, expected neither (previous code)"
    elif revision is not None:
        if data.get("revision") != revision:
            return f"revision={data.get('revision')!r}, expected {revision!r}"
        if fn == "customer-api" and data.get("transport") != "in-process":
            return f"transport={data.get('transport')!r}, expected 'in-process'"
    # The api function only echoes the Korean domain once its own CORS list has it (every revisioned build does).
    if fn == "customer-api" or (revision not in (None, "none")):
        if headers.get("access-control-allow-origin") != ORIGIN:
            return f"Access-Control-Allow-Origin is {headers.get('access-control-allow-origin')!r}, expected {ORIGIN}"
    return None


def wait_for_health(revision, wait_seconds):
    """Polls both health endpoints until they match in 3 consecutive rounds (new isolates replace old ones)."""
    deadline, streak, last = time.monotonic() + wait_seconds, 0, {}
    while True:
        problems = {}
        for fn in ("api", "customer-api"):
            status, headers, text = request("GET", f"{BASE}/{fn}/health")
            data = as_json(text)
            last[fn] = data if isinstance(data, dict) else text[:200]
            problem = health_problem(fn, status, headers, data, revision)
            if problem:
                problems[fn] = problem
        streak = 0 if problems else streak + 1
        if streak >= 3 or time.monotonic() >= deadline:
            break
        time.sleep(5)
    for fn in ("api", "customer-api"):
        detail = json.dumps(last[fn], ensure_ascii=False)[:240]
        record(f"{fn} GET /health", fn not in problems, problems.get(fn, detail))


def full_checks():
    customer = f"{BASE}/customer-api"
    today = datetime.now(KST).date().isoformat()
    state = {}

    def preflight():
        status, headers, _ = request("OPTIONS", f"{customer}/reservations", headers={"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        expect(status == 204, f"HTTP {status}, expected 204")
        expect_cors(headers)
        expect("POST" in headers.get("access-control-allow-methods", ""), "POST not in Access-Control-Allow-Methods")
        expect("content-type" in headers.get("access-control-allow-headers", "").lower(), "content-type not in Access-Control-Allow-Headers")
        return "204, CORS preflight allowed"

    def bootstrap():
        status, headers, text = request("GET", f"{customer}/bootstrap")
        expect(status == 200, f"HTTP {status}: {text[:200]}")
        expect_cors(headers)
        data = as_json(text)
        expect(isinstance(data, dict), "body is not a JSON object")
        settings, payment, themes = data.get("settings"), data.get("payment"), data.get("themes")
        expect(isinstance(settings, dict), "settings missing")
        expect(isinstance(settings.get("bookingWindowDays"), int), "settings.bookingWindowDays is not an integer")
        expect(settings.get("paymentMode") in {"ONSITE", "ONLINE"}, f"settings.paymentMode={settings.get('paymentMode')!r}")
        for field in ("storeName", "branchName", "phone", "addressRoad", "businessName"):
            expect(isinstance(settings.get(field), str) and settings[field].strip(), f"settings.{field} missing or empty")
        expect(isinstance(payment, dict) and payment.get("provider") == "NICEPAY", f"payment={payment!r}")
        expect(isinstance(payment.get("onlineEnabled"), bool), "payment.onlineEnabled is not a boolean")
        expect(isinstance(themes, list) and themes, "themes missing or empty")
        expect(all(isinstance(t, dict) and str(t.get("id") or "").strip() and isinstance(t.get("times"), list) for t in themes), "a theme lacks id or times[]")
        state["paymentMode"], state["onlineEnabled"] = settings["paymentMode"], payment["onlineEnabled"]
        return f"200, {len(themes)} themes, businessName={settings['businessName']!r}, paymentMode={settings['paymentMode']}"

    def availability():
        status, headers, text = request("GET", f"{customer}/availability?date={today}")
        expect(status == 200, f"HTTP {status}: {text[:200]}")
        expect_cors(headers)
        data = as_json(text)
        expect(isinstance(data, dict) and data.get("date") == today, f"date is {data.get('date') if isinstance(data, dict) else None!r}, expected {today}")
        expect(isinstance(data.get("settings"), dict), "settings missing")
        themes = data.get("themes")
        expect(isinstance(themes, list) and themes, "themes missing or empty")
        slots = [slot for theme in themes for slot in (theme.get("times") or [])]
        expect(slots, "no slots")
        expect(all(isinstance(s.get("time"), str) and isinstance(s.get("status"), str) for s in slots), "a slot lacks time/status")
        expect(all(isinstance(s.get("openRoomIntroductions"), list) for s in slots), "a slot lacks openRoomIntroductions[]")
        return f"200, {today}: {len(slots)} slots, all with openRoomIntroductions[]"

    def notices():
        status, headers, text = request("GET", f"{customer}/notices")
        expect(status == 200, f"HTTP {status}: {text[:200]}")
        expect_cors(headers)
        data = as_json(text)
        expect(isinstance(data, dict) and isinstance(data.get("notices"), list), "notices[] missing")
        expect(all(isinstance(n, dict) and n.get("id") and isinstance(n.get("title"), str) for n in data["notices"]), "a notice lacks id/title")
        return f"200, {len(data['notices'])} notices"

    def customer_admin():
        status, headers, text = request("GET", f"{customer}/admin/dashboard", headers={"Authorization": "Bearer not-a-real-token"})
        expect(status == 404, f"HTTP {status}, expected 404 (customer-api must not expose /admin/*): {text[:120]}")
        expect_cors(headers)
        return "404 (admin routes are not exposed on customer-api)"

    def api_admin():
        status, _, text = request("GET", f"{BASE}/api/admin/dashboard")
        expect(status == 401, f"HTTP {status}, expected 401: {text[:120]}")
        return "401 without a session"

    def lookup():
        status, headers, text = request("POST", f"{customer}/reservations/lookup", {"customerName": "배포확인", "phone": "010-0000-0000"})
        expect(status == 200, f"HTTP {status}: {text[:200]}")
        expect_cors(headers)
        data = as_json(text)
        expect(isinstance(data, dict) and data.get("reservations") == [], f"reservations={data.get('reservations') if isinstance(data, dict) else text[:120]!r}, expected []")
        return "200, reservations=[] for a fake name/phone"

    def invalid_reservation():
        # Fails the date check before any reservation is written. In online-payment mode the route answers 409/503 first.
        expected = 409 if state.get("onlineEnabled") else 503 if state.get("paymentMode") == "ONLINE" else 400
        status, headers, text = request("POST", f"{customer}/reservations", {"themeId": "", "playDate": "not-a-date", "startTime": "", "customerName": "", "phone": "", "partySize": 0})
        expect(status == expected, f"HTTP {status}, expected {expected}: {text[:200]}")
        expect_cors(headers)
        data = as_json(text)
        expect(isinstance(data, dict) and isinstance(data.get("error"), str) and "reservation" not in data, f"unexpected body {text[:200]}")
        return f"{status}, rejected before any write: {data['error']}"

    for name, fn in (
        ("customer-api OPTIONS /reservations", preflight),
        ("customer-api GET /bootstrap", bootstrap),
        (f"customer-api GET /availability?date={today}", availability),
        ("customer-api GET /notices", notices),
        ("customer-api GET /admin/dashboard", customer_admin),
        ("api GET /admin/dashboard", api_admin),
        ("customer-api POST /reservations/lookup", lookup),
        ("customer-api POST /reservations (invalid)", invalid_reservation),
    ):
        check(name, fn)


def revision_from(path):
    """REVISION constant of an api/router.ts; "none" when the file or constant does not exist (code before revisions)."""
    try:
        with open(path, encoding="utf-8") as handle:
            match = re.search(r'^export const REVISION = "([^"]+)";', handle.read(), re.M)
    except FileNotFoundError:
        return "none"
    return match.group(1) if match else "none"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--mode", choices=("full", "health"), default="full")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--expect-revision", help='health "revision" both functions must report; "none" = field absent')
    group.add_argument("--expect-revision-from", metavar="ROUTER_TS", help="read the expected revision from an api/router.ts")
    parser.add_argument("--wait-seconds", type=int, default=180, help="how long to wait for the expected revision to go live")
    args = parser.parse_args()
    revision = revision_from(args.expect_revision_from) if args.expect_revision_from else args.expect_revision
    print(f"Checking {BASE} as {ORIGIN} (expected revision: {revision or 'not checked'})", flush=True)
    wait_for_health(revision, args.wait_seconds if revision else 0)
    if args.mode == "full":
        full_checks()
    failed = [name for name, ok, _ in results if not ok]
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(f"### Supabase functions live check ({args.mode}, revision {revision or 'not checked'})\n\n| Result | Check | Detail |\n|---|---|---|\n")
            for name, ok, detail in results:
                handle.write(f"| {'PASS' if ok else 'FAIL'} | {name} | {detail.replace('|', '/')} |\n")
    print(f"{len(results) - len(failed)}/{len(results)} checks passed", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
