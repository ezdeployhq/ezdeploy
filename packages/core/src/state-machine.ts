import type { DeploymentStatus } from "@ezdeploy/contracts";
import { EZdeployError } from "@ezdeploy/contracts";

const transitions: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  queued: ["inspecting", "failed"],
  inspecting: ["planned", "failed"],
  planned: ["provisioning", "failed"],
  provisioning: ["deploying", "failed"],
  deploying: ["verifying", "failed"],
  verifying: ["ready", "failed"],
  ready: ["deleting"],
  failed: ["deleting"],
  deleting: ["deleted", "failed"],
  deleted: [],
};

export function assertStatusTransition(from: DeploymentStatus, to: DeploymentStatus): void {
  if (!transitions[from].includes(to)) {
    throw new EZdeployError(
      "INVALID_STATE_TRANSITION",
      `Deployment cannot transition from ${from} to ${to}`,
      { from, to },
    );
  }
}
