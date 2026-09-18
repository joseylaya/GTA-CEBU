import { defineConfig } from 'vite';

// server.js starts Vite in middleware mode; this file is picked up from the
// project root automatically, and also applies to `npm run build`.
const sharing = process.env.DZ_SHARE === '1';

export default defineConfig({
  server: {
    // `tailscale serve` fronts the dev server at https://<machine>.<tailnet>.ts.net
    // and forwards that Host header through. Vite rejects hosts it does not
    // know, so the tailnet domain has to be allowed explicitly. The leading dot
    // matches the domain and its subdomains, and nothing else.
    allowedHosts: ['.ts.net'],
    // Hot reload's websocket cannot reach a guest through the proxy, and a
    // friend playing the game has no use for it. tools/share-tailnet.sh sets
    // DZ_SHARE=1 so a shared session stays quiet instead of retrying forever.
    ...(sharing ? { hmr: false } : {})
  }
});
