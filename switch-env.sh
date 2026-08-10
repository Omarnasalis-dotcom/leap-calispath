#!/bin/bash
set -euo pipefail

# This script OVERWRITES .env.local wholesale. Any key that exists only in
# .env.local — not in the source file being copied — is silently lost. That
# already happened once with EXPO_PUBLIC_SENTRY_DSN, which quietly disabled
# error reporting. switch_env() now diffs the key sets first and refuses to
# clobber rather than dropping keys without telling you.
switch_env() {
  local src="$1" label="$2"

  if [ ! -f "$src" ]; then
    echo "❌ $src not found — nothing copied."
    exit 1
  fi

  if [ -f .env.local ]; then
    local missing
    missing=$(comm -23 \
      <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*' .env.local | sort -u) \
      <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$src" | sort -u))
    if [ -n "$missing" ]; then
      echo "❌ Refusing to switch: these keys exist in .env.local but not in $src,"
      echo "   and would be lost:"
      echo "$missing" | sed 's/^/     - /'
      echo "   Add them to $src (or remove them from .env.local) and re-run."
      exit 1
    fi
  fi

  cp "$src" .env.local
  echo "✅ Switched to $label"
}

case "${1:-}" in
  local) switch_env .env.development "LOCAL (127.0.0.1)" ;;
  prod)  switch_env .env.production  "PRODUCTION (supabase.co)" ;;
  status)
    URL=$(grep SUPABASE_URL .env.local | cut -d '=' -f2)
    if [[ $URL == *"127.0.0.1"* ]]; then
      echo "💻 Currently on LOCAL"
    else
      echo "☁️  Currently on PRODUCTION"
    fi
    ;;
  *) echo "Usage: ./switch-env.sh [local|prod|status]" ;;
esac
