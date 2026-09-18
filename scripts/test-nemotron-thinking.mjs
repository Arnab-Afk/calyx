import "dotenv/config";

const key = process.env.NVIDIA_API_KEY;
const base = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MODEL = "nvidia/nemotron-3-super-120b-a12b";

if (!key) {
  console.error("NVIDIA_API_KEY missing");
  process.exit(1);
}

const STATS_TOOL = [
  {
    type: "function",
    function: {
      name: "get_service_stats",
      description: "Get aggregate statistics for one or all services.",
      parameters: {
        type: "object",
        properties: {
          tenant_id: { type: "string" },
          service: { type: "string" },
        },
        required: ["tenant_id"],
      },
    },
  },
];

const FAKE_STATS = JSON.stringify({
  summary: "3 services, 120000 events, 2.1% error rate. auth-service 12% errors, all in us-east-1.",
  data: {
    stats: [
      { service: "auth-service", total: 40000, error_count: 4800, error_rate: 12 },
      { service: "api", total: 70000, error_count: 70, error_rate: 0.1 },
    ],
    overall_error_rate: 2.1,
  },
});

function summarizeMessage(msg = {}) {
  const reasoning =
    msg.reasoning_content ?? msg.reasoning ?? msg.thinking ?? "";
  const content = msg.content ?? "";
  const tools = (msg.tool_calls ?? []).map((c) => c.function?.name);
  const extraKeys = Object.keys(msg).filter(
    (k) => !["role", "content", "reasoning_content", "tool_calls", "refusal"].includes(k)
  );
  const leak =
    typeof content === "string" &&
    /the user (says|asked)|I need to|let me think|chain of thought/i.test(content);
  return {
    keys: Object.keys(msg),
    extraKeys,
    finish_fields_note: extraKeys.length ? extraKeys : undefined,
    reasoning_len: String(reasoning).length,
    reasoning_head: String(reasoning).replace(/\s+/g, " ").slice(0, 90),
    content_len: String(content).length,
    content_head: String(content).replace(/\s+/g, " ").slice(0, 90),
    tools,
    leak,
  };
}

async function chat(label, body) {
  const t0 = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 1, top_p: 0.95, ...body }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { label, status: res.status, ms: Date.now() - t0, error: text.slice(0, 180) };
  }
  if (!res.ok) {
    const err = json.error?.message ?? json.error ?? json.detail ?? text.slice(0, 180);
    return { label, status: res.status, ms: Date.now() - t0, error: String(err).slice(0, 220) };
  }
  const choice = json.choices?.[0] ?? {};
  return {
    label,
    status: res.status,
    ms: Date.now() - t0,
    finish: choice.finish_reason,
    usage: json.usage,
    ...summarizeMessage(choice.message),
    tool_call_id: choice.message?.tool_calls?.[0]?.id,
    tool_args: choice.message?.tool_calls?.[0]?.function?.arguments?.slice(0, 120),
    raw_message: choice.message,
  };
}

function thinkingKwargs(on, extra = {}) {
  return { chat_template_kwargs: { enable_thinking: on, ...extra } };
}

const cases = [];

// 1. Default (no enable_thinking) — docs say thinking ON by default
cases.push(
  await chat("1_default_kwargs_omitted", {
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    max_tokens: 1024,
  })
);

// 2. Thinking OFF, short ping
cases.push(
  await chat("2_thinking_off_ping", {
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    max_tokens: 64,
    ...thinkingKwargs(false),
  })
);

// 3. Thinking ON, short ping with room for reasoning
cases.push(
  await chat("3_thinking_on_ping", {
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    max_tokens: 1024,
    ...thinkingKwargs(true),
  })
);

// 4. Thinking ON + tiny max_tokens (Claude-style: thinking can starve the answer)
cases.push(
  await chat("4_thinking_on_max32", {
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    max_tokens: 32,
    ...thinkingKwargs(true),
  })
);

// 5. Reasoning budget 256
cases.push(
  await chat("5_thinking_on_budget_256", {
    messages: [{ role: "user", content: "Is 91 prime? Answer yes or no, then one reason." }],
    max_tokens: 2048,
    reasoning_budget: 256,
    ...thinkingKwargs(true),
  })
);

// 6. Reasoning budget 2048
cases.push(
  await chat("6_thinking_on_budget_2048", {
    messages: [{ role: "user", content: "Is 91 prime? Answer yes or no, then one reason." }],
    max_tokens: 4096,
    reasoning_budget: 2048,
    ...thinkingKwargs(true),
  })
);

// 7. Thinking OFF + tool
cases.push(
  await chat("7_thinking_off_tool", {
    messages: [
      {
        role: "user",
        content: "Call get_service_stats for tenant_id eventio. Do not answer without the tool.",
      },
    ],
    max_tokens: 512,
    tools: STATS_TOOL,
    tool_choice: "auto",
    ...thinkingKwargs(false),
  })
);

// 8. Thinking ON + tool
const toolOn = await chat("8_thinking_on_tool", {
  messages: [
    {
      role: "user",
      content: "Call get_service_stats for tenant_id eventio. Do not answer without the tool.",
    },
  ],
  max_tokens: 2048,
  tools: STATS_TOOL,
  tool_choice: "auto",
  reasoning_budget: 1024,
  ...thinkingKwargs(true),
});
cases.push(toolOn);

// 9. Full loop: thinking ON, tool result, Slack follow-up voice
if (toolOn.raw_message?.tool_calls?.[0]) {
  const follow = await chat("9_thinking_on_tool_then_slack_answer", {
    messages: [
      {
        role: "system",
        content:
          "You are on-call in Slack. One sentence. Answer only the new question. Slack mrkdwn *bold*. Do not mention tool names.",
      },
      { role: "user", content: "is it regional?" },
      {
        role: "assistant",
        content: toolOn.raw_message.content ?? "",
        tool_calls: toolOn.raw_message.tool_calls,
      },
      {
        role: "tool",
        tool_call_id: toolOn.raw_message.tool_calls[0].id,
        name: "get_service_stats",
        content: FAKE_STATS,
      },
    ],
    max_tokens: 2048,
    tools: STATS_TOOL,
    tool_choice: "auto",
    reasoning_budget: 1024,
    ...thinkingKwargs(true),
  });
  cases.push(follow);
} else {
  cases.push({ label: "9_thinking_on_tool_then_slack_answer", skipped: true, reason: "no tool_calls in case 8" });
}

// 10. Thinking OFF, same Slack follow-up after a synthetic tool turn
const offTool = await chat("10a_thinking_off_tool_for_followup", {
  messages: [{ role: "user", content: "Call get_service_stats for tenant_id eventio." }],
  max_tokens: 512,
  tools: STATS_TOOL,
  tool_choice: "auto",
  ...thinkingKwargs(false),
});
cases.push(offTool);

if (offTool.raw_message?.tool_calls?.[0]) {
  cases.push(
    await chat("10b_thinking_off_tool_then_slack_answer", {
      messages: [
        {
          role: "system",
          content:
            "You are on-call in Slack. One sentence. Answer only the new question. Slack mrkdwn *bold*. Do not mention tool names.",
        },
        { role: "user", content: "is it regional?" },
        {
          role: "assistant",
          content: offTool.raw_message.content ?? "",
          tool_calls: offTool.raw_message.tool_calls,
        },
        {
          role: "tool",
          tool_call_id: offTool.raw_message.tool_calls[0].id,
          name: "get_service_stats",
          content: FAKE_STATS,
        },
      ],
      max_tokens: 400,
      tools: STATS_TOOL,
      tool_choice: "auto",
      ...thinkingKwargs(false),
    })
  );
}

// 11. Should NOT call tools
cases.push(
  await chat("11_thinking_on_no_tool_needed", {
    messages: [
      { role: "system", content: "You are Calyx. Use tools only when you need production data." },
      { role: "user", content: "What is 2+2? Reply with just the number." },
    ],
    max_tokens: 1024,
    tools: STATS_TOOL,
    tool_choice: "auto",
    ...thinkingKwargs(true),
  })
);

// 12. force_nonempty_content + thinking (NVIDIA coding-agent note)
cases.push(
  await chat("12_thinking_on_force_nonempty", {
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    max_tokens: 1024,
    ...thinkingKwargs(true, { force_nonempty_content: true }),
  })
);

for (const c of cases) {
  const { raw_message, ...rest } = c;
  console.log(JSON.stringify(rest));
}
