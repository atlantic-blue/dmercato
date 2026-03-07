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

# ─── Renderer Lambda ─────────────────────────────────────────────────────────

RENDERER_ENTRY="${REPO_ROOT}/packages/lambdas/renderer/src/index.ts"
RENDERER_OUT="${DIST_DIR}/renderer/index.js"

echo "==> Building renderer Lambda"
npx esbuild "${RENDERER_ENTRY}" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="${RENDERER_OUT}" \
  --external:@aws-sdk/* \
  --minify=false \
  --sourcemap \
  --tsconfig="${REPO_ROOT}/tsconfig.base.json"

echo "==> Packaging renderer.zip"
(cd "${DIST_DIR}/renderer" && zip -qr "${DIST_DIR}/renderer.zip" .)

RENDERER_SIZE=$(du -h "${DIST_DIR}/renderer.zip" | cut -f1)
echo "==> renderer.zip: ${RENDERER_SIZE}"

echo "==> Build complete"
