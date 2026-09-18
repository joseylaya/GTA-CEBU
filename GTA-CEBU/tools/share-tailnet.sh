#!/usr/bin/env bash
# Share the running District Zero dev server with a friend over Tailscale.
#
# Tailscale puts both machines on one flat network, so WebRTC voice connects
# directly with no relay server. `tailscale serve` also fronts the game with a
# real HTTPS certificate, which browsers require before granting a microphone.
set -uo pipefail

PORT="${PORT:-5173}"

find_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then command -v tailscale; return; fi
  for candidate in \
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale" \
    "/usr/local/bin/tailscale" \
    "/opt/homebrew/bin/tailscale"; do
    [ -x "$candidate" ] && { echo "$candidate"; return; }
  done
}

TS="$(find_tailscale)"
if [ -z "$TS" ]; then
  cat >&2 <<'MSG'
Tailscale is not installed.

  brew install --cask tailscale     (or download from https://tailscale.com/download)

Then open the app, sign in, and have your friend install it and join the same
tailnet -- either sign in with the same account, or send them a device-share
invite from the Tailscale admin console.
MSG
  exit 1
fi

if [ "${1:-}" = "--stop" ]; then
  "$TS" serve --https=443 off >/dev/null 2>&1 || "$TS" serve reset >/dev/null 2>&1
  echo "Stopped sharing. The game is private to this machine again."
  exit 0
fi

if ! "$TS" status >/dev/null 2>&1; then
  echo "Tailscale is installed but not signed in. Open the Tailscale app and sign in, then rerun." >&2
  exit 1
fi

HOSTNAME_FQDN="$("$TS" status --json 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)"
if [ -z "$HOSTNAME_FQDN" ]; then
  echo "Could not read this machine's tailnet name. Is MagicDNS enabled in the admin console?" >&2
  exit 1
fi

if ! curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "The game server is not responding on port ${PORT}. Start it first:" >&2
  echo "    npm run dev" >&2
  exit 1
fi

echo "Publishing http://127.0.0.1:${PORT} to your tailnet..."
if ! "$TS" serve --bg --https=443 "http://127.0.0.1:${PORT}" 2>/tmp/dz-serve-error; then
  # Older Tailscale releases use a different argument order.
  if ! "$TS" serve https / "http://127.0.0.1:${PORT}" 2>>/tmp/dz-serve-error; then
    echo >&2
    echo "tailscale serve failed:" >&2
    sed 's/^/    /' /tmp/dz-serve-error >&2
    echo >&2
    echo "The usual cause is HTTPS certificates being switched off for your tailnet." >&2
    echo "Enable MagicDNS and HTTPS Certificates under DNS in the admin console:" >&2
    echo "    https://login.tailscale.com/admin/dns" >&2
    exit 1
  fi
fi

cat <<MSG

  Share this URL with your friend:

      https://${HOSTNAME_FQDN}/

  It is HTTPS with a real certificate, so the microphone prompt will appear
  normally. Only devices on your tailnet can reach it -- it is not public.

  Both of you: open the URL, pick a name, NEW GAME, then click the microphone
  pill and allow the mic. Hold V to talk.

  To stop sharing:  npm run share:stop

MSG
