import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("packages development preview metadata into the Worker", async () => {
  const worker = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(worker, /["']codex-preview["']\s*:\s*["']development["']/);
  assert.match(worker, /export\s*\{[^}]*\bas default\b[^}]*\}/s);
});
