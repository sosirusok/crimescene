#!/usr/bin/env python3
"""Tests for supabase-functions-revision.py against throwaway git histories, a fake live /health server and a fake
GitHub API, plus the deploy workflow's timeout budget and failure/cancel conditions.

  python3 scripts/test_supabase_functions_revision.py
"""
import http.server
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "supabase-functions-revision.py")
WORKFLOW = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".github", "workflows", "supabase-functions.yml")
REPO = "owner/site"
GIT_ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}


class Live(http.server.BaseHTTPRequestHandler):
    """Answers /api/health and /customer-api/health from Live.answers (fn -> body dict, or None for HTTP 500) and
    GitHub API paths (/repos/...) from Live.github (path -> body, missing for HTTP 500)."""
    answers = {}
    github = {}
    tokens = []

    def do_GET(self):
        if self.path.startswith("/repos/"):
            self.tokens.append(self.headers.get("Authorization"))
            body = self.github.get(self.path)
        else:
            body = self.answers.get(self.path.strip("/").split("/")[0])
        self.send_response(200 if body is not None else 500)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body if body is not None else {"error": "down"}).encode())

    def log_message(self, *args):
        pass


def health(revision=None, customer=False):
    body = {"ok": True, "service": "crimescene-api", "version": "5.0.0", "database": "supabase-postgres", "paymentProvider": "NICEPAY"}
    if revision:
        body["revision"] = revision
        if customer:
            body["transport"] = "in-process"
    return body


def live(api, customer):
    """What production answers. api: a REVISION, "none" (code before REVISION) or None (down). customer: a REVISION
    (in-process code), "none" (the old proxy, which forwards api's health answer) or None (down)."""
    proxied = health(None if api in (None, "none") else api)
    Live.answers = {"api": None if api is None else proxied, "customer-api": None if customer is None else proxied if customer == "none" else health(customer, customer=True)}


class Repo:
    def __init__(self, root):
        self.root = root
        os.makedirs(root)
        self.git("init", "-q", "-b", "main")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env={**os.environ, **GIT_ENV}, capture_output=True, text=True, check=True).stdout.strip()

    def commit(self, message, revision=None, server=None, client=None):
        """revision: REVISION in router.ts ("none" = router.ts without it); server: api/customer-api source text."""
        if revision is not None:
            router = f'export const REVISION = "{revision}";\n' if revision != "none" else "// no revision yet\n"
            self.write("supabase/functions/api/router.ts", router)
        if server is not None:
            self.write("supabase/functions/api/public.ts", f"// {server}\n")
            self.write("supabase/functions/customer-api/index.ts", f"// customer {server}\n")
        if client is not None:
            self.write("pages-src/app.js", f"// {client}\n")
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD")

    def write(self, path, text):
        full = os.path.join(self.root, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as handle:
            handle.write(text)


class RevisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Live)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repo(os.path.join(self.tmp.name, "repo"))
        # Production before this change: functions without REVISION, then client-only commits (README: repo == live).
        self.old = self.repo.commit("old functions", revision="none", server="v0", client="c0")
        self.premerge = self.repo.commit("client only", client="c1")

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, command, cwd=None):
        out = os.path.join(self.tmp.name, "github_output")
        open(out, "w").close()
        base = f"http://127.0.0.1:{self.server.server_address[1]}"
        env = {**os.environ, "SUPABASE_FUNCTIONS_BASE": base, "GITHUB_API_URL": base, "GITHUB_REPOSITORY": REPO, "GH_TOKEN": "run-token", "GITHUB_OUTPUT": out, "GITHUB_ACTIONS": "true", "NO_PROXY": "127.0.0.1", "no_proxy": "127.0.0.1"}
        res = subprocess.run([sys.executable, SCRIPT, command], cwd=cwd or self.repo.root, env=env, capture_output=True, text=True)
        with open(out, encoding="utf-8") as handle:
            outputs = dict(line.split("=", 1) for line in handle.read().splitlines())
        return res.returncode, res.stdout + res.stderr, outputs

    def target(self, api, customer):
        live(api, customer)
        code, log, outputs = self.run_script("rollback-target")
        self.assertEqual(code, 0, log)
        return outputs["sha"], outputs, log

    def main_at(self, sha):
        """The fake GitHub API reports main at sha, with that commit's supabase/functions directory listing."""
        dirs = [line.split("\t") for line in self.repo.git("ls-tree", f"{sha}:supabase/functions").splitlines()]
        listing = [{"name": name, "path": f"supabase/functions/{name}", "type": "dir" if meta.split()[1] == "tree" else "file", "sha": meta.split()[2]} for meta, name in dirs]
        Live.github = {f"/repos/{REPO}/git/ref/heads/main": {"ref": "refs/heads/main", "object": {"sha": sha, "type": "commit"}}, f"/repos/{REPO}/contents/supabase/functions?ref={sha}": listing}
        Live.tokens = []

    def gate(self):
        code, log, outputs = self.run_script("main-tip")
        self.assertEqual(code, 0, log)
        self.assertTrue(Live.tokens and set(Live.tokens) == {"Bearer run-token"}, Live.tokens)
        return outputs, log

    def test_stale_rerun_of_an_older_main_run_is_not_deployed(self):
        x = self.repo.commit("X: first new functions", revision="r1", server="v1")
        y = self.repo.commit("Y: fix, deployed and live", revision="r2", server="v2")
        self.main_at(y)
        self.repo.git("checkout", "-q", "--detach", x)  # a re-run of X's run: same GITHUB_SHA and GITHUB_REF=refs/heads/main
        outputs, log = self.gate()
        self.assertEqual(outputs, {"deploy": "false", "main_tip": y})
        self.assertIn("::warning title=Stale run was not deployed::", log)
        self.assertIn("Run workflow on main", log)

    def test_run_for_main_tip_deploys(self):
        tip = self.repo.commit("new functions", revision="r1", server="v1")
        self.main_at(tip)
        self.assertEqual(self.gate()[0], {"deploy": "true", "main_tip": tip})

    def test_older_run_still_deploys_when_main_only_moved_past_other_files(self):
        x = self.repo.commit("new functions", revision="r1", server="v1")
        self.repo.write("supabase/functions/tests/x.test.ts", "// tests are not deployed\n")
        self.repo.commit("tests only")
        tip = self.repo.commit("client only, no run of its own", client="c2")
        self.main_at(tip)
        self.repo.git("checkout", "-q", "--detach", x)
        self.assertEqual(self.gate()[0], {"deploy": "true", "main_tip": tip})

    def test_unreadable_or_odd_main_tip_fails_before_deploying(self):
        self.repo.commit("new functions", revision="r1", server="v1")
        for answers in ({}, {f"/repos/{REPO}/git/ref/heads/main": {"object": {"sha": "abc\ndeploy=true"}}}, {f"/repos/{REPO}/git/ref/heads/main": {"object": {"sha": "0" * 40}}}):
            with self.subTest(answers=answers):
                Live.github = answers
                code, log, outputs = self.run_script("main-tip")
                self.assertEqual((code, outputs), (1, {}), log)
                self.assertIn("::error title=Main branch tip unknown::", log)

    def test_first_deploy_by_manual_run_after_later_client_commit_targets_the_pre_merge_code(self):
        self.repo.commit("new functions", revision="r1", server="v1")
        self.repo.commit("client only", client="c2")
        sha, outputs, _ = self.target("none", "none")
        self.assertEqual(sha, self.premerge)  # not HEAD~1, which has the new functions
        self.assertEqual(outputs["live_revision"], "none")

    def test_push_targets_the_newest_commit_with_the_live_revision(self):
        s = self.repo.commit("new functions", revision="r1", server="v1")
        c = self.repo.commit("client only", client="c2")
        self.repo.commit("next server change", revision="r2", server="v2")
        self.assertEqual(self.target("r1", "r1")[0], c)
        self.assertNotEqual(c, s)

    def test_never_deployed_and_known_bad_commits_are_not_targets(self):
        good = self.repo.commit("good", revision="r1", server="v1")
        self.repo.commit("queued, cancelled before deploying", revision="r2", server="v2")
        self.repo.commit("failed and rolled back", revision="r3", server="v3")
        self.repo.commit("next", revision="r4", server="v4")
        self.assertEqual(self.target("r1", "r1")[0], good)

    def test_already_live_means_no_rollback_target(self):
        self.repo.commit("new functions", revision="r1", server="v1")
        self.repo.commit("client only", client="c2")
        sha, outputs, log = self.target("r1", "r1")
        self.assertEqual((sha, outputs["live_revision"]), ("", "r1"))
        self.assertIn("::notice title=Already live::", log)

    def test_unknown_mixed_and_foreign_live_states_disable_rollback(self):
        self.repo.commit("new functions", revision="r1", server="v1")
        self.repo.commit("next", revision="r2", server="v2")
        for api, customer, state, text in ((None, None, "unknown", "did not answer"), ("r1", None, "unknown", "did not answer"),
                                           ("r1", "none", "mixed", "api reports r1 but customer-api reports none"), ("r2", "r1", "mixed", "api reports r2"),
                                           ("elsewhere", "elsewhere", "elsewhere", "no commit"),
                                           ("r1\nsha=0123abc", "r1\nsha=0123abc", "unknown", "readable revision")):
            with self.subTest(api=api, customer=customer):
                sha, outputs, log = self.target(api, customer)
                self.assertEqual((sha, outputs["live_revision"]), ("", state))
                self.assertIn("::error title=Automatic rollback unavailable::", log)
                self.assertIn(text, outputs["reason"])

    def test_reused_revision_for_different_sources_fails_before_deploying(self):
        self.repo.commit("new functions", revision="r1", server="v1")
        self.repo.commit("server change without a bump", server="v2")
        code, log, _ = self.run_script("check")
        self.assertEqual(code, 1)
        self.assertIn("::error title=REVISION not bumped::REVISION r1 is already used by", log)
        live("r1", "r1")
        code, log, outputs = self.run_script("rollback-target")
        self.assertEqual((code, outputs), (1, {}), log)

    def test_check_passes_when_only_non_function_files_changed(self):
        self.repo.commit("new functions", revision="r1", server="v1")
        self.repo.commit("client only", client="c2")
        self.repo.write("supabase/functions/tests/x.test.ts", "// tests are not deployed\n")
        self.repo.commit("tests only")
        code, log, _ = self.run_script("check")
        self.assertEqual(code, 0, log)

    def test_check_requires_a_revision(self):
        self.repo.commit("server change", server="v1")
        code, log, _ = self.run_script("check")
        self.assertEqual(code, 1)
        self.assertIn("defines no REVISION", log)

    def test_ambiguous_live_revision_disables_rollback(self):
        self.repo.commit("a", revision="r1", server="v1")
        self.repo.commit("b reused r1 (blocked by check, never deployed)", server="v1b")
        self.repo.commit("c", revision="r2", server="v2")
        sha, outputs, _ = self.target("r1", "r1")
        self.assertEqual(sha, "")
        self.assertIn("ambiguous", outputs["reason"])

    def test_merge_commit_ignores_branch_intermediate_commits(self):
        self.repo.git("checkout", "-q", "-b", "feature")
        self.repo.commit("wip 1", revision="r1", server="v1")
        self.repo.commit("wip 2 (same REVISION, never deployed)", server="v1b")
        self.repo.git("checkout", "-q", "main")
        self.repo.commit("client on main", client="c9")
        main_tip = self.repo.git("rev-parse", "HEAD")
        self.repo.git("merge", "-q", "--no-ff", "-m", "merge feature", "feature")
        code, log, _ = self.run_script("check")
        self.assertEqual(code, 0, log)
        self.assertEqual(self.target("none", "none")[0], main_tip)

    def test_shallow_checkout_is_refused(self):
        self.repo.commit("new functions", revision="r1", server="v1")
        clone = os.path.join(self.tmp.name, "shallow")
        subprocess.run(["git", "clone", "-q", "--depth", "1", f"file://{self.repo.root}", clone], check=True, env={**os.environ, **GIT_ENV})
        for command in ("check", "rollback-target"):
            code, log, _ = self.run_script(command, cwd=clone)
            self.assertEqual(code, 1, log)
            self.assertIn("fetch-depth: 0", log)


class WorkflowTests(unittest.TestCase):
    """The deploy job's guards that live in the workflow file rather than in the script."""

    @classmethod
    def setUpClass(cls):
        with open(WORKFLOW, encoding="utf-8") as handle:
            cls.text = handle.read()
        cls.steps = re.split(r"\n      - name: ", cls.text.split("\n    steps:\n", 1)[1])[1:]

    def step(self, name):
        return next(s for s in self.steps if s.startswith(name))

    def test_step_timeouts_fit_inside_the_job_timeout(self):
        # A step that hits its own timeout fails and the rollback runs; hitting the job limit cancels the job first.
        job = int(re.search(r"\n    timeout-minutes: (\d+)\n", self.text).group(1))
        limits = [re.search(r"\n        timeout-minutes: (\d+)\n", s) for s in self.steps]
        self.assertTrue(all(limits), [s.splitlines()[0] for s, m in zip(self.steps, limits) if not m])
        self.assertLessEqual(sum(int(m.group(1)) for m in limits) + 10, job)

    def test_rollback_recheck_and_report_also_run_after_a_cancel(self):
        for name in ("Roll back to the functions that were live", "Re-check health after rollback", "Report failed deploy"):
            self.assertIn("if: (failure() || cancelled()) && ", self.step(name), name)
        self.assertIn("steps.deploy_api.outcome == 'cancelled'", self.step("Roll back to the functions that were live"))

    def test_only_main_runs_share_the_production_lock_and_main_runs_check_the_tip(self):
        group = re.search(r"\nconcurrency:\n  group: (.*)\n", self.text).group(1)
        self.assertEqual(group, "${{ github.ref == 'refs/heads/main' && 'supabase-functions-production' || format('supabase-functions-checks-{0}', github.ref) }}")
        self.assertIn("python3 scripts/supabase-functions-revision.py main-tip", self.step("Check deploy token and main's tip"))
        self.assertNotIn("re-run this workflow", self.text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
