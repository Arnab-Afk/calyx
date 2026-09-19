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
import { recordAuditEvent } from "../storage/audit.js";
import {
  consumeAnonymousMcpRateLimit,
  consumeMcpRateLimit,
  consumeOAuthRateLimit,
} from "./rate-limit.js";
import {
  authenticateOAuthToken,
  protectedResourceMetadata,
} from "./oauth.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpProtocolServer;
  credentialId: string;
}

const sessions = new Map<string, Session>();
const maxBodyBytes = 1024 * 1024;

function sessionMode(): "stateless" | "stateful" {
  return process.env.MCP_SESSION_MODE === "stateful" ? "stateful" : "stateless";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function requestAuditContext(req: IncomingMessage) {
  return {
    ipAddress: req.socket.remoteAddress,
    userAgent: Array.isArray(req.headers["user-agent"])
      ? req.headers["user-agent"][0]
      : req.headers["user-agent"],
  };
}

async function auditSafely(event: Parameters<typeof recordAuditEvent>[0]): Promise<void> {
  try {
    await recordAuditEvent(event);
  } catch (error) {
    console.error("Failed to record audit event", error);
  }
}

function resourceUrl(req: IncomingMessage): URL {
  if (process.env.MCP_PUBLIC_URL) return new URL(process.env.MCP_PUBLIC_URL);
  return new URL("/mcp", `http://${req.headers.host ?? "localhost"}`);
}

function metadataUrl(req: IncomingMessage): string {
  const resource = resourceUrl(req);
  return new URL(`/.well-known/oauth-protected-resource${resource.pathname}`, resource.origin).toString();
}

function unauthorized(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(401, {
    "content-type": "application/json",
    "www-authenticate": `Bearer realm="calyx-mcp", resource_metadata="${metadataUrl(req)}"`,
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
  const principal = (await authenticateApiKey(token)) ?? (await authenticateOAuthToken(token));
  return principal ? { token, principal } : null;
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authentication = await authenticate(req);
  if (!authentication) {
    const anonymousLimit = await consumeAnonymousMcpRateLimit(
      req.socket.remoteAddress ?? "unknown"
    );
    res.setHeader("x-ratelimit-limit", anonymousLimit.limit);
    res.setHeader("x-ratelimit-remaining", anonymousLimit.remaining);
    res.setHeader("x-ratelimit-reset", anonymousLimit.resetAt);
    if (!anonymousLimit.allowed) {
      res.setHeader(
        "retry-after",
        Math.max(1, Math.ceil((Date.parse(anonymousLimit.resetAt) - Date.now()) / 1000))
      );
      return sendJson(res, 429, { error: "Authentication rate limit exceeded" });
    }
    await auditSafely({
      actorType: "mcp_credential",
      action: "mcp.authentication",
      success: false,
      metadata: { reason: "invalid_or_missing_token" },
      ...requestAuditContext(req),
    });
    return unauthorized(req, res);
  }

  const rateLimit = authentication.principal.credentialId.startsWith("oauth:")
    ? await consumeOAuthRateLimit(authentication.principal.credentialId)
    : await consumeMcpRateLimit(authentication.principal.credentialId);
  res.setHeader("x-ratelimit-limit", rateLimit.limit);
  res.setHeader("x-ratelimit-remaining", rateLimit.remaining);
  res.setHeader("x-ratelimit-reset", rateLimit.resetAt);
  if (!rateLimit.allowed) {
    res.setHeader("retry-after", Math.max(1, Math.ceil((Date.parse(rateLimit.resetAt) - Date.now()) / 1000)));
    await auditSafely({
      tenantId: authentication.principal.tenantId,
      actorType: "mcp_credential",
      actorId: authentication.principal.credentialId,
      action: "mcp.rate_limited",
      success: false,
      ...requestAuditContext(req),
    });
    return sendJson(res, 429, { error: "MCP request rate limit exceeded" });
  }

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

  if (sessionMode() === "stateless") {
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST", "content-type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Stateless MCP accepts POST requests only" },
        id: null,
      }));
      return;
    }
    const server = createMcpServer(authentication.principal);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await transport.close();
      await server.close();
    };
    res.once("close", () => void close());
    await server.connect(transport);
    (req as IncomingMessage & { auth?: AuthInfo }).auth = authInfo(
      authentication.token,
      authentication.principal
    );
    await transport.handleRequest(req as IncomingMessage & { auth?: AuthInfo }, res, body);
    await auditSafely({
      tenantId: authentication.principal.tenantId,
      actorType: "mcp_credential",
      actorId: authentication.principal.credentialId,
      action: "mcp.request",
      resourceType: "mcp_transport",
      resourceId: "stateless",
      success: res.statusCode < 400,
      metadata: { method: req.method, sessionMode: "stateless" },
      ...requestAuditContext(req),
    });
    return;
  }

  let session = sessionId ? sessions.get(sessionId) : undefined;
  if (session) {
    if (session.credentialId !== authentication.principal.credentialId) {
      await auditSafely({
        tenantId: authentication.principal.tenantId,
        actorType: "mcp_credential",
        actorId: authentication.principal.credentialId,
        action: "mcp.session_access",
        resourceType: "mcp_session",
        resourceId: sessionId,
        success: false,
        ...requestAuditContext(req),
      });
      return unauthorized(req, res);
    }
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
  await auditSafely({
    tenantId: authentication.principal.tenantId,
    actorType: "mcp_credential",
    actorId: authentication.principal.credentialId,
    action: "mcp.request",
    resourceType: "mcp_session",
    resourceId: sessionId ?? session.transport.sessionId,
    success: res.statusCode < 400,
    metadata: { method: req.method },
    ...requestAuditContext(req),
  });
}

export function createMcpHttpServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname === "/health") {
        return sendJson(res, 200, {
          status: "ok",
          sessionMode: sessionMode(),
          sessions: sessionMode() === "stateful" ? sessions.size : 0,
        });
      }
      if (url.pathname === new URL(metadataUrl(req)).pathname) {
        return sendJson(res, 200, protectedResourceMetadata(resourceUrl(req)));
      }
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
  console.log(
    `Calyx MCP Streamable HTTP server listening on http://${host}:${port}/mcp (${sessionMode()})`
  );

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
