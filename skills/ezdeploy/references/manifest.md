# `ezdeploy.yaml` reference

Use API version `ezdeploy.io/v1alpha1` and kind `Application`. The legacy
`zaodeploy.io/v1alpha1` version remains accepted for existing projects.

```yaml
apiVersion: ezdeploy.io/v1alpha1
kind: Application
metadata:
  name: expense-assistant
  displayName: Expense Assistant
spec:
  runtime: vite
  buildCommand: npm run build
  outputDirectory: dist
  resources:
    - kind: database
      provider: cloudflare-d1
      migrationsDirectory: migrations
    - kind: storage
      provider: cloudflare-r2
    - kind: ai
      provider: zaodeploy-ai
  access:
    mode: organization
    allowedGroups: []
  healthCheck:
    path: /
    timeoutSeconds: 10
    # Optional: require exact top-level JSON fields before publishing.
    # expectedJson:
    #   database: true
```

## Allowed values

- `spec.runtime`: `static`, `vite`, or `cloudflare-workers`.
- `spec.resources[].kind`: `database`, `storage`, or `ai`.
- `spec.access.mode`: `public` or `organization`.
- `metadata.name`: lowercase DNS-compatible name, 2–63 characters.

Use these defaults when the project provides no stronger signal:

- Vite: `buildCommand: npm run build`, `outputDirectory: dist`.
- Static: omit `buildCommand`; set a dedicated directory such as `public`. Never publish the repository root.
- Access: `public`, unless the user requests employee-only or organization access.
- Resources: none. Add a resource only when requested or clearly required by existing application code.
- Database migrations: set `migrationsDirectory` on the database resource when the application requires tables. Use ordered D1 SQL migration files; EZdeploy applies unapplied migrations before each release.
