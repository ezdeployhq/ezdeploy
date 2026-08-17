export type EZdeployErrorCode =
  | "MANIFEST_NOT_FOUND"
  | "MANIFEST_INVALID"
  | "RUNTIME_UNSUPPORTED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVISION_FAILED"
  | "DEPLOY_FAILED"
  | "DELETE_FAILED"
  | "HEALTH_CHECK_FAILED"
  | "DEPLOYMENT_NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_STATE_TRANSITION";

export class EZdeployError extends Error {
  constructor(
    public readonly code: EZdeployErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EZdeployError";
  }
}
