import { D1AiCredentialStore } from "./d1-store.js";
import { createAiProxyHandler, type AiProxyEnvironment } from "./handler.js";
import { D1AiProviderStore } from "./provider-store.js";

interface WorkerEnvironment extends AiProxyEnvironment {
  DB: D1Database;
}

export default {
  fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    return createAiProxyHandler({
      store: new D1AiCredentialStore(environment.DB),
      providers: new D1AiProviderStore(environment.DB),
      environment,
    })(request);
  },
};

export * from "./d1-store.js";
export * from "./handler.js";
export * from "./provider-store.js";
export * from "./types.js";
