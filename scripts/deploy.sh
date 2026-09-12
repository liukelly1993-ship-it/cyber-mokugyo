#!/usr/bin/env bash
# scripts/deploy.sh
# 一键把 Cloudflare Worker + D1 数据库部署到线上。
#
# 依赖: backend/node_modules 已安装(npm ci)。
# 必须的环境变量:
#   CLOUDFLARE_API_TOKEN  Cloudflare "Edit Cloudflare Workers" 模板 token
#   CLOUDFLARE_ACCOUNT_ID Cloudflare 账号 ID(Workers 页面右侧栏)
#
# 用法:
#   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy bash scripts/deploy.sh
#
# 该脚本是幂等的:首次运行创建,再运行只更新或跳过。

set -euo pipefail

# 切到 backend 目录(脚本可能被任何 cwd 调用)
cd "$(dirname "$0")/../backend"

# 1. 校验环境变量
: "${CLOUDFLARE_API_TOKEN:?缺少 CLOUDFLARE_API_TOKEN 环境变量}"
: "${CLOUDFLARE_ACCOUNT_ID:?缺少 CLOUDFLARE_ACCOUNT_ID 环境变量}"

export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
export WRANGLER_SEND_METRICS=false
export NO_COLOR=1

echo "▶ 准备 D1 数据库"
DB_ID=""

# 尝试新建;若已存在则通过 wrangler d1 list 找回
CREATE_OUT=$(npx wrangler d1 create cyber-mokugyo 2>&1) || true
if echo "$CREATE_OUT" | grep -qE '"database_id"|database_id ='; then
  DB_ID=$(printf '%s\n' "$CREATE_OUT" \
    | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' \
    | head -1)
  echo "  新建 D1: $DB_ID"
elif echo "$CREATE_OUT" | grep -qiE 'already exists|already_exists'; then
  LIST_OUT=$(npx wrangler d1 list --json 2>&1)
  DB_ID=$(printf '%s\n' "$LIST_OUT" \
    | grep -B2 '"cyber-mokugyo"' \
    | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' \
    | head -1)
  if [ -z "$DB_ID" ]; then
    LIST_OUT=$(npx wrangler d1 list 2>&1)
    DB_ID=$(printf '%s\n' "$LIST_OUT" \
      | awk '/cyber-mokugyo/{print $2}' \
      | head -1)
  fi
  echo "  复用 D1: $DB_ID"
else
  echo "✗ 无法解析 D1 输出" >&2
  echo "$CREATE_OUT" >&2
  exit 1
fi

if [ -z "$DB_ID" ]; then
  echo "✗ D1 ID 为空,wrangler 输出未能解析" >&2
  echo "$CREATE_OUT" >&2
  exit 1
fi

# 2. 把 D1 ID 写入 wrangler.toml(就地修改,跨 BSD/GNU sed)
sed -i.bak "s/database_id = \"REPLACE_AT_DEPLOY_TIME\"/database_id = \"$DB_ID\"/" wrangler.toml
rm -f wrangler.toml.bak

# 3. 应用迁移
echo "▶ 应用数据库 schema"
npx wrangler d1 execute cyber-mokugyo --remote --file=drizzle/0000_initial.sql >/dev/null
echo "  ✓"

# 4. 部署 Worker
echo "▶ 部署 Worker"
DEPLOY_OUT=$(npx wrangler deploy 2>&1)
WORKER_URL=$(printf '%s\n' "$DEPLOY_OUT" \
  | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' \
  | head -1)

echo "$DEPLOY_OUT" | grep -E 'Deployed|workers\.dev|error|✗' || true

if [ -z "$WORKER_URL" ]; then
  echo "✗ 无法解析 Worker URL" >&2
  exit 1
fi

cat <<EOF
================================
✓ 部署完成
Worker URL : $WORKER_URL
API Base   : $WORKER_URL/api
D1 ID      : $DB_ID

接下来:把仓库根目录 index.html 里的
  const API='https://cyber-mokugyo-api.liukelly1993.workers.dev/api';
与上面的 Worker URL 一致即可。然后 git add index.html && git commit -m "chore: 切换 API URL" && git push origin main
GitHub Pages 会在 ~1 分钟内自动发布,workflow 会再次跑(无害)。
================================
EOF