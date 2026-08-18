# Changelog

Notable user-facing changes are recorded here. This project follows Semantic Versioning once a
public release is tagged.

## 0.1.0 - Unreleased

- Added static-site deployment from the application center: upload a ZIP (up to 10 MiB,
  root index.html required) and the catalog publishes it through the same plan-bound,
  health-gated control-plane workflow used by Agent deployments.
- Added `npm run setup:cloudflare`: an idempotent one-command installer that provisions D1/R2,
  sets R2 lifecycle rules for deployment bundles, writes Worker configuration, deploys all
  four Workers, and reuses locally stored shared secrets.
- Aggregated AI usage into per-day rollups with input/output token counts, added optional
  per-app daily request budgets (`AI_DAILY_REQUEST_BUDGET`) and an AI kill switch
  (`AI_DISABLE`) in the AI Proxy.
- Added an application-center Activity page with recent deployment events and 30-day AI
  usage, plus scheduled (every 30 minutes) health re-verification of ready applications
  that records `unhealthy` events without changing the active release.
- Application previews in the catalog now load on hover instead of all at once, and are
  skipped for organization-protected applications.
- Removed the unused legacy application-center page and aligned the Skill package name
  with the EZdeploy brand.
- Renamed the public project and npm scope from ZaoDeploy to EZdeploy.
- Added zero-install Agent deployment, application catalog, organization access, shared D1/R2
  resources, and centrally managed AI providers.
- Retained compatibility with legacy `zaodeploy.yaml`, `zaodeploy.io/v1alpha1`, `ZAODEPLOY_*`
  variables, connection codes, Agent assets, discovery paths, and MCP tool names.
