import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Resolve install assets whether running from src/ or dist/. */
function installDir(): string {
  const candidates = [
    path.resolve(HERE, "../../../../scripts/install"), // dist/ingestion/routes/v1
    path.resolve(HERE, "../../../scripts/install"), // src/ingestion/routes/v1
    path.resolve(process.cwd(), "scripts/install"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "install.sh"))) return dir;
  }
  return candidates[candidates.length - 1]!;
}

function readAsset(name: string): string | null {
  const file = path.join(installDir(), name);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export async function installRoute(app: FastifyInstance): Promise<void> {
  const sendScript = async (
    reply: { header: (k: string, v: string) => unknown; status: (n: number) => { send: (b: string) => unknown }; send: (b: string) => unknown },
    name: string,
    contentType: string
  ) => {
    const body = readAsset(name);
    if (!body) {
      return reply.status(404).send(`# missing ${name}\n`);
    }
    reply.header("Content-Type", contentType);
    reply.header("Cache-Control", "no-cache");
    return reply.send(body);
  };

  // curl -fsSL https://calyx-intake.arnabbhowmik.in/install | bash
  app.get("/install", async (_request, reply) => {
    return sendScript(reply, "install.sh", "text/x-shellscript; charset=utf-8");
  });
  app.get("/install.sh", async (_request, reply) => {
    return sendScript(reply, "install.sh", "text/x-shellscript; charset=utf-8");
  });
  app.get("/install/calyx-agent.mjs", async (_request, reply) => {
    return sendScript(reply, "calyx-agent.mjs", "text/javascript; charset=utf-8");
  });
}
