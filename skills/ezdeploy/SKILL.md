---
name: ezdeploy
description: Inspect, plan, deploy, verify, troubleshoot, and remove supported internal web applications through the EZdeploy MCP server. Use when a user asks Codex to deploy or publish the current static, Vite/React, or Cloudflare Workers project; bind database, storage, AI, or organization access; retrieve a deployment URL or logs; redeploy; or remove an EZdeploy application.
---

# EZdeploy

Turn an explicit deployment request into a verified application URL while keeping provider credentials out of the repository and agent context.

## Deployment workflow

1. Inspect the project files and determine whether the runtime is supported.
2. Read `references/manifest.md` when `ezdeploy.yaml` is absent or needs modification. When database, storage, or AI is requested, also read `references/resource-bindings.md` and keep all binding access in server-side Functions or Worker code.
3. Create or minimally update `ezdeploy.yaml`. Do not add undeclared resources.
4. Call `inspect_zaodeploy_project` and correct manifest validation errors.
5. Call `plan_zaodeploy_deployment`. Summarize the runtime, resources, access mode, and provider.
6. If the user explicitly requested deployment, call `deploy_to_zaodeploy`; that request authorizes the resources shown in the plan. Otherwise stop after the plan.
7. Require a `ready` deployment and non-empty URL before reporting success.
8. On failure, call `get_zaodeploy_logs`, explain the structured error, make an in-scope correction when possible, and redeploy.

## Safety rules

- Never request, print, store, or commit Cloudflare, Supabase, or model-provider master credentials. EZdeploy owns provider credentials and returns only scoped bindings.
- Never write returned secrets into source files. Runtime bindings are injected by the provider.
- Treat `organization` access as intentional restricted access; do not silently downgrade it to `public`.
- Do not claim arbitrary Docker, Kubernetes, long-running process, or unsupported framework compatibility.
- Do not report success from a provider deployment ID alone. Health verification and a live URL are required.
- Preserve existing `ezdeploy.yaml` values unless the user's request requires changing them.

## Follow-up operations

- Use `list_zaodeploy_apps` to show the active healthy releases in the application center.
- Use `get_zaodeploy_deployment` to check persisted state.
- Use `get_zaodeploy_logs` for build, provider, or health-check failures.
- Use `rollback_zaodeploy_app` only when the user asks to restore a specific earlier healthy deployment.
- Before deletion, state whether application resources are retained or removed according to the tool response, then call `delete_zaodeploy_app` only when the user explicitly asks.

Return the verified URL first, followed by the deployment ID, bound resource kinds, and access mode. Keep operational detail concise unless something failed.
