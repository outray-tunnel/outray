export interface AgentUsageSnapshot {
  organizationId: string;
  runId: string;
  startedAt: Date;
  inputTokens: number;
  outputTokens: number;
  status: "running" | "complete" | "failed" | "cancelled";
}

export interface AgentMonthlyUsage {
  organizationId: string;
  month: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type AgentMonthlyUsageRecorder = {
  record(snapshot: AgentUsageSnapshot): Promise<void>;
};

export interface AgentMonthlyUsageClient {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const COUNTER = /^(0|[1-9]\d*)$/;
const FIELDS = ["input_tokens", "output_tokens", "total_tokens"];

function assertOrganizationId(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    throw new Error("Invalid agent usage organization identifier");
  }
  // Reject unpaired surrogates before constructing a Redis key.
  try { encodeURIComponent(value); }
  catch { throw new Error("Invalid agent usage organization identifier"); }
}

function assertMonth(value: string) {
  if (typeof value !== "string" || !MONTH.test(value)) throw new Error("Invalid agent usage month");
}

function assertCounter(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid agent usage token count");
}

/** A run belongs to the UTC month in which it started, even if it finishes later. */
export function getAgentUsageMonth(startedAt: Date): string {
  if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime())) {
    throw new Error("Invalid agent usage start date");
  }
  const year = startedAt.getUTCFullYear();
  if (year < 0 || year > 9999) throw new Error("Invalid agent usage start date");
  return `${String(year).padStart(4, "0")}-${String(startedAt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getAgentMonthlyUsageKey(organizationId: string, month: string): string {
  assertOrganizationId(organizationId);
  assertMonth(month);
  return `agent:usage:{${encodeURIComponent(organizationId)}}:${month}`;
}

/**
 * One organization/month hash contains aggregates and permanent per-run watermarks.
 * Redis scripts do not roll back after errors, so every check precedes the only write.
 * Decimal formatting preserves safe integers that Lua's tostring would round or exponentiate.
 */
export const AGENT_MONTHLY_USAGE_LUA = `
local MAX = 9007199254740991
local function invalid()
  return redis.error_reply("ERR Invalid persisted agent monthly usage")
end
local function counter(value)
  if type(value) ~= "string" or (value ~= "0" and not string.match(value, "^[1-9]%d*$")) then
    return nil
  end
  local number = tonumber(value)
  if not number or number < 0 or number > MAX or number ~= math.floor(number) then return nil end
  return number
end
if #KEYS ~= 1 or #ARGV ~= 4 then return invalid() end
local incomingInput = counter(ARGV[2])
local incomingOutput = counter(ARGV[3])
if not incomingInput or not incomingOutput or incomingInput > MAX - incomingOutput then return invalid() end
if ARGV[4] ~= "0" and ARGV[4] ~= "1" then return invalid() end
local keyType = redis.call("TYPE", KEYS[1]).ok
if keyType ~= "none" and keyType ~= "hash" then return invalid() end
local prefix = "run:" .. ARGV[1] .. ":"
local values = redis.call("HMGET", KEYS[1], "input_tokens", "output_tokens", "total_tokens",
  prefix .. "input_tokens", prefix .. "output_tokens", prefix .. "settled")
local input = 0
local output = 0
local total = 0
if keyType == "hash" then
  input = counter(values[1])
  output = counter(values[2])
  total = counter(values[3])
  if not input or not output or not total or input > MAX - output or total ~= input + output then return invalid() end
end
local watermarkMissing = not values[4] and not values[5] and not values[6]
local previousInput = 0
local previousOutput = 0
local settled = false
if not watermarkMissing then
  previousInput = counter(values[4])
  previousOutput = counter(values[5])
  if not previousInput or not previousOutput or (values[6] ~= "0" and values[6] ~= "1") then return invalid() end
  settled = values[6] == "1"
end
if previousInput > input or previousOutput > output then return invalid() end
-- Even retries validate existing data before returning; corruption must never be hidden.
if settled then return 0 end
local terminal = ARGV[4] == "1"
local nextInput = incomingInput
local nextOutput = incomingOutput
if not terminal then
  nextInput = math.max(previousInput, incomingInput)
  nextOutput = math.max(previousOutput, incomingOutput)
  if not watermarkMissing and nextInput == previousInput and nextOutput == previousOutput then return 0 end
end
local baseInput = input - previousInput
local baseOutput = output - previousOutput
if nextInput > MAX - baseInput or nextOutput > MAX - baseOutput then return invalid() end
local updatedInput = baseInput + nextInput
local updatedOutput = baseOutput + nextOutput
if updatedInput > MAX - updatedOutput then return invalid() end
local updatedTotal = updatedInput + updatedOutput
redis.call("HSET", KEYS[1],
  "input_tokens", string.format("%.0f", updatedInput),
  "output_tokens", string.format("%.0f", updatedOutput),
  "total_tokens", string.format("%.0f", updatedTotal),
  prefix .. "input_tokens", string.format("%.0f", nextInput),
  prefix .. "output_tokens", string.format("%.0f", nextOutput),
  prefix .. "settled", terminal and "1" or "0")
return 1
`;

/** Atomically distinguish an unused month from an existing, malformed usage hash. */
export const AGENT_MONTHLY_USAGE_READ_LUA = `
local function invalid()
  return redis.error_reply("ERR Invalid persisted agent monthly usage")
end
if #KEYS ~= 1 or #ARGV ~= 0 then return invalid() end
local keyType = redis.call("TYPE", KEYS[1]).ok
if keyType == "none" then return {"0", "0", "0"} end
if keyType ~= "hash" then return invalid() end
local values = redis.call("HMGET", KEYS[1], "input_tokens", "output_tokens", "total_tokens")
if not values[1] or not values[2] or not values[3] then return invalid() end
return values
`;

function persistedCounter(value: unknown): number {
  if (typeof value !== "string" || !COUNTER.test(value)) throw new Error("Invalid persisted agent monthly usage");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("Invalid persisted agent monthly usage");
  return number;
}

/** Explicit injection prevents this module from opening a connection or hiding outages. */
export function createAgentMonthlyUsage(client: AgentMonthlyUsageClient) {
  async function record(snapshot: AgentUsageSnapshot): Promise<void> {
    const month = getAgentUsageMonth(snapshot.startedAt);
    const key = getAgentMonthlyUsageKey(snapshot.organizationId, month);
    if (typeof snapshot.runId !== "string" || !UUID.test(snapshot.runId)) throw new Error("Invalid agent usage run identifier");
    assertCounter(snapshot.inputTokens);
    assertCounter(snapshot.outputTokens);
    if (snapshot.inputTokens > Number.MAX_SAFE_INTEGER - snapshot.outputTokens) throw new Error("Invalid agent usage token count");
    if (!["running", "complete", "failed", "cancelled"].includes(snapshot.status)) throw new Error("Invalid agent usage run status");
    // UUIDs are case-insensitive; normalize to keep retries on one watermark.
    await client.eval(AGENT_MONTHLY_USAGE_LUA, 1, key, snapshot.runId.toLowerCase(),
      String(snapshot.inputTokens), String(snapshot.outputTokens), snapshot.status === "running" ? "0" : "1");
  }

  async function get(organizationId: string, month: string): Promise<AgentMonthlyUsage> {
    const key = getAgentMonthlyUsageKey(organizationId, month);
    const values = await client.eval(AGENT_MONTHLY_USAGE_READ_LUA, 1, key);
    if (!Array.isArray(values) || values.length !== FIELDS.length) throw new Error("Invalid persisted agent monthly usage");
    const [inputTokens, outputTokens, totalTokens] = values.map(persistedCounter);
    if (inputTokens > Number.MAX_SAFE_INTEGER - outputTokens || totalTokens !== inputTokens + outputTokens) {
      throw new Error("Invalid persisted agent monthly usage");
    }
    return { organizationId, month, inputTokens, outputTokens, totalTokens };
  }

  return { record, get };
}
