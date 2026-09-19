import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';

interface CredentialSummary {
  credentialId: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface CreatedCredential {
  credentialId: string;
  tenantId: string;
  name: string;
  scopes: string[];
  token: string;
  createdAt: string;
  expiresAt?: number;
}

const credentialValidator = v.object({
  credentialId: v.string(),
  name: v.string(),
  scopes: v.array(v.string()),
  createdAt: v.string(),
  lastUsedAt: v.union(v.string(), v.null()),
  expiresAt: v.union(v.string(), v.null()),
  revokedAt: v.union(v.string(), v.null()),
});

export const requireWorkspaceAdmin = internalQuery({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ workspaceId: v.string() }),
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Unauthorized.');

    const member = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (query) => query.eq('workspaceId', workspaceId).eq('userId', userId))
      .unique();
    if (!member || member.role !== 'admin') throw new Error('Workspace admin access required.');

    return { workspaceId };
  },
});

async function callCalyx<T>(path: string, body: object): Promise<T> {
  const baseUrl = process.env.CALYX_API_URL;
  const internalKey = process.env.CALYX_INTERNAL_API_KEY;
  if (!baseUrl || !internalKey) throw new Error('Calyx connector management is not configured.');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-calyx-internal-key': internalKey,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown } & T;
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Calyx API returned ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export const list = action({
  args: { workspaceId: v.id('workspaces') },
  returns: v.array(credentialValidator),
  handler: async (ctx, { workspaceId }): Promise<CredentialSummary[]> => {
    const authorization: { workspaceId: string } = await ctx.runQuery(internal.mcpCredentials.requireWorkspaceAdmin, {
      workspaceId,
    });
    const result: { credentials: CredentialSummary[] } = await callCalyx('/v1/mcp/credentials/list', {
      workspaceId: authorization.workspaceId,
    });
    return result.credentials;
  },
});

export const create = action({
  args: {
    workspaceId: v.id('workspaces'),
    name: v.string(),
    expiresInDays: v.optional(v.number()),
  },
  returns: v.object({
    credentialId: v.string(),
    tenantId: v.string(),
    name: v.string(),
    scopes: v.array(v.string()),
    token: v.string(),
    createdAt: v.string(),
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<CreatedCredential> => {
    const authorization: { workspaceId: string } = await ctx.runQuery(internal.mcpCredentials.requireWorkspaceAdmin, {
      workspaceId: args.workspaceId,
    });
    if (args.name.trim().length < 1 || args.name.trim().length > 80) throw new Error('Invalid credential name.');
    if (args.expiresInDays !== undefined && (!Number.isInteger(args.expiresInDays) || args.expiresInDays < 1 || args.expiresInDays > 365)) {
      throw new Error('Expiry must be between 1 and 365 days.');
    }

    const result: { credential: CreatedCredential } = await callCalyx('/v1/mcp/credentials/create', {
      workspaceId: authorization.workspaceId,
      name: args.name.trim(),
      scopes: ['logs:read', 'incidents:read', 'incidents:ask'],
      ...(args.expiresInDays && { expiresInDays: args.expiresInDays }),
    });
    return result.credential;
  },
});

export const revoke = action({
  args: { workspaceId: v.id('workspaces'), credentialId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const authorization: { workspaceId: string } = await ctx.runQuery(internal.mcpCredentials.requireWorkspaceAdmin, {
      workspaceId: args.workspaceId,
    });
    await callCalyx<{ revoked: true }>('/v1/mcp/credentials/revoke', {
      workspaceId: authorization.workspaceId,
      credentialId: args.credentialId,
    });
    return true;
  },
});
