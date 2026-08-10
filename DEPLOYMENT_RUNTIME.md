# Supa AI Production Runtime

- Node.js: 22.23.2 (Node 22)
- npm: 10.x
- Package manager: npm
- Install: `npm ci`
- Build: `npm run build`
- Production server: `npm start`

## Next.js output

- Vercel: standard Next.js `.next` output. Vercel manages the deployment output and routes manifest.
- Docker/local production: standalone output is enabled automatically when `VERCEL=1` is not set.

## Environment validation

Environment variables are not globally required during module evaluation. Feature-specific services validate the credentials they actually need at runtime. This prevents an optional integration or missing API key from breaking unrelated pages during Vercel build/page-data collection.

Local development, CI, Docker, and production should use Node 22. Do not bypass engine checks with `--force` or `--legacy-peer-deps`.
