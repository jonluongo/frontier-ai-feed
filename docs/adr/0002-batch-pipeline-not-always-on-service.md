# Backend is a scheduled batch script, not an always-on service

The ranked/clustered/summarized feed (phase C) is produced by **one TypeScript script on a
GitHub Actions schedule (public repo), stateless over a 72h window, publishing a single
`feed.json` to GitHub Pages** — not by an always-on service with Postgres+pgvector, which
was the original proposal. An adversarial, primary-source audit
([docs/research/2026-08-12-backend-architecture-audit.md](../research/2026-08-12-backend-architecture-audit.md))
found the service shape was the most expensive answer to a problem no requirement poses: at
~1–3K live vectors pgvector is exact-scan anyway (its README), online centroid clustering
has textbook chaining/drift failures (batch window re-clustering is sub-second at our
scale), and a morning-read product doesn't need 10-minute freshness. Cost drops from
$10–30/mo to ~$2–4/mo (all LLM). Trade-off accepted: GHA cron has minutes-level jitter, can
drop runs under load, and auto-disables after 60 days of repo inactivity; push-notification
Alerts are not possible from pure batch. The escape hatch is relocating the same script to
a $1/mo Render cron (or $2/mo Fly machine) — a redeploy, not a redesign. Revisit if push
Alerts or multi-user become real.
