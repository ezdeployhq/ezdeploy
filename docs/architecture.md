# Architecture

EZdeploy separates intent, orchestration, and infrastructure execution.

```text
Coding Agent
  -> public Agent discovery document
  -> installed deployment Skill + persistent revocable key
  -> plan preview and explicit owner confirmation
  -> temporary client, direct HTTP, or optional Remote MCP
  -> authenticated EZdeploy request
  -> centralized Control Plane API (provider master keys)
  -> Deployment orchestrator
  -> Control-plane repository
  -> Deploy provider
  -> Cloudflare resources
```

The AI data plane is separate: an application receives a revocable `zai_` credential, calls the EZdeploy AI Proxy using the OpenAI protocol, and the proxy maps approved model aliases to a provider or AI Gateway. Only the proxy holds the provider credential; request bodies are not written to usage logs.

Project build scripts execute in the employee-side Gateway with a minimal environment. The centralized control plane installs dependencies with lifecycle scripts disabled and performs only migrations and provider publication. Source archives exclude local secrets and are integrity-checked before extraction; employee identity comes from a hash-mapped scoped token rather than a tool argument.

The confirmed plan digest is calculated from the normalized manifest. The upload API rejects
a missing digest or a bundle whose manifest no longer matches what the employee approved.
The personal key remains valid until the owner revokes it. It is stored outside project
directories and only its hash is retained by the control plane. Every deployment is still
bound to the explicitly confirmed plan digest. Legacy one-time code exchange remains supported.

## Stable boundaries

- `@ezdeploy/contracts` owns the versioned manifest, deployment states, domain records, and structured errors.
- `@ezdeploy/core` owns state transitions, idempotent resource binding, health-gated orchestration, and provider interfaces.
- `@ezdeploy/agent` provides the zero-install temporary client and optional MCP operations, and converts failures into structured results.
- `@ezdeploy/control-plane` authenticates employees, receives filtered source archives, derives ownership, and owns provider credentials.
- `skills/ezdeploy` owns the agent procedure, not infrastructure behavior.

## Provider rules

A provider must:

- reject unsupported runtimes during planning;
- provision scoped resources without returning master credentials;
- make provisioning idempotent for one application and environment;
- return a provider deployment ID and candidate URL;
- independently verify application health;
- expose useful logs without secret values;
- make deletion semantics explicit.

For organization applications, the exact custom hostname and Access policy are activated
before health verification. Verification uses a dedicated service identity, so an Access
login page cannot be mistaken for a healthy application response.

Cloudflare is the only planned first-release deployment provider. Interfaces exist to isolate vendor behavior, not to promise first-release multi-cloud support.
