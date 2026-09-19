'use client';

import dynamic from 'next/dynamic';
import { Loader } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { GrafanaPanel, ensureChartRegistered } from '../chart-registry';

function ChartLoader() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader className="size-5 animate-spin text-white/35" />
    </div>
  );
}

function lazyNamed<P>(loader: () => Promise<Record<string, ComponentType<{ data: P }>>>, exportName: string) {
  return dynamic(
    async () => {
      const mod = await loader();
      return { default: mod[exportName] as ComponentType<{ data: P }> };
    },
    { ssr: false, loading: () => <ChartLoader /> },
  );
}

const ServiceHealthBars = dynamic(() => import('./service-health-bars').then((m) => ({ default: m.ServiceHealthBars })), { ssr: false, loading: () => <ChartLoader /> });
const LevelDonut = dynamic(() => import('./level-donut').then((m) => ({ default: m.LevelDonut })), { ssr: false, loading: () => <ChartLoader /> });
const ErrorTimeseries = dynamic(() => import('./error-timeseries').then((m) => ({ default: m.ErrorTimeseries })), { ssr: false, loading: () => <ChartLoader /> });
const Gauge = dynamic(() => import('./gauge').then((m) => ({ default: m.Gauge })), { ssr: false, loading: () => <ChartLoader /> });
const SparklineGrid = dynamic(() => import('./sparkline-grid').then((m) => ({ default: m.SparklineGrid })), { ssr: false, loading: () => <ChartLoader /> });
const AnomalyScatter = dynamic(() => import('./anomaly-scatter').then((m) => ({ default: m.AnomalyScatter })), { ssr: false, loading: () => <ChartLoader /> });
const TextStatusBars = dynamic(() => import('./text-status-bars').then((m) => ({ default: m.TextStatusBars })), { ssr: false, loading: () => <ChartLoader /> });
const DeployCorrelation = dynamic(() => import('./deploy-correlation').then((m) => ({ default: m.DeployCorrelation })), { ssr: false, loading: () => <ChartLoader /> });
const BlastRadius = dynamic(() => import('./blast-radius').then((m) => ({ default: m.BlastRadius })), { ssr: false, loading: () => <ChartLoader /> });
const TraceWaterfall = dynamic(() => import('./trace-waterfall').then((m) => ({ default: m.TraceWaterfall })), { ssr: false, loading: () => <ChartLoader /> });
const SilentFailureHeatmap = dynamic(() => import('./silent-failure-heatmap').then((m) => ({ default: m.SilentFailureHeatmap })), { ssr: false, loading: () => <ChartLoader /> });
const SloBurn = dynamic(() => import('./slo-burn').then((m) => ({ default: m.SloBurn })), { ssr: false, loading: () => <ChartLoader /> });
const LogSignatures = dynamic(() => import('./log-signatures').then((m) => ({ default: m.LogSignatures })), { ssr: false, loading: () => <ChartLoader /> });
const CostRunaway = dynamic(() => import('./cost-runaway').then((m) => ({ default: m.CostRunaway })), { ssr: false, loading: () => <ChartLoader /> });
const IncidentTimeline = dynamic(() => import('./incident-timeline').then((m) => ({ default: m.IncidentTimeline })), { ssr: false, loading: () => <ChartLoader /> });
const ApprovalCard = dynamic(() => import('./approval-card').then((m) => ({ default: m.ApprovalCard })), { ssr: false, loading: () => <ChartLoader /> });
const CompareWindow = dynamic(() => import('./compare-window').then((m) => ({ default: m.CompareWindow })), { ssr: false, loading: () => <ChartLoader /> });
const MemoryRecall = dynamic(() => import('./memory-recall').then((m) => ({ default: m.MemoryRecall })), { ssr: false, loading: () => <ChartLoader /> });

const u = (name: string) => lazyNamed(() => import('./utility-cards') as never, name);
const g = (name: string) => lazyNamed(() => import('./github-cards') as never, name);
const c = (name: string) => lazyNamed(() => import('./cloud-cards') as never, name);

const GALLERY: Record<string, ComponentType<{ data: unknown }>> = {
  'action-card': u('ActionCard') as never,
  'data-table': u('DataTable') as never,
  'metric-chips': u('MetricChips') as never,
  'diff-card': u('DiffCard') as never,
  'uptime-pulse': u('UptimePulse') as never,
  'error-digest': u('ErrorDigest') as never,
  'slow-pages': u('SlowPages') as never,
  'user-pain-feed': u('UserPainFeed') as never,
  'feature-flags': u('FeatureFlags') as never,
  'release-notes': u('ReleaseNotes') as never,
  'queue-backlog': u('QueueBacklog') as never,
  'db-basics': u('DbBasics') as never,
  'auth-hiccups': u('AuthHiccups') as never,
  'email-deliverability': u('EmailDeliverability') as never,
  'morning-digest': u('MorningDigest') as never,
  'incident-lite': u('IncidentLite') as never,
  'runbook-checklist': u('RunbookChecklist') as never,
  'pr-risk': g('PrRisk') as never,
  'ci-failure': g('CiFailure') as never,
  'deploy-from-commit': g('DeployFromCommit') as never,
  'blame-hotspot': g('BlameHotspot') as never,
  'dependency-alert': g('DependencyAlert') as never,
  'release-train': g('ReleaseTrain') as never,
  'workflow-strip': g('WorkflowStrip') as never,
  'pr-chip': g('PrChip') as never,
  'commit-diff': g('CommitDiff') as never,
  'resource-health': c('ResourceHealth') as never,
  'quota-warning': c('QuotaWarning') as never,
  'cost-anomaly-lite': c('CostAnomalyLite') as never,
  'iam-risk': c('IamRisk') as never,
  'outage-overlay': c('OutageOverlay') as never,
  'aws-lambda-health': c('AwsLambdaHealth') as never,
  'aws-alb-5xx': c('AwsAlb5xx') as never,
  'aws-rds-basics': c('AwsRdsBasics') as never,
  'aws-sqs-dlq': c('AwsSqsDlq') as never,
  'aws-ecs-desired': c('AwsEcsDesired') as never,
  'azure-app-failures': c('AzureAppFailures') as never,
  'azure-aks-restarts': c('AzureAksRestarts') as never,
  'azure-servicebus-dlq': c('AzureServicebusDlq') as never,
  'azure-entra-auth': c('AzureEntraAuth') as never,
  'gcp-cloud-run': c('GcpCloudRun') as never,
  'gcp-cloud-sql': c('GcpCloudSql') as never,
  'gcp-pubsub-unacked': c('GcpPubsubUnacked') as never,
  'gcp-error-reporting': c('GcpErrorReporting') as never,
  'gcp-cloud-build': c('GcpCloudBuild') as never,
};

export const TITLES: Record<string, string> = {
  'service-health-bars': 'Service health',
  'level-donut': 'Log levels',
  'error-timeseries': 'Error Logs',
  'event-volume-bar': 'Event volume',
  gauge: 'Gauge',
  'sparkline-grid': 'Trends',
  'anomaly-scatter': 'Anomalies',
  'text-status-bars': 'Service health',
  'deploy-correlation': 'Deploy correlation',
  'blast-radius': 'Blast radius',
  'trace-waterfall': 'Request trace',
  'silent-failure-heatmap': 'Silent failures',
  'slo-burn': 'SLO burn',
  'log-signatures': 'Log signatures',
  'cost-runaway': 'Cost runaway',
  'incident-timeline': 'Incident timeline',
  'approval-card': 'Proposed action',
  'compare-window': 'Compare windows',
  'memory-recall': 'Memory',
  'action-card': 'Action',
  'data-table': 'Table',
  'metric-chips': 'Metrics',
  'diff-card': 'Diff',
  'uptime-pulse': 'Uptime',
  'error-digest': 'Error digest',
  'slow-pages': 'Slow pages',
  'user-pain-feed': 'User pain',
  'feature-flags': 'Feature flags',
  'release-notes': 'Release',
  'queue-backlog': 'Queue backlog',
  'db-basics': 'Database',
  'auth-hiccups': 'Auth',
  'email-deliverability': 'Email',
  'morning-digest': 'Morning digest',
  'incident-lite': 'Incident',
  'runbook-checklist': 'Runbook',
  'pr-risk': 'PR risk',
  'ci-failure': 'CI failure',
  'deploy-from-commit': 'Deploy',
  'blame-hotspot': 'Hotspots',
  'dependency-alert': 'Dependency',
  'release-train': 'Release train',
  'workflow-strip': 'Workflow',
  'pr-chip': 'Pull requests',
  'commit-diff': 'Commit diff',
  'resource-health': 'Resource health',
  'quota-warning': 'Quota',
  'cost-anomaly-lite': 'Cost anomaly',
  'iam-risk': 'IAM risk',
  'outage-overlay': 'Provider outage',
  'aws-lambda-health': 'Lambda',
  'aws-alb-5xx': 'ALB 5xx',
  'aws-rds-basics': 'RDS',
  'aws-sqs-dlq': 'SQS DLQ',
  'aws-ecs-desired': 'ECS',
  'azure-app-failures': 'Azure app',
  'azure-aks-restarts': 'AKS restarts',
  'azure-servicebus-dlq': 'Service Bus DLQ',
  'azure-entra-auth': 'Entra ID',
  'gcp-cloud-run': 'Cloud Run',
  'gcp-cloud-sql': 'Cloud SQL',
  'gcp-pubsub-unacked': 'Pub/Sub',
  'gcp-error-reporting': 'Error Reporting',
  'gcp-cloud-build': 'Cloud Build',
};

const BARE = new Set(['approval-card', 'action-card']);

interface ChartProps {
  type: string;
  data: unknown;
  title?: string;
  timeRange?: string;
  onBrush?: (from: string, to: string) => void;
  onFocus?: (id: string) => void;
}

export function CalyxChart({ type, data, title, timeRange, onBrush, onFocus }: ChartProps) {
  ensureChartRegistered();
  if (!data) return null;

  const panelTitle = title ?? TITLES[type] ?? 'Calyx';
  const Gallery = GALLERY[type];

  let node: ReactNode = null;

  if (Gallery) {
    node = <Gallery data={data} />;
  } else {
    switch (type) {
      case 'service-health-bars':
      case 'event-volume-bar':
        node = <ServiceHealthBars stats={data as never} />;
        break;
      case 'level-donut':
        node = (
          <div className="max-w-xs">
            <LevelDonut byLevel={data as never} />
          </div>
        );
        break;
      case 'error-timeseries':
        node = <ErrorTimeseries series={data as never} />;
        break;
      case 'gauge': {
        const gData = data as { value: number; label?: string; maxValue?: number };
        node = (
          <div className="max-w-xs">
            <Gauge value={gData.value} label={gData.label} maxValue={gData.maxValue} />
          </div>
        );
        break;
      }
      case 'sparkline-grid':
        node = <SparklineGrid series={data as never} />;
        break;
      case 'anomaly-scatter':
        node = <AnomalyScatter points={data as never} />;
        break;
      case 'text-status-bars':
        node = <TextStatusBars services={data as never} />;
        break;
      case 'deploy-correlation':
        node = <DeployCorrelation data={data as never} onBrush={onBrush} />;
        break;
      case 'blast-radius': {
        const d = data as {
          nodes: never[];
          edges: never[];
          cursors?: Array<{ name: string; x: number; y: number; color: string }>;
        };
        node = <BlastRadius data={d} onFocus={onFocus} cursors={d.cursors} />;
        break;
      }
      case 'trace-waterfall':
        node = <TraceWaterfall data={data as never} />;
        break;
      case 'silent-failure-heatmap':
        node = <SilentFailureHeatmap data={data as never} />;
        break;
      case 'slo-burn':
        node = <SloBurn data={data as never} />;
        break;
      case 'log-signatures':
        node = <LogSignatures data={data as never} />;
        break;
      case 'cost-runaway':
        node = <CostRunaway data={data as never} />;
        break;
      case 'incident-timeline':
        node = <IncidentTimeline data={data as never} />;
        break;
      case 'approval-card':
        node = <ApprovalCard data={data as never} />;
        break;
      case 'compare-window':
        node = <CompareWindow data={data as never} />;
        break;
      case 'memory-recall':
        node = <MemoryRecall data={data as never} />;
        break;
      default:
        node = null;
    }
  }

  if (!node) return null;
  if (BARE.has(type)) return node;

  return (
    <GrafanaPanel title={panelTitle} timeRange={timeRange}>
      {node}
    </GrafanaPanel>
  );
}
