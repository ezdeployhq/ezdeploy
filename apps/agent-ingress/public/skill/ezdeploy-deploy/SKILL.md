---
name: ezdeploy-deploy
description: Deploy the current project to the user's personal EZdeploy application center. Use when the user says “部署到应用中心”, “发布到 EZdeploy”, “上线这个应用”, “部署这个项目”, or asks to publish without naming another deployment provider.
---

# EZdeploy Deployment

Deploy through the user's personal EZdeploy center and return a verified application URL.

## Credentials

Read `${XDG_CONFIG_HOME:-$HOME/.config}/ezdeploy/credentials.json`:

```json
{"apiUrl":"https://deploy.example.com","connectionKey":"zao_..."}
```

If the file and key already work, do not reinstall this Skill or ask for authorization again. If credentials are missing, direct the user to the center's **部署设置** page once. Ask for a replacement key only after a `401` or `403` response.

Never put the key in the repository, application bundle, logs, command output, or final response. Keep the credential file outside projects with mode `0600`.

## Workflow

1. Inspect the project. Create or update `ezdeploy.yaml` with only the runtime and resources actually needed.
2. Download the standalone client, WebAssembly file, and `/client/manifest.json` from `apiUrl` into an operating-system temporary directory. Verify every file's SHA-256 and byte size against the manifest before execution.
3. Run the client with `plan --api-url <apiUrl> --connection-key <connectionKey>`.
4. Show the application name, runtime, resources, access mode, risks, and health check. Wait for explicit confirmation of this plan.
5. Validate and build locally. Then run `deploy` with the same API URL and key plus the exact confirmed `--plan-digest`.
6. Poll until the deployment is `ready` and its URL passes the health check. On a structured failure, inspect logs, make one in-scope correction, and retry once.
7. Delete temporary client files. Return the healthy application URL; never report a queued state or provider deployment ID as success.

Supported runtimes are `static`, `vite`, and `cloudflare-workers`. Keep AI-provider, database, and storage secrets server-side; browser code must not receive them.
