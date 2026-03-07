#!/usr/bin/env bash
set -euo pipefail

# Build Lambda functions into deployment zips using esbuild.
# Bundles TypeScript source into single-file CJS bundles with sourcemaps.
# External: @aws-sdk/* (provided by Lambda Node 20 runtime).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"

echo "==> Cleaning dist/"
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

build_lambda() {
  local name="$1"
  local entry="$2"

  local out_dir="${DIST_DIR}/${name}"
  local out_file="${out_dir}/index.js"

  echo "==> Building ${name} Lambda"
  npx esbuild "${entry}" \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --outfile="${out_file}" \
    --external:@aws-sdk/* \
    --minify=false \
    --sourcemap \
    --tsconfig="${REPO_ROOT}/tsconfig.base.json"

  echo "==> Packaging ${name}.zip"
  (cd "${out_dir}" && zip -qr "${DIST_DIR}/${name}.zip" .)

  local size
  size=$(du -h "${DIST_DIR}/${name}.zip" | cut -f1)
  echo "==> ${name}.zip: ${size}"
}

# ─── Build all Lambdas ────────────────────────────────────────────────────────

build_lambda "renderer" "${REPO_ROOT}/packages/lambdas/renderer/src/index.ts"
build_lambda "api" "${REPO_ROOT}/packages/lambdas/api/src/index.ts"
build_lambda "stripe-webhook" "${REPO_ROOT}/packages/lambdas/stripe-webhook/src/index.ts"

echo "==> Build complete"
