# EZdeploy brand migration

EZdeploy is the public name beginning with version `0.1.0`. New projects should use:

- package scope `@ezdeploy/*`;
- manifest file `ezdeploy.yaml`;
- manifest API version `ezdeploy.io/v1alpha1`;
- CLI commands `ezdeploy-agent` and `ezdeploy-mcp`.

Existing installations remain compatible with `zaodeploy.yaml`, `zaodeploy.io/v1alpha1`, the
old CLI aliases, `ZAODEPLOY_*` environment variables, `ZAO-` connection codes, `zao_` Agent
tokens, `zai_` AI keys, old MCP tool names, and `/.well-known/zaodeploy.json` as an alias. These values are
wire-level identifiers and are not evidence that the brand migration is incomplete.

Cloudflare Worker names, D1/R2 resource names, DNS records, and local filesystem paths are not
renamed automatically. Operators may migrate them separately with backups and a rollback plan;
renaming is not required to upgrade the application.
