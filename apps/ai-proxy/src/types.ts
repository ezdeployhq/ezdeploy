export interface AiCredential {
  id: string;
  appId: string;
  keyHash: string;
  allowedModels: string[];
  requestsPerMinute: number;
  active: boolean;
}

export interface CreateCredentialInput {
  id: string;
  appId: string;
  keyHash: string;
  allowedModels: string[];
  requestsPerMinute: number;
}

export interface UsageEvent {
  credentialId: string;
  appId: string;
  modelAlias: string;
  upstreamModel: string;
  endpoint: string;
  statusCode: number;
  createdAt: string;
}

export interface AiCredentialStore {
  create(input: CreateCredentialInput): Promise<void>;
  findByKeyHash(keyHash: string): Promise<AiCredential | null>;
  revoke(id: string): Promise<boolean>;
  countRecentRequests(appId: string, since: string): Promise<number>;
  recordUsage(event: UsageEvent): Promise<void>;
}
