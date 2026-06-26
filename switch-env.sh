#!/bin/bash
if [ "$1" = "local" ]; then
  cp .env.development .env.local
  echo "✅ Switched to LOCAL (127.0.0.1)"
elif [ "$1" = "prod" ]; then
  cp .env.production .env.local
  echo "✅ Switched to PRODUCTION (supabase.co)"
elif [ "$1" = "status" ]; then
  URL=$(grep SUPABASE_URL .env.local | cut -d '=' -f2)
  if [[ $URL == *"127.0.0.1"* ]]; then
    echo "💻 Currently on LOCAL"
  else
    echo "☁️  Currently on PRODUCTION"
  fi
else
  echo "Usage: ./switch-env.sh [local|prod|status]"
fi
