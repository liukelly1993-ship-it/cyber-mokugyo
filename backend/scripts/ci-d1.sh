#!/usr/bin/env bash
# scripts/ci-d1.sh — 在 CI 里确保 D1 数据库存在并写出 ID。
# 输出:GITHUB_OUTPUT 加一行 db_id=...,并把 wrangler.toml 里的占位符替换为真 ID。
# 注意:此脚本不假定 set -euo pipefail,任何失败分支都显式处理。
set +e

DB_ID=""

# 1. 尝试创建
CREATE_OUT=$(npx wrangler d1 create cyber-mokugyo 2>&1)
echo "wrangler create output: $CREATE_OUT"
DB_ID=$(printf '%s\n' "$CREATE_OUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)

# 2. 已存在则列出来取 ID
if [ -z "$DB_ID" ]; then
  echo "create didn't return an ID, listing existing databases..."
  LIST_OUT=$(npx wrangler d1 list --json 2>&1)
  echo "wrangler list output (first 800 chars): $(printf '%s' "$LIST_OUT" | head -c 800)"
  DB_ID=$(printf '%s' "$LIST_OUT" | grep -oE '"name"[[:space:]]*:[[:space:]]*"cyber-mokugyo"[[:space:]]*,[[:space:]]*"id"[[:space:]]*:[[:space:]]*"[a-f0-9-]{36}"' | grep -oE '[a-f0-9-]{36}' | head -1)
  if [ -z "$DB_ID" ]; then
    # 退路:取列表里任何 D1 ID(可能是因为字段顺序或格式略有差异)
    DB_ID=$(printf '%s' "$LIST_OUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
  fi
fi

# 3. 实在找不到,失败
if [ -z "$DB_ID" ]; then
  echo "::error::Failed to resolve a D1 ID for cyber-mokugyo"
  echo "create output was:"
  echo "$CREATE_OUT"
  if printf '%s' "$CREATE_OUT" | grep -qi "Authentication error"; then
    echo ""
    echo "::notice::Token likely missing D1:Edit permission."
    echo "::notice::Create a custom token at https://dash.cloudflare.com/profile/api-tokens"
    echo "::notice::Required: Account > D1:Edit + Workers Scripts:Edit + Account Settings:Read"
    echo "::notice::The 'Edit Cloudflare Workers' template alone does NOT grant D1 access."
  fi
  exit 1
fi

echo "D1 ID: $DB_ID"
echo "db_id=$DB_ID" >> "$GITHUB_OUTPUT"
sed -i.bak 's/database_id = "REPLACE_AT_DEPLOY_TIME"/database_id = "'"$DB_ID"'"/' wrangler.toml
rm -f wrangler.toml.bak