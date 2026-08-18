export interface AiCredential {
  id: string;
  appId: string;
  keyHash: string;
  allowedModels: string[];
  requestsPerMinute: number;
  dailyRequestBudget: number | null;
  active: boolean;
}

export interface CreateCredentialInput {
  id: string;
  appId: string;
  keyHash: string;
  allowedModels: string[];
  requestsPerMinute: number;
  dailyRequestBudget?: number | null;
}

export interface UsageRecord {
  appId: string;
  minute: string;
  day: string;
  modelAlias: string;
  upstreamModel: string;
  endpoint: string;
  statusCode: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DailyUsage {
  day: string;
  modelAlias: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiCredentialStore {
  create(input: CreateCredentialInput): Promise<void>;
  findByKeyHash(keyHash: string): Promise<AiCredential | null>;
  revoke(id: string): Promise<boolean>;
  minuteCount(appId: string, minute: string): Promise<number>;
  dailyRequestTotal(appId: string, day: string): Promise<number>;
  recordUsage(record: UsageRecord): Promise<void>;
}
