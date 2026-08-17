# Contributing to EZdeploy

Thank you for helping make internal application delivery simpler and safer.

## Before you start

- Use Node.js 22 or later.
- Open an issue before large architectural or protocol changes.
- Never commit credentials, Cloudflare IDs, employee data, or live tenant URLs.
- Preserve backward compatibility for published manifests, Agent endpoints, environment
  variables, and MCP tool names unless a migration plan has been accepted.

## Development workflow

```bash
npm install
npm run typecheck
npm test
npm run build
```

Use a focused branch and keep unrelated changes out of the pull request. Add tests for behavior
changes and update operator or employee documentation when a workflow changes.

## Pull requests

A pull request should explain the user problem, the chosen behavior, compatibility impact,
security impact, and verification performed. A maintainer must review changes to authentication,
deployment execution, provider credentials, manifests, or database migrations.

By contributing, you agree that your contribution is licensed under Apache-2.0.
