#!/usr/bin/env bash
# Starts the Cloudflare tunnel, extracts the public URL, and patches worker/.dev.vars

LOGFILE="/tmp/cloudflared-tunnel.log"
DEV_VARS="worker/.dev.vars"

echo "Starting Cloudflare tunnel..."
npx cloudflared tunnel --url http://localhost:8787 --protocol http2 > "$LOGFILE" 2>&1 &
TUNNEL_PID=$!

# Wait for the URL to appear in the log (up to 30 seconds)
TUNNEL_URL=""
for i in $(seq 1 30); do
  sleep 1
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOGFILE" | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Could not get tunnel URL. Check $LOGFILE"
  kill $TUNNEL_PID 2>/dev/null
  exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"

# Update WORKER_URL in .dev.vars
if grep -q "^WORKER_URL=" "$DEV_VARS"; then
  sed -i "s|^WORKER_URL=.*|WORKER_URL=$TUNNEL_URL|" "$DEV_VARS"
else
  echo "WORKER_URL=$TUNNEL_URL" >> "$DEV_VARS"
fi

echo ".dev.vars updated with: WORKER_URL=$TUNNEL_URL"
echo ""
echo "Tunnel is running (PID $TUNNEL_PID). Keep this terminal open."
echo "Now restart wrangler dev to pick up the new URL."

# Keep script alive so tunnel stays up
wait $TUNNEL_PID
