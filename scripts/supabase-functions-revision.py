#!/usr/bin/env python3
"""REVISION bookkeeping for the Supabase Edge Functions deploy (.github/workflows/supabase-functions.yml).

Both functions report REVISION from supabase/functions/api/router.ts on /health, so one REVISION value must name exactly
one version of the api/customer-api sources. Commits are read along HEAD's first-parent line: the states main moved
through, which is where deploys happen (commits inside a merged branch were never deployed).

  check            fails when HEAD has no REVISION or reuses one that older, different api/customer-api sources had
  main-tip         writes deploy=true only when HEAD's api/customer-api sources are the ones on main's tip now (GitHub API)
  rollback-target  reads the live revision and picks the newest commit whose functions report it (the rollback target)

  python3 scripts/supabase-functions-revision.py check
  GITHUB_REPOSITORY=owner/repo GH_TOKEN=... python3 scripts/supabase-functions-revision.py main-tip
  python3 scripts/supabase-functions-revision.py rollback-target
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("SUPABASE_FUNCTIONS_BASE", "https://jhjbiejqtbidloxcwryr.supabase.co/functions/v1")
GITHUB_API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
ORIGIN = "https://www.xn--oi2bkkl05a1gchcr33e50h.com"
ROUTER = "supabase/functions/api/router.ts"
SOURCES = ("supabase/functions/api", "supabase/functions/customer-api")
REVISION_RE = re.compile(r'^export const REVISION = "([^"]+)";', re.M)  # same pattern as verify-supabase-functions.py
SAFE_REVISION = re.compile(r"[A-Za-z0-9._-]{1,64}")  # a live value goes into step outputs and annotations
GITHUB = os.environ.get("GITHUB_ACTIONS") == "true"
BUMP = f"Bump REVISION in {ROUTER} so the deploy check can tell the new code from the old."
RUN_ON_MAIN = "To deploy main, use Actions > Deploy Supabase functions > Run workflow on main."


def annotate(level, title, message):
    print(f"::{level} title={title}::{message}" if GITHUB else f"{level.upper()}: {title}: {message}", flush=True)


def git(*args, stdin=None):
    return subprocess.run(["git", *args], input=stdin, capture_output=True, text=True, check=True).stdout


def history():
    """[(sha, sources, revision)] along HEAD's first-parent line, newest first; sources = (api tree, customer-api tree)."""
    commits = git("rev-list", "--first-parent", "HEAD").split()
    paths = (*SOURCES, ROUTER)
    answers = git("cat-file", "--batch-check=%(objectname)", stdin="".join(f"{c}:{p}\n" for c in commits for p in paths)).splitlines()
    ids = ["" if line.endswith(" missing") else line for line in answers]
    revisions = {}
    for blob in {ids[i * 3 + 2] for i in range(len(commits))} - {""}:
        match = REVISION_RE.search(git("cat-file", "blob", blob))
        revisions[blob] = match.group(1) if match else "none"
    return [(c, (ids[i * 3], ids[i * 3 + 1]), revisions.get(ids[i * 3 + 2], "none")) for i, c in enumerate(commits)]


def revision_problem(rows):
    """Why HEAD's REVISION cannot identify its sources, or None."""
    head, sources, revision = rows[0]
    if revision == "none":
        return f"{ROUTER} at {head[:7]} defines no REVISION; add one (export const REVISION = \"...\";) so a deploy can be verified."
    clash = next((c for c, s, r in rows[1:] if r == revision and s != sources), None)
    if clash:
        return f"REVISION {revision} is already used by {clash[:7]}, whose api/customer-api sources differ from {head[:7]}. {BUMP}"
    return None


def shallow():
    return git("rev-parse", "--is-shallow-repository").strip() == "true"


def check():
    if shallow():
        annotate("error", "Full history needed", "The checkout is shallow; REVISION reuse cannot be checked (use fetch-depth: 0).")
        return 1
    rows = history()
    problem = revision_problem(rows)
    if problem:
        annotate("error", "REVISION not bumped", problem)
        return 1
    print(f"REVISION {rows[0][2]} names only the api/customer-api sources of {rows[0][0][:7]}.", flush=True)
    return 0


def write_outputs(**values):
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as handle:
            handle.write("".join(f"{key}={value}\n" for key, value in values.items()))


def github(path):
    """Parsed JSON of a read-only GitHub REST API GET on this repository with the run's token; raises when unreadable."""
    req = urllib.request.Request(f"{GITHUB_API}/repos/{os.environ['GITHUB_REPOSITORY']}/{path}", headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "crimescene-deploy-check"})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return json.loads(res.read().decode("utf-8", "replace"))
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 * attempt)


def main_tip():
    """A re-run keeps its original commit (GITHUB_SHA) and ref, so a re-run of an older main run would put older code
    over newer live code. Deploy only when HEAD's api/customer-api trees are the ones on main's tip right now."""
    head = git("rev-parse", "HEAD").strip()
    try:
        tip = str(github("git/ref/heads/main")["object"]["sha"])
        if not re.fullmatch(r"[0-9a-f]{40}", tip):  # it goes into a URL and the step outputs
            raise ValueError(f"unexpected commit id {tip[:50]!r}")
        trees = {} if tip == head else {e["name"]: e["sha"] for e in github(f"contents/supabase/functions?ref={tip}") if e.get("type") == "dir"}
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        annotate("error", "Main branch tip unknown", f"The GitHub API did not say which commit main is at ({error}), so nothing was deployed. {RUN_ON_MAIN}")
        return 1
    ours = {os.path.basename(p): subprocess.run(["git", "rev-parse", "--verify", "-q", f"HEAD:{p}"], capture_output=True, text=True).stdout.strip() for p in SOURCES}
    current = tip == head or all(trees.get(name, "") == tree for name, tree in ours.items())
    if tip == head:
        print(f"{head[:7]} is main's tip.", flush=True)
    elif current:
        print(f"main is at {tip[:7]}, whose api/customer-api sources are the same as {head[:7]}'s.", flush=True)
    else:
        annotate("warning", "Stale run was not deployed", f"This run is for {head[:7]}, but main is now at {tip[:7]} with different api/customer-api sources, so deploying would put older code live. Nothing was deployed. {RUN_ON_MAIN}")
    write_outputs(deploy=str(current).lower(), main_tip=tip)
    return 0


def health(fn):
    """Parsed /health body of a live function, or None when it does not answer like a health check."""
    req = urllib.request.Request(f"{BASE}/{fn}/health", headers={"Origin": ORIGIN, "Accept": "application/json", "User-Agent": "crimescene-deploy-check"})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                data = json.loads(res.read().decode("utf-8", "replace"))
            return data if isinstance(data, dict) and data.get("ok") is True else None
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError):
            if attempt < 3:
                time.sleep(2 * attempt)
    return None


def own_revision(body, own=True):
    """The revision a /health body reports for its own code: "none" before REVISION existed, None without a usable answer."""
    if body is None:
        return None
    revision = str(body.get("revision") or "none") if own else "none"
    return revision if SAFE_REVISION.fullmatch(revision) else None


def live_revisions():
    """(api, customer-api) live revisions. The pre-REVISION customer-api proxies /health to api, so only an in-process
    answer carries customer-api's own revision."""
    api, customer = health("api"), health("customer-api")
    return own_revision(api), own_revision(customer, customer is not None and customer.get("transport") == "in-process")


def rollback_target():
    if shallow():
        annotate("error", "Full history needed", "The checkout is shallow; the rollback target cannot be found (use fetch-depth: 0).")
        return 1
    rows = history()
    problem = revision_problem(rows)
    if problem:  # deploying now could not be verified, so stop before anything is deployed
        annotate("error", "REVISION not bumped", problem)
        return 1
    head, sources, revision = rows[0]
    api_rev, customer_rev = live_revisions()
    print(f"Live revision: api={api_rev or 'no answer'}, customer-api={customer_rev or 'no answer'}; this commit: {revision}", flush=True)
    sha, reason, level = "", "", "error"
    live = "unknown" if api_rev is None or customer_rev is None else api_rev if api_rev == customer_rev else "mixed"
    if live == "unknown":
        reason = "a live /health did not answer with a readable revision, so the functions that are live are unknown"
    elif live == "mixed":
        reason = f"api reports {api_rev} but customer-api reports {customer_rev}, so the live functions do not come from one commit"
    elif live == revision:
        reason, level = f"this commit's functions ({revision}) are already live, so there is no older live code to return to", "notice"
    else:
        # Commits from before REVISION existed all report "none"; the newest of them is the code that was deployed then.
        group = [(c, s) for c, s, r in rows[1:] if r == live]
        distinct = list(dict.fromkeys(s for _, s in group))
        if not group:
            reason = f"no commit on HEAD's first-parent history has the live revision {live}"
        elif live != "none" and len(distinct) > 1:
            commits = ", ".join(next(c[:7] for c, s in group if s == d) for d in distinct)
            reason = f"revision {live} was used for different function sources ({commits}), so the live commit is ambiguous"
        elif group[0][1] == sources:
            reason = f"the live functions ({live}) have the same sources as {head[:7]}"
        else:
            sha = group[0][0]
    if sha:
        print(f"Rollback target: {sha} (newest commit whose functions report revision {live})", flush=True)
    else:
        annotate(level, "Automatic rollback unavailable" if level == "error" else "Already live", f"{reason}. A failed deploy will not be rolled back automatically.")
    write_outputs(sha=sha, live_revision=live, reason=reason)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("command", choices=("check", "main-tip", "rollback-target"))
    return {"check": check, "main-tip": main_tip, "rollback-target": rollback_target}[parser.parse_args().command]()


if __name__ == "__main__":
    sys.exit(main())
