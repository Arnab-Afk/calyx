import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Server as McpProtocolServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { authenticateApiKey, bearerToken, type McpPrincipal } from "./auth.js";
import { createMcpServer } from "./server.js";
import { closePool } from "../storage/client.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpProtocolServer;
  credentialId: string;
}

const sessions = new Map<string, Session>();
const maxBodyBytes = 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function unauthorized(res: ServerResponse): void {
  res.writeHead(401, {
    "content-type": "application/json",
    "www-authenticate": 'Bearer realm="calyx-mcp"',
  });
  res.end(JSON.stringify({ error: "A valid Calyx API key is required" }));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("Request body exceeds 1 MiB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authInfo(token: string, principal: McpPrincipal): AuthInfo {
  return {
    token,
    clientId: principal.credentialId,
    scopes: principal.scopes,
    ...(principal.expiresAt && { expiresAt: principal.expiresAt }),
    extra: { tenantId: principal.tenantId, credentialName: principal.name },
  };
}

async function authenticate(req: IncomingMessage): Promise<{ token: string; principal: McpPrincipal } | null> {
  const header = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const token = bearerToken(header);
  if (!token) return null;
  const principal = await authenticateApiKey(token);
  return principal ? { token, principal } : null;
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authentication = await authenticate(req);
  if (!authentication) return unauthorized(res);

  const sessionHeader = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  let body: unknown;
  if (req.method === "POST") {
    try {
      body = await readJson(req);
    } catch (error) {
      return sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON body" });
    }
  }

  let session = sessionId ? sessions.get(sessionId) : undefined;
  if (session) {
    if (session.credentialId !== authentication.principal.credentialId) return unauthorized(res);
  } else if (req.method === "POST" && !sessionId && isInitializeRequest(body)) {
    const server = createMcpServer(authentication.principal);
    let transport!: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      keepAliveMs: 15_000,
      onsessioninitialized: (newSessionId) => {
        sessions.set(newSessionId, {
          transport,
          server,
          credentialId: authentication.principal.credentialId,
        });
      },
      onsessionclosed: async (closedSessionId) => {
        const closed = sessions.get(closedSessionId);
        sessions.delete(closedSessionId);
        await closed?.server.close();
      },
    });
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) sessions.delete(id);
    };
    await server.connect(transport);
    session = { transport, server, credentialId: authentication.principal.credentialId };
  } else {
    return sendJson(res, sessionId ? 404 : 400, {
      jsonrpc: "2.0",
      error: { code: -32000, message: sessionId ? "Unknown MCP session" : "Initialize the MCP session first" },
      id: null,
    });
  }

  (req as IncomingMessage & { auth?: AuthInfo }).auth = authInfo(authentication.token, authentication.principal);
  await session.transport.handleRequest(req as IncomingMessage & { auth?: AuthInfo }, res, body);
}

export function createMcpHttpServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname === "/health") return sendJson(res, 200, { status: "ok", sessions: sessions.size });
      if (url.pathname !== "/mcp") return sendJson(res, 404, { error: "Not found" });
      if (!req.method || !["GET", "POST", "DELETE"].includes(req.method)) {
        res.writeHead(405, { allow: "GET, POST, DELETE" });
        return res.end();
      }
      await handleMcp(req, res);
    } catch (error) {
      console.error("MCP HTTP request failed", error);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
      else res.end();
    }
  });
}

export async function startMcpHttpServer(): Promise<void> {
  const port = Number.parseInt(process.env.MCP_PORT ?? "3002", 10);
  const host = process.env.MCP_HOST ?? "0.0.0.0";
  const httpServer = createMcpHttpServer();

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, resolve);
  });
  console.log(`Calyx MCP Streamable HTTP server listening on http://${host}:${port}/mcp`);

  const shutdown = async () => {
    for (const session of sessions.values()) await session.transport.close();
    sessions.clear();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closePool();
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

const isEntryPoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntryPoint) {
  startMcpHttpServer().catch((error) => {
    console.error("Failed to start Calyx MCP HTTP server", error);
    process.exit(1);
  });
}
