# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability
reporting feature for the repository. Until that feature is enabled, contact
[@jingchang0623-crypto](https://github.com/jingchang0623-crypto) privately through the address
published in the maintainer's GitHub profile.

Include the affected version, impact, reproduction steps, and any suggested mitigation. We aim
to acknowledge reports within five business days. Disclosure timing will be coordinated after a
fix is available.

## Supported versions

Before the first stable release, only the latest commit on the default branch is supported.

## Operator responsibilities

EZdeploy handles deployment credentials and can create cloud resources. Operators must use
least-privilege Cloudflare tokens, keep secrets in Worker secrets, protect control surfaces with
Cloudflare Access, review logs, rotate credentials, and validate configuration before production
use. Example configuration values are placeholders, not secure production defaults.
