# Travel ID API proxy
#
# Secrets live in server/.env (gitignored). The mobile app only knows the
# public proxy URL — never the RailRadar / Aviationstack keys.
#
# Local:
#   cd server && npm start
#
# Point the app at it (app.json extra.apiProxyUrl), e.g.:
#   http://YOUR_LAN_IP:8787   (phone on same Wi‑Fi)
#   https://your-proxy.example.com  (production)
#
# Deploy anywhere that runs Node 18+ (Render, Railway, Fly, VPS).
# Set the same env vars from .env.example on the host.
