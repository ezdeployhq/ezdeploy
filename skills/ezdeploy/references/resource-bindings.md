# Runtime resource bindings

Never read cloud resources or AI credentials from Vite browser code.

For Vite or static applications, add Pages Functions under `functions/` and let the browser call same-origin `/api/*` routes. Functions receive:

- `env.DB` as the D1 database;
- `env.STORAGE` as the R2 bucket;
- `env.ZAO_AI_BASE_URL` and secret `env.ZAO_AI_API_KEY` for OpenAI-compatible calls.

For Cloudflare Workers, use the same names on the Worker `env` parameter. Do not create `.env`, `.dev.vars`, or source files containing returned keys.

When adding database-backed behavior, create ordered SQL files such as `migrations/0001_initial.sql` and declare `migrationsDirectory: migrations` on the database resource. Make migrations additive and safe to apply once through D1's migration ledger.

When adding file upload, accept the file in a server-side route and call `env.STORAGE.put(key, body)`. Validate size, content type, and key ownership before writing.

When adding AI, call `${env.ZAO_AI_BASE_URL}/chat/completions` with `Authorization: Bearer ${env.ZAO_AI_API_KEY}` and model alias `default-chat`. Never return that key to the browser.
