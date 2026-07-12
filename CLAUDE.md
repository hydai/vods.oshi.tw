# vods.oshi.tw

VTuber 歌回 VOD archive. Next.js App Router via vinext, SSR on Cloudflare
Workers. Data loads server-side from https://data.oshi.tw (R2); the feed has
no browser CORS by design — never move data fetching to the client.

## Deploying a new version

Production = worker `vods-oshi-tw` at https://vods.oshi.tw
(custom domain; workers.dev disabled).

Normal flow — Workers Builds (Cloudflare git integration): pushing to `main`
auto-builds (`npm run build`) and deploys
(`npx wrangler deploy -c dist/server/wrangler.json`); non-main pushes only
upload a preview version. Run `npm run lint && npm test` before pushing.
Build status lives in the worker's Builds tab; CI Node version is pinned in
`.node-version`.

Manual fallback (only when Workers Builds is unavailable — don't race a
running build):

1. Gate: `npm run lint && npm test` — `npm test` runs the build, which
   regenerates `dist/server/wrangler.json`.
2. Deploy: `npx wrangler deploy -c dist/server/wrangler.json`
   (load the `wrangler` skill first; check auth with `npx wrangler whoami`).
3. Verify: `curl -s https://vods.oshi.tw/ | grep -o '<title>[^<]*</title>'`
   → expect `VTuber VOD 封存庫 · VODs`. Debug with `npx wrangler tail vods-oshi-tw`.

Config rules:

- Deploy config (custom domain route, `workers_dev: false`, bindings) lives in
  `workerConfig` in `vite.config.ts` and is emitted into
  `dist/server/wrangler.json` at build time. Never hand-edit the generated file.
- Rollback: `npx wrangler versions list` then `npx wrangler rollback`.
- Right after DNS/domain changes, local resolvers may cache NXDOMAIN — verify
  with `dig @1.1.1.1 vods.oshi.tw` / `curl --resolve` before concluding the
  deploy failed.
