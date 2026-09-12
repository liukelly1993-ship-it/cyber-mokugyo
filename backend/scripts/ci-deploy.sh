#!/usr/bin/env bash
# scripts/ci-deploy.sh — 在 CI 里部署 Worker 并捕获 URL。
# 输出:GITHUB_OUTPUT 加一行 worker_url=...
set +e

DEPLOY_OUT=$(npx wrangler deploy 2>&1)
echo "$DEPLOY_OUT"
WORKER_URL=$(printf '%s\n' "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.workers\.dev' | head -1)
if [ -z "$WORKER_URL" ]; then
  echo "::error::Could not parse Worker URL from deploy output"
  exit 1
fi
echo "worker_url=$WORKER_URL" >> "$GITHUB_OUTPUT"