import { getAuthUserId } from '@convex-dev/auth/server';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { type QueryCtx, mutation, query } from './_generated/server';

const populateThread = async (ctx: QueryCtx, messageId: Id<'messages'>) => {
  const messages = await ctx.db
    .query('messages')
    .withIndex('by_parent_message_id', (q) => q.eq('parentMessageId', messageId))
    .collect();

  if (messages.length === 0) {
    return {
      count: 0,
      image: undefined,
      timestamp: 0,
      name: '',
    };
  }

  const lastMessage = messages[messages.length - 1];
  const lastMessageMember = await populateMember(ctx, lastMessage.memberId);

  if (!lastMessageMember) {
    return {
      count: 0,
      image: undefined,
      timestamp: 0,
      name: '',
    };
  }

  const lastMessageUser = await populateUser(ctx, lastMessageMember.userId);

  return {
    count: messages.length,
    image: lastMessageUser?.image,
    timestamp: lastMessage._creationTime,
    name: lastMessageUser?.name,
  };
};

const populateReactions = (ctx: QueryCtx, messageId: Id<'messages'>) => {
  return ctx.db
    .query('reactions')
    .withIndex('by_message_id', (q) => q.eq('messageId', messageId))
    .collect();
};

const populateUser = (ctx: QueryCtx, userId: Id<'users'>) => {
  return ctx.db.get(userId);
};

const populateMember = (ctx: QueryCtx, memberId: Id<'members'>) => {
  return ctx.db.get(memberId);
};

const getMember = async (ctx: QueryCtx, workspaceId: Id<'workspaces'>, userId: Id<'users'>) => {
  return await ctx.db
    .query('members')
    .withIndex('by_workspace_id_user_id', (q) => q.eq('workspaceId', workspaceId).eq('userId', userId))
    .unique();
};

export const get = query({
  args: {
    channelId: v.optional(v.id('channels')),
    conversationId: v.optional(v.id('conversations')),
    parentMessageId: v.optional(v.id('messages')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) throw new Error('Unauthorized.');

    let _conversationId = args.conversationId;

    // replying in a thread in 1-1 conversation
    if (!args.conversationId && !args.channelId && args.parentMessageId) {
      const parentMessage = await ctx.db.get(args.parentMessageId);

      if (!parentMessage) throw new Error('Parent message not found.');

      _conversationId = parentMessage.conversationId;
    }

    const results = await ctx.db
      .query('messages')
      .withIndex('by_channel_id_parent_message_id_conversation_id', (q) =>
        q.eq('channelId', args.channelId).eq('parentMessageId', args.parentMessageId).eq('conversationId', _conversationId),
      )
      .order('desc')
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: (
        await Promise.all(
          results.page.map(async (message) => {
            const member = await populateMember(ctx, message.memberId);
            const user = member ? await populateUser(ctx, member?.userId) : null;

            if (!member || !user) return null;

            const reactions = await populateReactions(ctx, message._id);
            const thread = await populateThread(ctx, message._id);
            const image = message.image ? await ctx.storage.getUrl(message.image) : undefined;

            const reactionsWithCounts = reactions.map((reaction) => ({
              ...reaction,
              count: reactions.filter((r) => r.value === reaction.value).length,
            }));

            const dedupedReactions = reactionsWithCounts.reduce(
              (acc, reaction) => {
                const existingReaction = acc.find((r) => r.value === reaction.value);

                if (existingReaction) {
                  existingReaction.memberIds = Array.from(new Set([...existingReaction.memberIds, reaction.memberId]));
                } else {
                  acc.push({ ...reaction, memberIds: [reaction.memberId] });
                }

                return acc;
              },
              [] as (Doc<'reactions'> & {
                count: number;
                memberIds: Id<'members'>[];
              })[],
            );

            const reactionsWithoutMemberIdProperty = dedupedReactions.map(({ memberId, ...rest }) => rest);

            return {
              ...message,
              image,
              member,
              user,
              reactions: reactionsWithoutMemberIdProperty,
              threadCount: thread.count,
              threadImage: thread.image,
              threadName: thread.name,
              threadTimestamp: thread.timestamp,
            };
          }),
        )
      ).filter((message): message is NonNullable<typeof message> => message !== null),
    };
  },
});

export const getById = query({
  args: {
    id: v.id('messages'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) return null;

    const message = await ctx.db.get(args.id);

    if (!message) return null;

    const currentMember = await getMember(ctx, message.workspaceId, userId);

    if (!currentMember) return null;

    const member = await populateMember(ctx, message.memberId);

    if (!member) return null;

    const user = await populateUser(ctx, member.userId);

    if (!user) return null;

    const reactions = await populateReactions(ctx, message._id);

    const reactionsWithCounts = reactions.map((reaction) => ({
      ...reaction,
      count: reactions.filter((r) => r.value === reaction.value).length,
    }));

    const dedupedReactions = reactionsWithCounts.reduce(
      (acc, reaction) => {
        const existingReaction = acc.find((r) => r.value === reaction.value);

        if (existingReaction) {
          existingReaction.memberIds = Array.from(new Set([...existingReaction.memberIds, reaction.memberId]));
        } else {
          acc.push({ ...reaction, memberIds: [reaction.memberId] });
        }

        return acc;
      },
      [] as (Doc<'reactions'> & {
        count: number;
        memberIds: Id<'members'>[];
      })[],
    );

    const reactionsWithoutMemberIdProperty = dedupedReactions.map(({ memberId, ...rest }) => rest);

    return {
      ...message,
      image: message.image ? await ctx.storage.getUrl(message.image) : undefined,
      user,
      member,
      reactions: reactionsWithoutMemberIdProperty,
    };
  },
});

export const create = mutation({
  args: {
    body: v.string(),
    image: v.optional(v.id('_storage')),
    workspaceId: v.id('workspaces'),
    channelId: v.optional(v.id('channels')),
    conversationId: v.optional(v.id('conversations')),
    parentMessageId: v.optional(v.id('messages')),
    calyxData: v.optional(
      v.object({
        query: v.string(),
        answer: v.string(),
        chartType: v.optional(v.string()),
        chartData: v.optional(v.string()),
        toolNames: v.array(v.string()),
        tenantId: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) throw new Error('Unauthorized.');

    const member = await getMember(ctx, args.workspaceId, userId);

    if (!member) throw new Error('Unauthorized.');

    let _conversationId = args.conversationId;

    // replying in a thread in 1-1 conversation
    if (!args.conversationId && !args.channelId && args.parentMessageId) {
      const parentMessage = await ctx.db.get(args.parentMessageId);

      if (!parentMessage) throw new Error('Parent message not found.');

      _conversationId = parentMessage.conversationId;
    }

    const messageId = await ctx.db.insert('messages', {
      memberId: member._id,
      body: args.body,
      image: args.image,
      channelId: args.channelId,
      workspaceId: args.workspaceId,
      conversationId: _conversationId,
      parentMessageId: args.parentMessageId,
      calyxData: args.calyxData,
    });

    return messageId;
  },
});

export const update = mutation({
  args: {
    id: v.id('messages'),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) throw new Error('Unauthorized.');

    const message = await ctx.db.get(args.id);

    if (!message) throw new Error('Message not found.');

    const member = await getMember(ctx, message.workspaceId, userId);

    if (!member || member._id !== message.memberId) throw new Error('Unauthorized.');

    await ctx.db.patch(args.id, {
      body: args.body,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id('messages'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) throw new Error('Unauthorized.');

    const message = await ctx.db.get(args.id);

    if (!message) throw new Error('Message not found.');

    const member = await getMember(ctx, message.workspaceId, userId);

    if (!member || member._id !== message.memberId) throw new Error('Unauthorized.');

    await ctx.db.delete(args.id);

    return args.id;
  },
});

/** Dev helper: post one sample Calyx reply per chart type (+ dynamics demos). */
export const seedCalyxDemoReply = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    channelId: v.id('channels'),
    memberId: v.optional(v.id('members')),
  },
  handler: async (ctx, args) => {
    let memberId = args.memberId;
    if (!memberId) {
      const member = await ctx.db
        .query('members')
        .withIndex('by_workspace_id', (q) => q.eq('workspaceId', args.workspaceId))
        .first();
      if (!member) throw new Error('No members in workspace — sign in once first.');
      memberId = member._id;
    }

    const quillBody = (text: string) => JSON.stringify({ ops: [{ insert: `${text}\n` }] });

    const post = async (
      answer: string,
      chartType: string,
      chartData: unknown,
      tools: string[],
      query?: string,
    ) => {
      return await ctx.db.insert('messages', {
        memberId: memberId!,
        body: quillBody(`[Calyx] ${answer.slice(0, 160)}`),
        channelId: args.channelId,
        workspaceId: args.workspaceId,
        calyxData: {
          query: query ?? answer.slice(0, 80),
          answer,
          chartType,
          chartData: JSON.stringify(chartData),
          toolNames: tools,
          tenantId: 'default',
        },
      });
    };

    const ids: Id<'messages'>[] = [];

    ids.push(
      await ctx.db.insert('messages', {
        memberId,
        body: quillBody('— Calyx chart gallery seed — scroll for every panel type —'),
        channelId: args.channelId,
        workspaceId: args.workspaceId,
      }),
    );

    // Deploy correlation
    ids.push(
      await post(
        [
          'Error rate jumped right after deploy `checkout@a3f91c`.',
          '',
          '**Impact:** checkout 5xx elevated. **Root cause:** likely bad release. **Action:** rollback candidate.',
          '',
          'Click two points on the chart to brush a re-query window.',
        ].join('\n'),
        'deploy-correlation',
        {
          series: [
            {
              label: 'error %',
              points: [
                { time: '9:00', value: 0.4 },
                { time: '9:05', value: 0.5 },
                { time: '9:10', value: 0.6 },
                { time: '9:11', value: 4.2 },
                { time: '9:15', value: 5.1 },
                { time: '9:20', value: 3.8 },
                { time: '9:25', value: 1.2 },
              ],
            },
          ],
          deploys: [{ time: '9:11', label: 'checkout@a3f91c', sha: 'a3f91c' }],
        },
        ['query_logs', 'list_deploys'],
        'did the deploy cause this?',
      ),
    );

    // Blast radius
    ids.push(
      await post(
        'Blast radius from `checkout-api` — payments and search are correlated. Click a node to focus.',
        'blast-radius',
        {
          nodes: [
            { id: 'checkout', label: 'checkout', severity: 0.95, x: 28, y: 45 },
            { id: 'payments', label: 'payments', severity: 0.7, x: 55, y: 28 },
            { id: 'search', label: 'search', severity: 0.45, x: 62, y: 62 },
            { id: 'auth', label: 'auth', severity: 0.15, x: 18, y: 72 },
            { id: 'inventory', label: 'inventory', severity: 0.25, x: 78, y: 48 },
          ],
          edges: [
            { from: 'checkout', to: 'payments', weight: 0.9 },
            { from: 'checkout', to: 'search', weight: 0.6 },
            { from: 'payments', to: 'inventory', weight: 0.4 },
            { from: 'auth', to: 'checkout', weight: 0.2 },
          ],
          cursors: [
            { name: 'Hadley', x: 40, y: 38, color: '#5ec8ff' },
            { name: 'Ryo', x: 58, y: 55, color: '#f5c542' },
          ],
        },
        ['get_service_stats', 'correlate_errors'],
        'blast radius for checkout',
      ),
    );

    // Trace waterfall
    ids.push(
      await post(
        'Trace for a failing checkout request — `payments` span is the slow culprit.',
        'trace-waterfall',
        {
          traceId: 'tr_9f2a1c88',
          totalMs: 4200,
          spans: [
            { service: 'edge', operation: 'POST /checkout', startMs: 0, durationMs: 4200, status: 'error' },
            { service: 'checkout', operation: 'CreateOrder', startMs: 40, durationMs: 4100, status: 'slow' },
            { service: 'payments', operation: 'ChargeCard', startMs: 180, durationMs: 3600, status: 'error' },
            { service: 'postgres', operation: 'INSERT orders', startMs: 120, durationMs: 45, status: 'ok' },
            { service: 'redis', operation: 'GET cart', startMs: 50, durationMs: 8, status: 'ok' },
          ],
        },
        ['trace_request'],
        'trace this checkout failure',
      ),
    );

    // Silent failure heatmap
    ids.push(
      await post(
        'Silent failures: `/checkout/confirm` still gets traffic but conversions died after 10:00.',
        'silent-failure-heatmap',
        {
          endpoints: ['/api/search', '/checkout', '/checkout/confirm', '/pay'],
          hours: ['08', '09', '10', '11', '12', '13'],
          cells: [
            [0.05, 0.08, 0.1, 0.07, 0.06, 0.05],
            [0.1, 0.12, 0.35, 0.4, 0.3, 0.2],
            [0.08, 0.1, 0.85, 0.9, 0.88, 0.8],
            [0.05, 0.06, 0.2, 0.25, 0.15, 0.1],
          ],
        },
        ['detect_silent_failures'],
        'any silent failures?',
      ),
    );

    // SLO burn
    ids.push(
      await post(
        'Checkout availability SLO is burning fast — **38m** to breach if burn holds.',
        'slo-burn',
        {
          sloName: 'checkout availability',
          target: 99.9,
          current: 99.72,
          burnRate1h: 14.2,
          burnRate6h: 3.1,
          minutesToBreach: 38,
        },
        ['get_slo'],
        'SLO burn for checkout',
      ),
    );

    // Log signatures
    ids.push(
      await post(
        'Top exception fingerprints in the last hour — `NullReferenceException` dominates.',
        'log-signatures',
        {
          signatures: [
            {
              fingerprint: 'NullReferenceException',
              count: 842,
              trend: [12, 18, 22, 40, 90, 120, 180],
              sample: 'CheckoutService.Confirm at line 214',
            },
            {
              fingerprint: 'TimeoutException',
              count: 210,
              trend: [30, 28, 35, 40, 38, 42, 45],
              sample: 'payments-worker ChargeCard',
            },
            {
              fingerprint: 'SqlException: deadlock',
              count: 64,
              trend: [2, 4, 3, 8, 12, 10, 14],
              sample: 'orders INSERT contention',
            },
          ],
        },
        ['query_logs'],
        'top error signatures',
      ),
    );

    // Cost runaway
    ids.push(
      await post(
        'Egress spend diverged from baseline after the log fan-out change — **+42%** projected overrun.',
        'cost-runaway',
        {
          unit: '$',
          projectedOverrunPct: 42,
          points: [
            { time: 'Mon', spend: 120, baseline: 118 },
            { time: 'Tue', spend: 125, baseline: 120 },
            { time: 'Wed', spend: 180, baseline: 122 },
            { time: 'Thu', spend: 210, baseline: 124 },
            { time: 'Fri', spend: 240, baseline: 126 },
          ],
        },
        ['query_cost'],
        'cost runaway this week?',
      ),
    );

    // Incident timeline
    ids.push(
      await post(
        'Incident `#inc-914` timeline — still **open**. Pin this while the swarm works.',
        'incident-timeline',
        {
          incidentId: '#inc-914',
          status: 'open',
          events: [
            { at: '9:11', actor: 'system', label: 'Detector fired', detail: 'error spike checkout-api' },
            { at: '9:12', actor: 'calyx', label: 'Alert card posted', detail: 'severity high' },
            { at: '9:14', actor: 'human', label: 'Hadley joined thread' },
            { at: '9:16', actor: 'calyx', label: 'Root cause hypothesis', detail: 'deploy a3f91c correlation' },
            { at: '9:18', actor: 'human', label: 'Rollback requested' },
          ],
        },
        ['search_past_incidents'],
        'show incident timeline',
      ),
    );

    // Approval / dry-run
    ids.push(
      await post(
        'I can roll back `checkout` to the previous replica set. Dry-run first — then you approve.',
        'approval-card',
        {
          action: 'deploy.rollback',
          target: 'checkout@a3f91c → checkout@9be210',
          risk: 'high',
          reversible: true,
          blastEstimate: '~2m partial unavailability on checkout',
          dryRunSummary: [
            'scale checkout-canary to 0',
            'route 100% traffic to checkout@9be210',
            'verify error rate < 1% for 3m',
            'emit audit event rollback.requested',
          ],
        },
        ['propose_action'],
        'rollback checkout deploy',
      ),
    );

    // Compare window
    ids.push(
      await post(
        "Compare **this deploy** vs **last Tuesday** — today's p99 is clearly worse after 9:11.",
        'compare-window',
        {
          labelA: 'This deploy',
          labelB: 'Last Tue',
          pointsA: [
            { time: '9:00', value: 0.4 },
            { time: '9:05', value: 0.5 },
            { time: '9:11', value: 4.8 },
            { time: '9:15', value: 3.2 },
            { time: '9:20', value: 2.1 },
          ],
          pointsB: [
            { time: '9:00', value: 0.35 },
            { time: '9:05', value: 0.4 },
            { time: '9:11', value: 0.45 },
            { time: '9:15', value: 0.5 },
            { time: '9:20', value: 0.42 },
          ],
        },
        ['query_metrics'],
        'compare to last tuesday',
      ),
    );

    // Memory recall
    ids.push(
      await post(
        'Looks a lot like **#inc-482** from last month — same NullRef + deploy correlation pattern.',
        'memory-recall',
        {
          incidentId: '#inc-482',
          title: 'Checkout NullRef after payments deploy',
          when: '18 Aug',
          similarity: 0.87,
          summary: 'Resolved by rolling back payments-worker; root cause was missing null check on cart total.',
        },
        ['search_past_incidents'],
        'have we seen this before?',
      ),
    );

    // Keep a couple classic types too
    ids.push(
      await post(
        'Service health strips for the watched set.',
        'text-status-bars',
        [
          { service: 'Payment App', errorRate: 8.2, total: 12040, errorCount: 987 },
          { service: 'E-Commerce API', errorRate: 3.1, total: 8840, errorCount: 274 },
        ],
        ['get_service_stats'],
      ),
    );

    ids.push(
      await post(
        '`NullReferenceException` in `CheckoutService` — spike at **9:11**.',
        'error-timeseries',
        [
          {
            label: 'errors',
            points: [
              { time: '9:03', value: 0.8 },
              { time: '9:07', value: 1.1 },
              { time: '9:11', value: 5.0 },
              { time: '9:15', value: 2.4 },
              { time: '9:19', value: 0.9 },
            ],
          },
        ],
        ['query_logs'],
      ),
    );

    ids.push(
      await post(
        'Opened **Polish landing hero and dashboard UI** — compact PR unfurl with diffstat.',
        'pr-unfurl',
        {
          title: 'Polish landing hero and dashboard UI',
          summary:
            'Summary UI polish for the landing page and app surfaces (open-ended “make ui changes” request). Landing Brand-first hero: ZkMultiCloud is the primary identity.',
          additions: 173,
          deletions: 61,
          comments: 1,
          url: 'https://github.com/Arnab-Afk/calyx',
          number: 1,
        },
        ['github'],
        'what’s in that PR?',
      ),
    );

    ids.push(
      await post(
        'Checkout error-budget recovery is **on track** — 66%, up 30% vs last period.',
        'progress-indicator',
        {
          title: 'Progress Indicator',
          insight: 'You are on track to finish the goal three days early',
          percent: 66,
          delta: 30,
          comparison: 'vs. the last period',
        },
        ['get_slo'],
        'are we on track for the checkout SLO?',
      ),
    );

    return { count: ids.length, ids };
  },
});
