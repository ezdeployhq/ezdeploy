# Open-source release checklist

## Repository readiness

- Repository created at `jingchang0623-crypto/ezdeploy`; keep it private through validation.
- Confirm that all code and assets can be distributed under Apache-2.0.
- Run `npm run typecheck`, `npm test`, `npm run build`, and dependency review.
- Run secret scanning against the complete Git history, not only the current files.
- Confirm that only `wrangler.example.json` files are tracked.

## GitHub settings

- Enable private vulnerability reporting, secret scanning, Dependabot alerts, and push protection.
- Protect `main`: require pull requests, CI, one approving review, and resolved conversations.
- Limit release and environment permissions to maintainers.
- Add the repository description, topics, license, social preview, and project website.

## First release

1. Publish the repository without production credentials or tenant data.
2. Ask two fresh users to follow the README in clean Cloudflare accounts.
3. Resolve setup gaps and mark `0.1.0` with a signed Git tag.
4. Publish release notes from `CHANGELOG.md`, including known limitations and migration notes.
5. Publish npm packages only if zero-install distribution needs them; source availability does
   not require npm publication.

Do not make the repository public until private vulnerability reporting is enabled, the support
policy is accepted, and a clean-account Cloudflare installation has passed.
