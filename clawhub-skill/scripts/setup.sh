#!/usr/bin/env bash
set -euo pipefail

# SwipeGPT skill setup — verify MCP server is reachable

SWIPEGPT_MCP_URL="${SWIPEGPT_MCP_URL:-https://swipegpt-production.up.railway.app}"

echo "Checking SwipeGPT MCP server..."

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SWIPEGPT_MCP_URL%/sse}/")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "SwipeGPT MCP server is reachable (HTTP $HTTP_STATUS)"
  echo "Skill ready to use."
else
  echo "Warning: SwipeGPT MCP server returned HTTP $HTTP_STATUS"
  echo "The skill will still install, but check that SWIPEGPT_MCP_URL is correct."
fi
