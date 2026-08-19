#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
runtime_manifest="${SITES_PROJECT_ROOT}/dist/.runtime/runtime-bindings.json"

[[ -f "${worker}" ]] || {
  echo "Missing Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${runtime_manifest}" ]] || {
  echo "Missing packaged runtime manifest: dist/.runtime/runtime-bindings.json" >&2
  exit 66
}

node --input-type=module - "${worker}" "${runtime_manifest}" <<'NODE'
import { readFile } from "node:fs/promises";

const [workerPath, manifestPath] = process.argv.slice(2);
JSON.parse(await readFile(manifestPath, "utf8"));
const workerSource = await readFile(workerPath, "utf8");
if (!/export\s*\{[^}]*\bas default\b[^}]*\}/s.test(workerSource)) {
  throw new Error("dist/server/index.js must contain an ESM default export");
}
if (!/\.fetch\(request, env, ctx\)|async fetch\(request, env, ctx\)/.test(workerSource)) {
  throw new Error("dist/server/index.js must delegate fetch(request, env, ctx)");
}
NODE

# Syntax-check without resolving Cloudflare runtime-only module specifiers such as
# cloudflare:workers, which plain Node cannot import outside the Workers runtime.
node --check "${worker}"

echo "Validated runtime artifact: Worker syntax, default export, fetch delegation, and manifest are present."
