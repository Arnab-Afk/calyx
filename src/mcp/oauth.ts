import { MCP_SCOPES, type McpPrincipal, type McpScope } from "./auth.js";

interface IntrospectionResponse {
  active?: boolean;
  sub?: string;
  tenant_id?: string;
  scope?: string | string[];
  exp?: number;
  client_id?: string;
  username?: string;
  aud?: string | string[];
}

export function oauthConfigured(): boolean {
  return Boolean(
    process.env.MCP_OAUTH_ISSUER &&
      process.env.MCP_OAUTH_INTROSPECTION_URL &&
      process.env.MCP_OAUTH_CLIENT_ID &&
      process.env.MCP_OAUTH_CLIENT_SECRET
  );
}

export function oauthIssuer(): string | null {
  return process.env.MCP_OAUTH_ISSUER?.replace(/\/$/, "") ?? null;
}

export async function authenticateOAuthToken(token: string): Promise<McpPrincipal | null> {
  if (!oauthConfigured()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(process.env.MCP_OAUTH_INTROSPECTION_URL!, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${process.env.MCP_OAUTH_CLIENT_ID}:${process.env.MCP_OAUTH_CLIENT_SECRET}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token, token_type_hint: "access_token" }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const claims = (await response.json()) as IntrospectionResponse;
    if (!claims.active || !claims.sub || !claims.tenant_id) return null;
    const expectedAudience = process.env.MCP_PUBLIC_URL;
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!expectedAudience || !audiences.includes(expectedAudience)) return null;
    if (claims.exp !== undefined && claims.exp <= Math.floor(Date.now() / 1000)) return null;
    const rawScopes = Array.isArray(claims.scope)
      ? claims.scope
      : (claims.scope ?? "").split(/\s+/).filter(Boolean);
    const scopes = rawScopes.filter((scope): scope is McpScope =>
      (MCP_SCOPES as readonly string[]).includes(scope)
    );
    if (scopes.length === 0) return null;
    const issuer = oauthIssuer()!;
    return {
      credentialId: `oauth:${issuer}:${claims.sub}`,
      tenantId: claims.tenant_id,
      name: claims.username ?? claims.client_id ?? claims.sub,
      scopes,
      ...(claims.exp !== undefined && { expiresAt: claims.exp }),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function protectedResourceMetadata(resourceUrl: URL) {
  const issuer = oauthIssuer();
  return {
    resource: resourceUrl.toString(),
    ...(issuer && { authorization_servers: [issuer] }),
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
  };
}
