import crypto from "node:crypto";
import { z } from "zod";
import type {
  Action,
  ActionContext,
  ActionResult,
} from "../../schemas/index.js";

const ParamsSchema = z.object({
  operation: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._:-]+$/),
  target: z.string().trim().min(1).max(500),
  input: z.record(z.unknown()).optional().default({}),
});

interface OperatorConfig {
  url: string;
  secret: string;
  allowedOperations: string[];
}

function tenantConfig(tenantId: string): OperatorConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(process.env.CALYX_OPERATOR_CONFIG ?? "{}");
  } catch {
    throw new Error("CALYX_OPERATOR_CONFIG must be a JSON object");
  }
  const value = (parsed as Record<string, unknown> | null)?.[tenantId];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `No remediation operator is configured for tenant ${tenantId}`,
    );
  }
  const {
    url,
    secret,
    allowed_operations: allowedOperations,
  } = value as Record<string, unknown>;
  if (
    typeof url !== "string" ||
    typeof secret !== "string" ||
    secret.length < 32 ||
    !Array.isArray(allowedOperations) ||
    allowedOperations.length === 0 ||
    !allowedOperations.every((operation) => typeof operation === "string")
  ) {
    throw new Error(
      `Invalid remediation operator configuration for tenant ${tenantId}`,
    );
  }
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password)
    throw new Error("Operator URL must not contain credentials");
  if (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") {
    throw new Error("Production remediation operators must use HTTPS");
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("Remediation operator URL must use HTTP or HTTPS");
  }
  return { url: endpoint.toString(), secret, allowedOperations };
}

export function isOperatorConfigured(tenantId: string): boolean {
  try {
    tenantConfig(tenantId);
    return true;
  } catch {
    return false;
  }
}

async function invokeOperator(
  phase: "dry_run" | "execute",
  params: unknown,
  context: ActionContext,
): Promise<ActionResult> {
  const validated = ParamsSchema.parse(params);
  const config = tenantConfig(context.tenantId);
  if (!config.allowedOperations.includes(validated.operation)) {
    throw new Error(
      `Operation is not allowed for tenant: ${validated.operation}`,
    );
  }
  const payload = JSON.stringify({
    version: 1,
    request_id: context.requestId,
    tenant_id: context.tenantId,
    phase,
    operation: validated.operation,
    target: validated.target,
    input: validated.input,
  });
  if (Buffer.byteLength(payload) > 16 * 1024)
    throw new Error("Operator request exceeds 16 KiB");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", config.secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const timeoutMs = Number.parseInt(
    process.env.CALYX_OPERATOR_TIMEOUT_MS ?? "10000",
    10,
  );
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-calyx-timestamp": timestamp,
      "x-calyx-signature": `sha256=${signature}`,
      "idempotency-key": `${context.requestId}:${phase}`,
    },
    body: payload,
    redirect: "error",
    signal: AbortSignal.timeout(
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000,
    ),
  });
  const text = await response.text();
  if (Buffer.byteLength(text) > 64 * 1024)
    throw new Error("Operator response exceeds 64 KiB");
  if (!response.ok)
    throw new Error(`Operator returned HTTP ${response.status}`);

  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Operator returned invalid JSON");
  }
  return z
    .object({
      success: z.boolean(),
      message: z.string().min(1).max(2000),
      before: z.unknown().optional(),
      after: z.unknown().optional(),
    })
    .parse(result);
}

export const operatorWebhookAction: Action = {
  name: "operator_webhook",
  description:
    "Request a bounded operation from the tenant's authenticated remediation operator.",
  defaultTier: "0",
  reversible: false,
  dry_run: (params, context) => invokeOperator("dry_run", params, context),
  execute: (params, context) => invokeOperator("execute", params, context),
};
