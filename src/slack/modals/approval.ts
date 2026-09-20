import type { RemediationRequest } from "../../storage/remediations.js";

export function buildApprovalModal(
  request: RemediationRequest,
  context: { channel: string; threadTs: string; teamId?: string },
): object {
  const dryResult = request.dryRunResult;
  const lines = [
    `*Action:* \`${request.actionName}\``,
    `*Proposed at:* <!date^${Math.floor(new Date(request.createdAt).getTime() / 1000)}^{date_short_pretty} at {time}|${request.createdAt}>`,
    `*Dry-run result:* ${dryResult.success ? ":white_check_mark: would succeed" : ":x: would fail — " + dryResult.message}`,
    "",
    "*Preview:*",
    dryResult.before !== undefined
      ? `Before: \`${JSON.stringify(dryResult.before)}\``
      : "",
    dryResult.after !== undefined
      ? `After:  \`${JSON.stringify(dryResult.after)}\``
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    type: "modal",
    callback_id: "approve_action_modal",
    private_metadata: JSON.stringify({ requestId: request.id, ...context }),
    title: { type: "plain_text", text: "Approve Action", emoji: true },
    submit: { type: "plain_text", text: "Run it", emoji: true },
    close: { type: "plain_text", text: "Cancel", emoji: true },
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: lines } },
      { type: "divider" },
      {
        type: "input",
        block_id: "reason_block",
        label: { type: "plain_text", text: "Reason for approval" },
        hint: {
          type: "plain_text",
          text: "This is stored in the immutable remediation event log.",
        },
        element: {
          type: "plain_text_input",
          action_id: "reason_input",
          multiline: false,
          placeholder: {
            type: "plain_text",
            text: "e.g. Confirmed with on-call, safe to proceed",
          },
        },
      },
    ],
  };
}
