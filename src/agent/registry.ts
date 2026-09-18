import type { Tool, ToolInput } from "../schemas/index.js";

// Central tool registry. Every transport (Slack, CLI, MCP) calls these
// same handlers — no logic lives in the transport adapters.
const registry = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  if (registry.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }
  registry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name);
}

export function getAllTools(): Tool[] {
  return [...registry.values()];
}

export async function executeTool(
  name: string,
  input: ToolInput
): Promise<{ ok: true; output: Awaited<ReturnType<Tool["handler"]>> } | { ok: false; error: string }> {
  const tool = registry.get(name);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }

  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input for ${name}: ${parsed.error.message}`,
    };
  }

  try {
    const output = await tool.handler(parsed.data);
    return { ok: true, output };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
