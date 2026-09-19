import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation } from './_generated/server';

type Sample = {
  chartType: string;
  answer: string;
  query: string;
  tools: string[];
  chartData: unknown;
};

const SAMPLES: Sample[] = [
  {
    chartType: 'action-card',
    query: 'restart the worker',
    answer: 'I can restart the background worker. Dry-run shows the steps — approve when ready.',
    tools: ['propose_action'],
    chartData: {
      title: 'Restart worker',
      why: 'Queue depth rising; process looks wedged.',
      risk: 'medium',
      reversible: true,
      steps: ['drain in-flight jobs', 'SIGTERM worker', 'bring up replacement', 'verify heartbeat'],
    },
  },
  {
    chartType: 'data-table',
    query: 'top slow endpoints',
    answer: 'Here are the slowest endpoints in the last hour.',
    tools: ['query_metrics'],
    chartData: {
      caption: 'p95 latency · last 1h',
      columns: ['Path', 'p95 ms', 'Requests'],
      rows: [
        ['/api/search', 820, 12040],
        ['/checkout', 640, 3201],
        ['/api/feed', 410, 8800],
      ],
    },
  },
  {
    chartType: 'metric-chips',
    query: 'quick health',
    answer: 'Snapshot of the basics right now.',
    tools: ['get_service_stats'],
    chartData: {
      chips: [
        { label: 'Uptime', value: '99.95%', tone: 'ok', source: 'probe' },
        { label: 'Error rate', value: '0.8%', tone: 'warn', source: 'logs' },
        { label: 'p95', value: '420ms', tone: 'info', source: 'APM' },
        { label: 'Deploys', value: '2 today', tone: 'neutral', source: 'GitHub' },
      ],
    },
  },
  {
    chartType: 'diff-card',
    query: 'what changed in the flag?',
    answer: 'Flag `checkout_v2` flipped 12 minutes ago.',
    tools: ['get_flags'],
    chartData: {
      title: 'Feature flag change',
      path: 'checkout_v2',
      before: 'enabled: false\nrollout: 0%',
      after: 'enabled: true\nrollout: 25%',
    },
  },
  {
    chartType: 'uptime-pulse',
    query: 'is the site up?',
    answer: 'Yes — `app.example.com` is up. 24h strip below.',
    tools: ['uptime_probe'],
    chartData: {
      url: 'app.example.com',
      up: true,
      latencyMs: 148,
      uptimePct: 99.86,
      strip: Array.from({ length: 48 }, (_, i) => (i === 30 ? 'degraded' : i === 31 ? 'down' : 'up')),
    },
  },
  {
    chartType: 'error-digest',
    query: 'what errors today?',
    answer: 'Plain-language digest of the top errors (no stack spam).',
    tools: ['query_logs'],
    chartData: {
      period: 'last 6h',
      items: [
        { plain: 'Checkout failed when the card form was empty', count: 84, route: '/checkout' },
        { plain: 'Search timed out talking to the index', count: 31, route: '/api/search' },
        { plain: 'Users couldn’t finish Google sign-in', count: 12, route: '/auth/callback' },
      ],
    },
  },
  {
    chartType: 'slow-pages',
    query: 'which pages are slow?',
    answer: 'p95 by route — `/api/search` is the outlier.',
    tools: ['query_metrics'],
    chartData: {
      pages: [
        { path: '/api/search', p95Ms: 820 },
        { path: '/checkout', p95Ms: 640 },
        { path: '/', p95Ms: 210 },
        { path: '/pricing', p95Ms: 180 },
      ],
    },
  },
  {
    chartType: 'user-pain-feed',
    query: 'are users hurting?',
    answer: 'Three users hit repeated 500s on signup in the last hour.',
    tools: ['query_logs'],
    chartData: {
      items: [
        { user: 'user_182', error: '500 on POST /signup', when: '12m ago', count: 4 },
        { user: 'user_991', error: '500 on POST /signup', when: '28m ago', count: 2 },
        { user: 'user_440', error: 'timeout on /api/search', when: '41m ago', count: 3 },
      ],
    },
  },
  {
    chartType: 'feature-flags',
    query: 'flag status',
    answer: 'Current feature flags and who last flipped them.',
    tools: ['get_flags'],
    chartData: {
      flags: [
        { key: 'checkout_v2', on: true, by: 'hadley', at: '12m ago' },
        { key: 'new_nav', on: false, by: 'ryo', at: '2d ago' },
        { key: 'ai_summary', on: true, by: 'calyx', at: '5h ago' },
      ],
    },
  },
  {
    chartType: 'release-notes',
    query: 'what shipped?',
    answer: 'v1.4.2 went out 20 minutes ago.',
    tools: ['github_releases'],
    chartData: {
      version: 'v1.4.2',
      shippedAt: '20m ago',
      items: ['Faster search pagination', 'Fix empty-cart checkout crash', 'Bump auth SDK'],
    },
  },
  {
    chartType: 'queue-backlog',
    query: 'job queue health',
    answer: '12 failed jobs in `mailers` — oldest is 4h.',
    tools: ['queue_stats'],
    chartData: {
      queue: 'mailers',
      failed: 12,
      oldestAge: '4h 12m',
      samples: ['SendWelcomeEmail user_182', 'SendInvoice #4091', 'SendPasswordReset user_77'],
    },
  },
  {
    chartType: 'db-basics',
    query: 'database ok?',
    answer: 'Connections are fine; one slow query to watch.',
    tools: ['db_stats'],
    chartData: {
      connections: 42,
      maxConnections: 100,
      migration: '2026_09_18_add_tenants · applied',
      slowQueries: [
        { sql: 'SELECT * FROM events WHERE tenant_id=…', ms: 920 },
        { sql: 'UPDATE orders SET status=…', ms: 410 },
      ],
    },
  },
  {
    chartType: 'auth-hiccups',
    query: 'auth errors?',
    answer: 'Failed logins ticked up — Google OAuth is the main source.',
    tools: ['auth_stats'],
    chartData: {
      period: 'last 1h',
      failedLogins: 47,
      oauthErrors: [
        { provider: 'Google', count: 31 },
        { provider: 'GitHub', count: 9 },
      ],
    },
  },
  {
    chartType: 'email-deliverability',
    query: 'email health',
    answer: 'Bounce rate is healthy on Postmark.',
    tools: ['email_stats'],
    chartData: { bounceRate: 1.2, provider: 'Postmark', status: 'OK', sent: 1840 },
  },
  {
    chartType: 'morning-digest',
    query: 'what broke overnight?',
    answer: 'Here’s your morning digest.',
    tools: ['digest'],
    chartData: {
      greeting: 'Good morning — quiet night overall.',
      bullets: [
        { icon: '●', text: '1 short blip on /api/search at 02:14 UTC' },
        { icon: '●', text: 'CI green on main (12 runs)' },
        { icon: '●', text: 'No open Sev-1/2 incidents' },
        { icon: '●', text: 'AWS cost +4% WoW (normal)' },
      ],
    },
  },
  {
    chartType: 'incident-lite',
    query: 'open a light incident',
    answer: 'Incident lite for the signup 500s — checklist is interactive.',
    tools: ['incident'],
    chartData: {
      title: 'Signup 500s',
      severity: 'sev-3',
      owner: '@hadley',
      checklist: [
        { done: true, text: 'Confirm error in logs' },
        { done: false, text: 'Check last deploy' },
        { done: false, text: 'Notify #support' },
        { done: false, text: 'Write customer note' },
      ],
    },
  },
  {
    chartType: 'runbook-checklist',
    query: 'run signup outage playbook',
    answer: 'Following **signup-outage** runbook — tick steps as you go.',
    tools: ['runbook'],
    chartData: {
      name: 'signup-outage',
      steps: [
        'Verify /signup returns 500 in prod',
        'Check auth provider status page',
        'Roll back last auth-related deploy if needed',
        'Post update in #support',
      ],
    },
  },
  {
    chartType: 'progress-indicator',
    query: 'are we on track for the checkout SLO?',
    answer: 'Checkout error-budget recovery is **on track** — 66%, up 30% vs last period.',
    tools: ['get_slo'],
    chartData: {
      title: 'Progress Indicator',
      insight: 'You are on track to finish the goal three days early',
      percent: 66,
      delta: 30,
      comparison: 'vs. the last period',
    },
  },
  {
    chartType: 'pr-risk',
    query: 'risk on this PR?',
    answer: 'PR #482 touches payments — treat carefully.',
    tools: ['github'],
    chartData: {
      number: 482,
      title: 'Refactor checkout totals',
      author: 'ryo',
      files: 14,
      additions: 320,
      deletions: 110,
      sensitive: ['payments', 'auth'],
      checks: [
        { name: 'ci', status: 'pass' },
        { name: 'e2e', status: 'pending' },
        { name: 'security', status: 'pass' },
      ],
    },
  },
  {
    chartType: 'ci-failure',
    query: 'why did CI fail?',
    answer: 'Job `e2e / chromium` failed — looks **real**, not a flake.',
    tools: ['github_actions'],
    chartData: {
      workflow: 'CI',
      job: 'e2e / chromium',
      verdict: 'real',
      snippet: [
        'Error: expect(page).toHaveURL(/dashboard/)',
        'Received: /login?error=session',
        'at tests/checkout.spec.ts:88',
      ],
    },
  },
  {
    chartType: 'deploy-from-commit',
    query: 'what’s on production?',
    answer: 'Production is on `a3f91c2` from Hadley’s merge.',
    tools: ['github', 'deploy'],
    chartData: {
      sha: 'a3f91c2',
      message: 'Fix empty-cart checkout crash',
      env: 'production',
      by: 'hadley',
      at: '20m ago',
      status: 'healthy',
    },
  },
  {
    chartType: 'blame-hotspot',
    query: 'which files keep breaking?',
    answer: 'Hotspot files by incident count (30d).',
    tools: ['github', 'incidents'],
    chartData: {
      files: [
        { path: 'src/checkout/totals.ts', incidents: 4, lastAt: '2d ago' },
        { path: 'src/auth/session.ts', incidents: 3, lastAt: '5d ago' },
        { path: 'src/search/client.ts', incidents: 2, lastAt: '1w ago' },
      ],
    },
  },
  {
    chartType: 'dependency-alert',
    query: 'any vulns?',
    answer: 'High severity in `lodash` — fix PR ready.',
    tools: ['dependabot'],
    chartData: {
      package: 'lodash@4.17.20',
      severity: 'high',
      cve: 'CVE-2021-23337',
      fixPr: '#501',
      summary: 'Command injection via template — upgrade to 4.17.21.',
    },
  },
  {
    chartType: 'release-train',
    query: 'can we release?',
    answer: 'Two PRs are blocking the release train.',
    tools: ['github'],
    chartData: {
      target: 'v1.5.0',
      blockers: [
        { pr: 482, title: 'Refactor checkout totals', missing: ['e2e', 'review'] },
        { pr: 490, title: 'Docs: onboarding', missing: ['review'] },
      ],
    },
  },
  {
    chartType: 'workflow-strip',
    query: 'CI status',
    answer: 'Workflow strip for the latest run on `main`.',
    tools: ['github_actions'],
    chartData: {
      name: 'CI · main · #2041',
      steps: [
        { name: 'lint', status: 'pass' },
        { name: 'unit', status: 'pass' },
        { name: 'e2e', status: 'running' },
        { name: 'deploy-preview', status: 'queued' },
      ],
    },
  },
  {
    chartType: 'pr-chip',
    query: 'open PRs',
    answer: 'Open PR chips with check dots.',
    tools: ['github'],
    chartData: {
      prs: [
        { number: 482, title: 'Refactor checkout', checks: ['pass', 'pending', 'pass'] },
        { number: 491, title: 'Add uptime probe', checks: ['pass', 'pass', 'pass'] },
      ],
    },
  },
  {
    chartType: 'commit-diff',
    query: 'show the diff for the fix commit',
    answer: 'Snapshot of `a3f91c2` — timeout raised on search handler.',
    tools: ['github'],
    chartData: {
      sha: 'a3f91c2e8b1d',
      message: 'fix: raise search timeout + log slow queries',
      author: 'maya',
      path: 'apps/api/src/routes/search.ts',
      additions: 6,
      deletions: 3,
      hunkHeader: '@@ -42,9 +42,12 @@ export async function searchHandler(req, res) {',
      lines: [
        { type: 'ctx', content: '  const started = Date.now()', oldNo: 42, newNo: 42 },
        { type: 'ctx', content: '  const q = String(req.query.q ?? "")', oldNo: 43, newNo: 43 },
        { type: 'del', content: '  const timeoutMs = 800', oldNo: 44, newNo: null },
        { type: 'add', content: '  const timeoutMs = Number(process.env.SEARCH_TIMEOUT_MS) || 2500', oldNo: null, newNo: 44 },
        { type: 'ctx', content: '  const results = await withTimeout(', oldNo: 45, newNo: 45 },
        { type: 'ctx', content: '    searchIndex.query(q),', oldNo: 46, newNo: 46 },
        { type: 'del', content: '    timeoutMs', oldNo: 47, newNo: null },
        { type: 'add', content: '    timeoutMs,', oldNo: null, newNo: 47 },
        { type: 'add', content: '  )', oldNo: null, newNo: 48 },
        { type: 'del', content: '  )', oldNo: 48, newNo: null },
        { type: 'add', content: '  if (Date.now() - started > 1000) {', oldNo: null, newNo: 49 },
        { type: 'add', content: '    logger.warn("slow_search", { q, ms: Date.now() - started })', oldNo: null, newNo: 50 },
        { type: 'add', content: '  }', oldNo: null, newNo: 51 },
        { type: 'ctx', content: '  return res.json({ results })', oldNo: 49, newNo: 52 },
      ],
    },
  },
  {
    chartType: 'pr-unfurl',
    query: 'what’s in that PR?',
    answer: 'PR unfurl — landing + dashboard polish, +173 / −61.',
    tools: ['github'],
    chartData: {
      title: 'Polish landing hero and dashboard UI',
      summary:
        'Summary UI polish for the landing page and app surfaces (open-ended “make ui changes” request). Landing Brand-first hero: ZkMultiCloud is the primary identity.',
      additions: 173,
      deletions: 61,
      comments: 1,
      url: 'https://github.com/Arnab-Afk/calyx',
      number: 1,
    },
  },
  {
    chartType: 'resource-health',
    query: 'cloud resources',
    answer: 'Cross-cloud resource health snapshot.',
    tools: ['cloud'],
    chartData: {
      provider: 'aws',
      resources: [
        { name: 'api-prod', region: 'us-east-1', status: 'healthy' },
        { name: 'worker-prod', region: 'us-east-1', status: 'degraded', detail: 'CPU 88%' },
        { name: 'db-main', region: 'us-east-1', status: 'healthy' },
      ],
    },
  },
  {
    chartType: 'quota-warning',
    query: 'any quotas?',
    answer: 'Approaching SES send quota.',
    tools: ['cloud'],
    chartData: {
      provider: 'aws',
      items: [
        { name: 'SES daily send', used: 42000, limit: 50000, unit: 'msgs' },
        { name: 'Lambda concurrent', used: 60, limit: 100, unit: '' },
      ],
    },
  },
  {
    chartType: 'cost-anomaly-lite',
    query: 'cost spike?',
    answer: 'S3/egress is up vs last week.',
    tools: ['cloud_cost'],
    chartData: { provider: 'aws', service: 'S3 + egress', wowPct: 38, thisWeek: 420, lastWeek: 304 },
  },
  {
    chartType: 'iam-risk',
    query: 'iam risks',
    answer: 'Read-only IAM findings.',
    tools: ['cloud_iam'],
    chartData: {
      provider: 'aws',
      findings: [
        { severity: 'high', title: 'Access key older than 90d', resource: 'user/ci-bot' },
        { severity: 'medium', title: 'Public S3 ACL', resource: 's3://assets-public' },
      ],
    },
  },
  {
    chartType: 'outage-overlay',
    query: 'is it us or them?',
    answer: 'Provider status is degraded — your errors line up.',
    tools: ['statuspage'],
    chartData: {
      provider: 'aws',
      providerStatus: 'API Gateway · degraded',
      yourErrorPct: 4.2,
      note: 'Correlation window 09:10–09:25 matches AWS status updates.',
    },
  },
  {
    chartType: 'aws-lambda-health',
    query: 'lambda health',
    answer: 'Lambda `checkout-fn` had throttles this hour.',
    tools: ['aws'],
    chartData: { functionName: 'checkout-fn', errors: 12, throttles: 40, coldStarts: 8, period: '1h' },
  },
  {
    chartType: 'aws-alb-5xx',
    query: 'alb 5xx',
    answer: 'ALB showing 5xx with one unhealthy target.',
    tools: ['aws'],
    chartData: {
      name: 'app-alb',
      count5xx: 26,
      unhealthyTargets: 1,
      targets: ['i-0ab12 · unhealthy', 'i-0cd34 · healthy'],
    },
  },
  {
    chartType: 'aws-rds-basics',
    query: 'rds ok?',
    answer: 'RDS looks fine — storage 62%.',
    tools: ['aws'],
    chartData: { instance: 'prod-pg', cpu: 34, connections: 58, storagePct: 62 },
  },
  {
    chartType: 'aws-sqs-dlq',
    query: 'sqs dlq',
    answer: 'DLQ has depth — worth inspecting.',
    tools: ['aws'],
    chartData: { queue: 'orders-dlq', depth: 17, oldestAge: '2h' },
  },
  {
    chartType: 'aws-ecs-desired',
    query: 'ecs service',
    answer: 'ECS desired count mismatch.',
    tools: ['aws'],
    chartData: { service: 'api-prod', desired: 4, running: 3 },
  },
  {
    chartType: 'azure-app-failures',
    query: 'azure app failures',
    answer: 'App Service failures in the last hour.',
    tools: ['azure'],
    chartData: { app: 'calyx-web', kind: 'App Service', failures: 19, topError: 'HTTP 500 · /api/checkout' },
  },
  {
    chartType: 'azure-aks-restarts',
    query: 'aks restarts',
    answer: 'Pod restarts on AKS.',
    tools: ['azure'],
    chartData: {
      cluster: 'prod-aks',
      pods: [
        { name: 'api-7f9c', restarts: 6 },
        { name: 'worker-2ab1', restarts: 2 },
      ],
    },
  },
  {
    chartType: 'azure-servicebus-dlq',
    query: 'service bus dlq',
    answer: 'Service Bus DLQ depth.',
    tools: ['azure'],
    chartData: { topic: 'orders/subscriptions/worker', depth: 9 },
  },
  {
    chartType: 'azure-entra-auth',
    query: 'entra failures',
    answer: 'Entra ID auth failures spiked.',
    tools: ['azure'],
    chartData: { failures: 55, topReason: 'invalid_grant · consent required', period: '1h' },
  },
  {
    chartType: 'gcp-cloud-run',
    query: 'cloud run revisions',
    answer: 'Cloud Run revision `api-00042` is erroring under traffic.',
    tools: ['gcp'],
    chartData: {
      service: 'api',
      revisions: [
        { name: 'api-00042', errorPct: 6.2, traffic: 20 },
        { name: 'api-00041', errorPct: 0.4, traffic: 80 },
      ],
    },
  },
  {
    chartType: 'gcp-cloud-sql',
    query: 'cloud sql',
    answer: 'Cloud SQL basics look healthy.',
    tools: ['gcp'],
    chartData: { instance: 'prod-sql', cpu: 28, connections: 40, diskPct: 54 },
  },
  {
    chartType: 'gcp-pubsub-unacked',
    query: 'pubsub lag',
    answer: 'Pub/Sub unacked messages rising.',
    tools: ['gcp'],
    chartData: { subscription: 'orders-sub', unacked: 1230 },
  },
  {
    chartType: 'gcp-error-reporting',
    query: 'error reporting',
    answer: 'Top Error Reporting issues.',
    tools: ['gcp'],
    chartData: {
      issues: [
        { title: 'TypeError: Cannot read properties of undefined', count: 210, status: 'open' },
        { title: 'Deadline exceeded', count: 44, status: 'open' },
      ],
    },
  },
  {
    chartType: 'gcp-cloud-build',
    query: 'cloud build failed',
    answer: 'Cloud Build trigger failed.',
    tools: ['gcp'],
    chartData: {
      trigger: 'deploy-api',
      status: 'FAILURE',
      logTail: ['Step #2 - "test": FAILED', 'Error: Exit status 1', 'npm ERR! Test failed.'],
    },
  },
];

/** Create a new channel and post all utility/GitHub/cloud gallery samples. */
export const seedUtilityGallery = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    memberId: v.optional(v.id('members')),
    /** Channel name without `#`. Defaults to a unique `calyx-gallery-…` name. */
    channelName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let memberId = args.memberId;
    if (!memberId) {
      const member = await ctx.db
        .query('members')
        .withIndex('by_workspace_id', (q) => q.eq('workspaceId', args.workspaceId))
        .first();
      if (!member) throw new Error('No members — sign in once first.');
      memberId = member._id;
    }

    const stamp = new Date().toISOString().slice(5, 16).replace(/[:T]/g, '');
    let channelName = args.channelName ?? `calyx-gallery-${stamp}`;

    const existing = await ctx.db
      .query('channels')
      .withIndex('by_workspace_id', (q) => q.eq('workspaceId', args.workspaceId))
      .collect();
    if (existing.some((c) => c.name === channelName)) {
      channelName = `${channelName}-${stamp}`;
    }

    const channelId = await ctx.db.insert('channels', {
      name: channelName,
      workspaceId: args.workspaceId,
    });

    const quillBody = (text: string) => JSON.stringify({ ops: [{ insert: `${text}\n` }] });

    const ids: Id<'messages'>[] = [];
    ids.push(
      await ctx.db.insert('messages', {
        memberId,
        body: quillBody('— Calyx utilities · GitHub · cloud gallery —'),
        channelId,
        workspaceId: args.workspaceId,
      }),
    );

    for (const sample of SAMPLES) {
      ids.push(
        await ctx.db.insert('messages', {
          memberId,
          body: quillBody(`[Calyx] ${sample.answer}`),
          channelId,
          workspaceId: args.workspaceId,
          calyxData: {
            query: sample.query,
            answer: sample.answer,
            chartType: sample.chartType,
            chartData: JSON.stringify(sample.chartData),
            toolNames: sample.tools,
            tenantId: 'default',
          },
        }),
      );
    }

    return {
      channelId,
      channelName,
      count: ids.length,
      samples: SAMPLES.length,
      sampleTypes: SAMPLES.map((s) => s.chartType),
    };
  },
});

/** Post one gallery sample into an existing channel. */
export const postSample = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    channelId: v.id('channels'),
    chartType: v.string(),
    memberId: v.optional(v.id('members')),
  },
  handler: async (ctx, args) => {
    const sample = SAMPLES.find((s) => s.chartType === args.chartType);
    if (!sample) throw new Error(`Unknown gallery sample: ${args.chartType}`);

    let memberId = args.memberId;
    if (!memberId) {
      const member = await ctx.db
        .query('members')
        .withIndex('by_workspace_id', (q) => q.eq('workspaceId', args.workspaceId))
        .first();
      if (!member) throw new Error('No members — sign in once first.');
      memberId = member._id;
    }

    const quillBody = (text: string) => JSON.stringify({ ops: [{ insert: `${text}\n` }] });

    return await ctx.db.insert('messages', {
      memberId,
      body: quillBody(`[Calyx] ${sample.answer}`),
      channelId: args.channelId,
      workspaceId: args.workspaceId,
      calyxData: {
        query: sample.query,
        answer: sample.answer,
        chartType: sample.chartType,
        chartData: JSON.stringify(sample.chartData),
        toolNames: sample.tools,
        tenantId: 'default',
      },
    });
  },
});
