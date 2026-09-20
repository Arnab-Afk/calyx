import { z } from "zod";
import { proposeAction } from "../../execution/executor.js";
import { isOperatorConfigured } from "../../execution/actions/operator-webhook.js";
import { getIncident } from "../../storage/incidents.js";
import type { Tool, ToolOutput } from "../../schemas/index.js";

const InputSchema = z.object({
  tenant_id: z.string().min(1),
  actor_id: z.string().min(1).max(500).optional(),
  incident_id: z.string().uuid(),
  operation: z.string().trim().min(1).max(100),
  target: z.string().trim().min(1).max(500),
  input: z.record(z.unknown()).optional().default({}),
});

type Input = z.infer<typeof InputSchema>;

async function handler(input: Input): Promise<ToolOutput> {
  const context = await getIncident(input.tenant_id, input.incident_id);
  if (!context)
    throw new Error("Incident was not found for the authenticated tenant");
  if (context.incident.status === "resolved") {
    throw new Error("Cannot propose remediation for a resolved incident");
  }
  if (!isOperatorConfigured(input.tenant_id)) {
    throw new Error("No remediation operator is configured for this tenant");
  }

  const result = await proposeAction({
    tenantId: input.tenant_id,
    incidentId: input.incident_id,
    actionName: "operator_webhook",
    params: {
      operation: input.operation,
      target: input.target,
      input: input.input,
    },
    proposedBy: input.actor_id ?? "calyx-agent",
  });

  return {
    summary:
      result.request.status === "pending"
        ? `Remediation ${result.request.id} passed its dry run and requires human approval.`
        : `Remediation ${result.request.id} failed its dry run and cannot execute.`,
    data: {
      remediation_request_id: result.request.id,
      incident_id: input.incident_id,
      status: result.request.status,
      action_name: result.request.actionName,
      dry_run_result: result.request.dryRunResult,
    },
    visualization_hint: "none",
  };
}

export const proposeRemediationTool: Tool<Input> = {
  name: "propose_remediation",
  description:
    "Propose a human-approved remediation through the tenant operator for an active incident. Use only when the user explicitly asks to propose or prepare an action; never use it merely because an action seems useful. This performs a dry run but never executes without a separate authorized approval.",
  inputSchema: InputSchema,
  inputJsonSchema: {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Tenant identifier" },
      incident_id: {
        type: "string",
        description: "Active Calyx incident UUID",
      },
      operation: {
        type: "string",
        description: "Operator allowlisted operation name",
      },
      target: {
        type: "string",
        description: "Bounded service or resource target",
      },
      input: {
        type: "object",
        description: "Operation-specific non-secret parameters",
      },
    },
    required: ["tenant_id", "incident_id", "operation", "target"],
  },
  handler,
};
