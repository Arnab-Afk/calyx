export type AppTypeId =
  | 'nextjs'
  | 'node'
  | 'python'
  | 'browser'
  | 'docker'
  | 'journald'
  | 'cloudwatch'
  | 'vercel'
  | 'other';

export type SourcePlan = {
  role: 'frontend' | 'backend' | 'other';
  service: string;
  name: string;
  provider: string;
};

export type AppType = {
  id: AppTypeId;
  title: string;
  blurb: string;
  sources: SourcePlan[];
  tutorialTitle: string;
  /** Shown after sources are created — {token}, {intake}, {service} placeholders */
  steps: { title: string; body?: string; code?: string }[];
};

export const APP_TYPES: AppType[] = [
  {
    id: 'nextjs',
    title: 'Next.js',
    blurb: 'App Router or Pages — ship browser + server logs with one package.',
    sources: [
      { role: 'frontend', service: 'web', name: 'next-web', provider: 'http' },
      { role: 'backend', service: 'api', name: 'next-server', provider: 'http' },
    ],
    tutorialTitle: 'Connect Next.js with calyx-logger',
    steps: [
      {
        title: 'Install',
        body: 'Add the logger package to your Next app.',
        code: 'npm i calyx-logger',
      },
      {
        title: 'Env (frontend source token)',
        body: 'Use the frontend token Calyx just created. Intake must be HTTPS in production.',
        code: `NEXT_PUBLIC_CALYX_INTAKE_URL={intake}/v1/logs
NEXT_PUBLIC_CALYX_SOURCE_TOKEN={frontendToken}
NEXT_PUBLIC_CALYX_SERVICE=web`,
      },
      {
        title: 'Wrap next.config',
        body: 'One line — no layout providers required.',
        code: `import { withCalyxLogger } from 'calyx-logger/next'
export default withCalyxLogger({})`,
      },
      {
        title: 'Server / API routes (backend token)',
        body: 'Initialize once on the server with the backend source token.',
        code: `import { init } from 'calyx-logger'
init({
  intakeUrl: '{intake}/v1/logs',
  sourceToken: '{backendToken}',
  service: 'api',
})`,
      },
    ],
  },
  {
    id: 'node',
    title: 'Node / Fastify / Express',
    blurb: 'API services posting structured JSON over HTTPS.',
    sources: [{ role: 'backend', service: 'api', name: 'node-api', provider: 'http' }],
    tutorialTitle: 'Ship logs from Node',
    steps: [
      {
        title: 'POST /v1/logs',
        body: 'Authorize with the source write token (shown once).',
        code: `curl -X POST {intake}/v1/logs \\
  -H "Authorization: Bearer {backendToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"timestamp":"2026-09-20T12:00:00.000Z","level":"error","message":"checkout 500","attributes":{}}'`,
      },
      {
        title: 'Or use calyx-logger',
        body: 'Same token works with the Node client.',
        code: `import { init } from 'calyx-logger'
init({ intakeUrl: '{intake}/v1/logs', sourceToken: '{backendToken}', service: 'api' })`,
      },
    ],
  },
  {
    id: 'python',
    title: 'Python',
    blurb: 'Django, FastAPI, Flask — HTTP intake with a bearer token.',
    sources: [{ role: 'backend', service: 'api', name: 'python-api', provider: 'http' }],
    tutorialTitle: 'Connect Python',
    steps: [
      {
        title: 'HTTP intake',
        body: 'Post JSON events with your backend source token.',
        code: `import requests, datetime
requests.post(
  "{intake}/v1/logs",
  headers={"Authorization": "Bearer {backendToken}"},
  json={
    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    "level": "error",
    "message": "payment failed",
    "attributes": {"route": "/checkout"},
  },
)`,
      },
    ],
  },
  {
    id: 'browser',
    title: 'Browser SPA',
    blurb: 'React, Vue, or plain JS — client-side errors and breadcrumbs.',
    sources: [{ role: 'frontend', service: 'web', name: 'browser-web', provider: 'http' }],
    tutorialTitle: 'Browser intake',
    steps: [
      {
        title: 'Env',
        code: `NEXT_PUBLIC_CALYX_INTAKE_URL={intake}/v1/logs
NEXT_PUBLIC_CALYX_SOURCE_TOKEN={frontendToken}`,
      },
      {
        title: 'Fetch from the client',
        code: `await fetch('{intake}/v1/logs', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer {frontendToken}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: 'Uncaught TypeError',
    attributes: { path: location.pathname },
  }),
})`,
      },
    ],
  },
  {
    id: 'docker',
    title: 'Docker / containers',
    blurb: 'Sidecar or app code that posts logs from each service.',
    sources: [{ role: 'backend', service: 'api', name: 'container-api', provider: 'http' }],
    tutorialTitle: 'Container → Calyx',
    steps: [
      {
        title: 'Env in the container',
        code: `CALYX_INTAKE_URL={intake}/v1/logs
CALYX_SOURCE_TOKEN={backendToken}
CALYX_SERVICE=api`,
      },
      {
        title: 'Smoke from inside the network',
        code: `curl -X POST "$CALYX_INTAKE_URL" \\
  -H "Authorization: Bearer $CALYX_SOURCE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"timestamp":"2026-09-20T12:00:00.000Z","level":"info","message":"boot ok"}'`,
      },
    ],
  },
  {
    id: 'journald',
    title: 'Linux VM / journalctl',
    blurb: 'Paste one command on the VM — browser login, pick a service, logs stream in.',
    sources: [],
    tutorialTitle: 'Ship systemd journal logs',
    steps: [
      {
        title: 'On the VM',
        body: 'Paste this on any Linux or Docker host with Node 18+. Pick a machine type, authorize in the browser, then choose a project and service.',
        code: `curl -fsSL https://calyx-intake.arnabbhowmik.in/install | bash`,
      },
      {
        title: 'What happens next',
        body: '1) Pick how apps are hosted (systemd, PM2, Docker, log file, or Kubernetes).\n2) Approve the device code in the browser and pick a workspace.\n3) In the terminal, pick a project and target.\n4) Calyx installs a background shipper — you can close the terminal.',
      },
      {
        title: 'Non-interactive / CI',
        code: `curl -fsSL https://calyx-intake.arnabbhowmik.in/install | CALYX_MACHINE_TYPE=pm2 bash
# linux | pm2 | docker | file | k8s | cli`,
      },
    ],
  },
  {
    id: 'cloudwatch',
    title: 'AWS CloudWatch',
    blurb: 'No VM agent — a Lambda in your AWS account forwards log groups to Calyx.',
    sources: [{ role: 'backend', service: 'aws', name: 'cloudwatch', provider: 'cloudwatch' }],
    tutorialTitle: 'Connect CloudWatch Logs',
    steps: [
      {
        title: 'What Calyx created',
        body: 'A CloudWatch log source with a drain URL and write token. Copy them from the next screen (or Project → Sources).',
      },
      {
        title: 'Create a forwarder Lambda in AWS',
        body: 'Node.js 22+. Set CALYX_CLOUDWATCH_URL and CALYX_SOURCE_TOKEN from Calyx.',
        code: `export const handler = async (event) => {
  const res = await fetch(process.env.CALYX_CLOUDWATCH_URL, {
    method: "POST",
    headers: {
      authorization: \`Bearer \${process.env.CALYX_SOURCE_TOKEN}\`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(await res.text());
};`,
      },
      {
        title: 'Subscribe the log group',
        body: 'CloudWatch → your log group → Subscription filters → Lambda → pick the forwarder. No always-on machine required.',
      },
    ],
  },
  {
    id: 'vercel',
    title: 'Vercel Log Drain',
    blurb: 'No SDK — Vercel ships platform logs over HTTPS to Calyx.',
    sources: [{ role: 'frontend', service: 'web', name: 'vercel-prod', provider: 'vercel' }],
    tutorialTitle: 'Vercel Drain setup',
    steps: [
      {
        title: 'Create the Vercel-backed source',
        body: 'You already created it in this wizard if provider=vercel was selected. Copy the drain URL from Control Center → Projects if needed.',
      },
      {
        title: 'Add a Custom Drain in Vercel',
        body: 'Team Settings → Drains → Add → Custom Endpoint. Format: JSON. Paste the drain URL and signature secret Calyx printed.',
      },
      {
        title: 'Or POST HTTP logs from the app',
        body: 'You can still use a normal HTTP source token for app-level events.',
        code: `curl -X POST {intake}/v1/logs \\
  -H "Authorization: Bearer {frontendToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"timestamp":"2026-09-20T12:00:00.000Z","level":"error","message":"edge timeout"}'`,
      },
    ],
  },
  {
    id: 'other',
    title: 'Something else',
    blurb: 'Generic frontend + backend sources — wire any HTTP client.',
    sources: [
      { role: 'frontend', service: 'web', name: 'app-frontend', provider: 'http' },
      { role: 'backend', service: 'api', name: 'app-backend', provider: 'http' },
    ],
    tutorialTitle: 'Generic HTTP intake',
    steps: [
      {
        title: 'Backend',
        code: `curl -X POST {intake}/v1/logs \\
  -H "Authorization: Bearer {backendToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"timestamp":"2026-09-20T12:00:00.000Z","level":"error","message":"hello calyx"}'`,
      },
      {
        title: 'Frontend',
        code: `curl -X POST {intake}/v1/logs \\
  -H "Authorization: Bearer {frontendToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"timestamp":"2026-09-20T12:00:00.000Z","level":"warn","message":"ui glitch"}'`,
      },
    ],
  },
];

export function fillTutorial(
  template: string,
  vars: { intake: string; frontendToken: string; backendToken: string },
) {
  return template
    .replaceAll('{intake}', vars.intake)
    .replaceAll('{frontendToken}', vars.frontendToken || '<frontend-token>')
    .replaceAll('{backendToken}', vars.backendToken || '<backend-token>');
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'my-app';
}
