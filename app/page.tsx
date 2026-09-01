'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  FileCheck2,
  FileJson,
  Fingerprint,
  Gauge,
  HelpCircle,
  Layers3,
  LockKeyhole,
  Play,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  WalletCards,
} from 'lucide-react';
import benchmarkArtifact from '@/artifacts/benchmark.json';
import manifestArtifact from '@/artifacts/run_manifest.json';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ImportCloseDialog,
  type ImportedCloseSession,
} from '@/components/import-close-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  exceptionsToCsv,
  formatInr,
  formatPercent,
  runClose,
  runImportedClose,
  runSeededRegression,
  type CloseRun,
  type MatchMethod,
  type ReconciliationDecision,
} from '@/lib/reconciliation';

type View = 'overview' | 'evidence' | 'exceptions' | 'benchmark';
type Phase = 'complete' | 'running';

const pipelineSteps = (sourceRows: number) => [
  `Profiling ${sourceRows.toLocaleString('en-IN')} source rows`,
  'Generating typed candidates',
  'Verifying money invariants',
  'Posting balanced journals',
];

const benchmarkRun = runClose();

const navItems: Array<{ value: View; label: string; icon: LucideIcon }> = [
  { value: 'overview', label: 'Close command', icon: CircleDollarSign },
  { value: 'evidence', label: 'Evidence ledger', icon: Layers3 },
  { value: 'exceptions', label: 'Exception inbox', icon: TriangleAlert },
  { value: 'benchmark', label: 'Benchmark & audit', icon: BarChart3 },
];

const methodMeta: Record<
  MatchMethod,
  { label: string; className: string; short: string }
> = {
  'exact-rule': {
    label: 'Exact rule',
    short: 'Exact',
    className: 'border-[#d7e8da] bg-[#eef9f0] text-[#24613a]',
  },
  'constraint-rule': {
    label: 'Constraint rule',
    short: 'Constraint',
    className: 'border-[#d8e2e7] bg-[#f0f6f8] text-[#31596a]',
  },
  'verified-ai': {
    label: 'Verified AI',
    short: 'Verified AI',
    className: 'border-[#ddd6f4] bg-[#f4f0ff] text-[#5a4594]',
  },
};

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'green' | 'amber';
}) {
  const iconClass =
    tone === 'green'
      ? 'bg-[#e9f9ed] text-[#247141]'
      : tone === 'amber'
        ? 'bg-[#fff4e4] text-[#9c5a11]'
        : 'bg-[#eef1ed] text-[#4e6258]';
  return (
    <article className="rounded-xl border border-[#dce2db] bg-white p-4 shadow-[0_7px_22px_rgba(25,42,33,0.035)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-[#68766e]">{label}</p>
        <span className={`grid size-7 place-items-center rounded-lg ${iconClass}`}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.035em] tabular-nums text-[#14231c]">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#647169]">{detail}</p>
    </article>
  );
}

function SourceFlow({ run }: { run: CloseRun }) {
  const items = [
    {
      label: 'ERP ledger',
      value: `${run.batch.ledger.length} rows`,
      detail: 'Orders & receipts',
      icon: ReceiptText,
    },
    {
      label: 'Gateway recon',
      value: `${run.batch.gateway.length} rows`,
      detail: 'Payments, fees & refunds',
      icon: Database,
    },
    {
      label: 'Bank statement',
      value: `${run.batch.bank.length} rows`,
      detail: 'Credits, debits & UTRs',
      icon: Building2,
    },
    {
      label: 'Verified close',
      value: `${run.metrics.correctAutoMatches} matched`,
      detail: `${run.metrics.unresolved} held back`,
      icon: ShieldCheck,
    },
  ];
  return (
    <div className="grid overflow-hidden rounded-xl border border-[#dce2db] bg-white sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ label, value, detail, icon: Icon }, index) => (
        <div
          className={`relative flex items-center gap-3 px-4 py-4 ${index > 0 ? 'border-t border-[#e2e6e1] sm:border-l sm:border-t-0 sm:[&:nth-child(3)]:border-t xl:[&:nth-child(3)]:border-t-0' : ''}`}
          key={label}
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-lg ${index === items.length - 1 ? 'bg-[#dffbe6] text-[#21703d]' : 'bg-[#f1f4ef] text-[#486156]'}`}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-[#5e6c64]">{label}</p>
            <p className="text-sm font-semibold tabular-nums">{value}</p>
            <p className="truncate text-[10px] text-[#657269]">{detail}</p>
          </div>
          {index < items.length - 1 && (
            <ArrowRight className="absolute -right-2 z-10 hidden size-4 rounded-full bg-white text-[#a7b0aa] xl:block" />
          )}
        </div>
      ))}
    </div>
  );
}

function CloseOverview({
  run,
  phase,
  stage,
  cutoffDate,
}: {
  run: CloseRun;
  phase: Phase;
  stage: number;
  cutoffDate: string;
}) {
  const isBenchmark = run.metrics.evaluationMode === 'ground-truth';
  const passedInvariants = run.certificate.invariants.filter(
    (item) => item.passed,
  ).length;
  const matchedValue = run.decisions
    .filter((item) => item.status === 'matched')
    .reduce((sum, item) => sum + item.amountPaise, 0);
  const exceptionIds = run.decisions
    .filter((item) => item.status === 'exception')
    .map((item) => item.targetId.replace('target_', 'T-'));

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-2xl bg-[#112019] text-white shadow-[0_22px_70px_rgba(12,29,20,0.16)] lg:grid-cols-[1.45fr_0.85fr]">
        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="proof-grid absolute inset-0 opacity-35" />
          <div aria-busy={phase === 'running'} aria-live="polite" className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`border ${run.certificate.status === 'BLOCKED' ? 'border-[#e5a241]/30 bg-[#e5a241]/10 text-[#ffd18e]' : 'border-[#63b979]/25 bg-[#9bffb6]/10 text-[#baffc9]'}`}>
                {run.certificate.status === 'BLOCKED' ? <LockKeyhole /> : <CheckCircle2 />}
                {run.certificate.status === 'BLOCKED'
                  ? 'Posting blocked'
                  : run.certificate.status === 'CLOSED'
                    ? 'Closed cleanly'
                    : 'Closed with exceptions'}
              </Badge>
              <span className="text-xs text-white/60">CERT-{run.batch.id}</span>
            </div>
            {phase === 'running' ? (
              <div className="py-7">
                <div className="flex items-center gap-3">
                  <RefreshCw className="size-6 animate-spin text-[#b7ffca]" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-white/60">
                      Verified close running
                    </p>
                    <p className="mt-1 text-xl font-semibold">{pipelineSteps(run.metrics.sourceRows)[stage]}</p>
                  </div>
                </div>
                <Progress
                  aria-label="Close progress"
                  className="mt-7 [&_[data-slot=progress-indicator]]:bg-[#b7ffca] [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-white/10"
                  value={((stage + 1) / pipelineSteps(run.metrics.sourceRows).length) * 100}
                />
                <p className="mt-3 text-xs tabular-nums text-white/60">
                  Stage {stage + 1} of {pipelineSteps(run.metrics.sourceRows).length} · writes remain locked until proof passes
                </p>
              </div>
            ) : (
              <>
                <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.15em] text-white/60">
                      Gross value safely linked
                    </p>
                    <p className="mt-2 text-4xl font-semibold tracking-[-0.055em] tabular-nums md:text-[52px] md:leading-none">
                      {formatInr(matchedValue, true)}
                    </p>
                    <p className="mt-3 text-sm text-white/55">
                      {run.metrics.autoMatches} of {run.metrics.targets} targets verified for close
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-3xl font-semibold tracking-[-0.04em] text-[#b7ffca] tabular-nums">
                      {formatPercent(run.metrics.safeMatchRate)}
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      {isBenchmark ? 'safe match rate' : 'operational close rate'}
                    </p>
                  </div>
                </div>
                <div className="mt-7 overflow-hidden rounded-full bg-white/10">
                  <div className="flex h-2 w-full">
                    <span
                      className="bg-[#8df5a8]"
                      style={{ width: `${run.metrics.safeMatchRate * 100}%` }}
                    />
                    <span className="flex-1 bg-[#e5a241]" />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-white/60">
                  <span>{run.metrics.autoMatches} verified</span>
                  <span>{run.metrics.unresolved} abstained</span>
                </div>
              </>
            )}
          </div>
        </div>
        <aside className="border-t border-white/10 bg-white/[0.035] p-6 lg:border-l lg:border-t-0 md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-white/60">Verifier result</p>
              <p className="mt-1 font-medium">
                {passedInvariants === run.certificate.invariants.length
                  ? 'All safe-write gates passed'
                  : `${passedInvariants} of ${run.certificate.invariants.length} safe-write gates passed`}
              </p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl border border-[#b7ffca]/15 bg-[#b7ffca]/10 text-[#b7ffca]">
              <Fingerprint className="size-5" />
            </span>
          </div>
          <div className="mt-6 space-y-3">
            {run.certificate.invariants.map((invariant) => (
              <div className="flex items-center gap-3" key={invariant.name}>
                <span className={`grid size-5 place-items-center rounded-full ${invariant.passed ? 'bg-[#8df5a8]/15 text-[#aef8bf]' : 'bg-[#e5a241]/15 text-[#f4bd69]'}`}>
                  {invariant.passed ? <Check className="size-3" /> : <AlertCircle className="size-3" />}
                </span>
                <span className="text-sm text-white/75">{invariant.name}</span>
                <span className={`ml-auto text-[10px] uppercase tracking-wider ${invariant.passed ? 'text-[#aef8bf]' : 'text-[#f4bd69]'}`}>
                  {invariant.passed ? 'Pass' : 'Hold'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-lg border border-[#e5a241]/15 bg-[#e5a241]/10 p-3">
            <div className="flex items-start gap-2">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#f4bd69]" />
              <p className="text-xs leading-5 text-white/60">
                {run.metrics.unresolved} targets worth {formatInr(run.cash.unresolvedExposurePaise)} remain write-blocked.
              </p>
            </div>
          </div>
        </aside>
      </section>

      {isBenchmark ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard detail={`${run.metrics.correctAutoMatches} correct / ${run.metrics.autoMatches} auto-matches`} icon={BadgeCheck} label="Auto-match precision" tone="green" value={formatPercent(run.metrics.autoMatchPrecision, 0)} />
          <MetricCard detail="Correct matches / all targets" icon={Gauge} label="Safe match rate" tone="green" value={formatPercent(run.metrics.safeMatchRate)} />
          <MetricCard detail="₹-weighted, hard rows included" icon={WalletCards} label="Value coverage" value={formatPercent(run.metrics.valueWeightedCoverage)} />
          <MetricCard detail={`${run.metrics.unresolved} / ${run.metrics.unresolved} injected breaks found`} icon={TriangleAlert} label="Exception recall" tone="amber" value={formatPercent(run.metrics.exceptionRecall, 0)} />
          <MetricCard detail="Financially unsafe writes" icon={ShieldCheck} label="False auto-closes" tone="green" value={String(run.metrics.falseAutoCloses)} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard detail={`${run.metrics.autoMatches} verified / ${run.metrics.targets} targets`} icon={Gauge} label="Operational close rate" tone="green" value={formatPercent(run.metrics.safeMatchRate)} />
          <MetricCard detail="Verified target value / total target value" icon={WalletCards} label="Value reconciled" value={formatPercent(run.metrics.valueWeightedCoverage)} />
          <MetricCard detail="Every accepted row has a recorded disposition" icon={Layers3} label="Rows classified" tone={run.dispositions.some((item) => item.disposition === 'unclassified') ? 'amber' : 'green'} value={`${run.dispositions.filter((item) => item.disposition !== 'unclassified').length}/${run.metrics.sourceRows}`} />
          <MetricCard detail="Only complete settlements can post" icon={ReceiptText} label="Balanced journals" tone="green" value={String(run.journals.filter((journal) => journal.balanced).length)} />
          <MetricCard detail="Accuracy remains benchmark-only" icon={ShieldCheck} label="Verifier invariants" tone={passedInvariants === run.certificate.invariants.length ? 'green' : 'amber'} value={`${passedInvariants}/${run.certificate.invariants.length}`} />
        </div>
      )}

      <SourceFlow run={run} />

      <div className="grid gap-5 xl:grid-cols-[1.06fr_0.94fr]">
        <section className="rounded-xl border border-[#dce2db] bg-white p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#5e6c64]">Cash position</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">Bank balance, explained</h2>
            </div>
            <Badge variant="outline" className="border-[#d5ddd6] text-[#65736b]">INR · as of {cutoffDate}</Badge>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <div>
              <p className="text-[11px] text-[#5e6c64]">Opening cash</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatInr(run.cash.openingPaise, true)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 text-[11px] text-[#45755a]">
                <ArrowUp className="size-3" /> Verified settlements
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatInr(run.cash.verifiedSettlementsPaise, true)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 text-[11px] text-[#5e6c64]">
                {run.cash.otherBankMovementPaise < 0 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                Other bank movement
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatInr(run.cash.otherBankMovementPaise, true)}</p>
            </div>
            <div className="rounded-lg bg-[#edf8f0] px-3 py-2.5">
              <p className="text-[11px] text-[#4c7459]">Closing bank cash</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[#1e6538]">{formatInr(run.cash.closingBankPaise, true)}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 border-t border-[#e5e9e4] pt-5 sm:grid-cols-2">
            <div className="rounded-lg bg-[#fff8ed] p-3">
              <p className="text-[11px] text-[#9a691f]">Confirmed cash in transit</p>
              <p className="mt-1 font-semibold tabular-nums text-[#794d0b]">{formatInr(run.cash.confirmedInTransitPaise)}</p>
            </div>
            <div className="rounded-lg bg-[#fff2ec] p-3">
              <p className="text-[11px] text-[#9c5c3d]">Duplicate-credit value under review</p>
              <p className="mt-1 font-semibold tabular-nums text-[#7d4025]">{formatInr(run.cash.underReviewPaise)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#dce2db] bg-[#f8faf6] p-5 md:p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-[#eee9ff] text-[#604a9a]">
              <BrainCircuit className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f637f]">Controller answer</p>
              <p className="text-sm font-medium">“Why is reported cash short?”</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-[#4d5d54]">
            {isBenchmark
              ? 'It is not an unexplained shortfall. The gap is split between a processed settlement not yet received and a duplicate UTR credit that cannot be posted twice. The remaining four cases are record-link failures, not bank cash.'
              : `${run.journals.length} settlement journals cleared every posting gate. ${run.metrics.unresolved} targets worth ${formatInr(run.cash.unresolvedExposurePaise)} remain held back with an evidence request and next action.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {exceptionIds.map((id) => (
              <span className="rounded-md border border-[#d8dfd8] bg-white px-2 py-1 font-mono text-[10px] text-[#65736a]" key={id}>
                {id}
              </span>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-[11px] text-[#78857e]">
            <FileCheck2 className="size-3.5" /> Answer uses tool-computed totals and cites every exception target.
          </p>
        </section>
      </div>
      <p className="text-[11px] leading-5 text-[#5e6c64]">
        {isBenchmark
          ? 'Synthetic evaluation only. Precision and coverage are scored against evaluator-only truth labels; they are not production claims.'
          : 'Uploaded batch · no ground-truth labels. Operational coverage is shown here; measured precision and exception recall remain in Benchmark & audit.'}
      </p>
    </div>
  );
}

function EvidenceView({
  run,
  onSelect,
}: {
  run: CloseRun;
  onSelect: (decision: ReconciliationDecision) => void;
}) {
  const [filter, setFilter] = useState<'all' | MatchMethod>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const matches = run.decisions.filter(
    (item) =>
      item.status === 'matched' &&
      (filter === 'all' || item.method === filter) &&
      (!query ||
        item.orderId.toLowerCase().includes(query.toLowerCase()) ||
        item.ledgerRowId.toLowerCase().includes(query.toLowerCase())),
  );
  const filterOptions: Array<[typeof filter, string]> = [
    ['all', `All ${run.metrics.autoMatches}`],
    ['exact-rule', `Exact ${run.metrics.exactMatches}`],
    ['constraint-rule', `Constraint ${run.metrics.constraintMatches}`],
    ['verified-ai', `Verified AI ${run.metrics.aiAssistedMatches}`],
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-xl border border-[#dce2db] bg-white p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-[#e9f8ed] text-[#277344]">
              <Fingerprint className="size-4" />
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.025em]">Every match carries its proof</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6a776f]">
            The model only extracts a typed proposal from messy narration. Unique assignment, money arithmetic, bank receipt, and the journal gate remain deterministic.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {([
            ['Exact', run.metrics.exactMatches],
            ['Constraint', run.metrics.constraintMatches],
            ['Verified AI', run.metrics.aiAssistedMatches],
          ] as const).map(([label, count]) => (
            <div className="rounded-lg bg-[#f4f6f2] px-3 py-2" key={label}>
              <p className="text-lg font-semibold tabular-nums">{count}</p>
              <p className="text-[10px] text-[#7c8880]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#dce2db] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e1e6e0] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.map(([value, label]) => (
              <Button
                aria-pressed={filter === value}
                className={filter === value ? 'bg-[#17281f] text-white hover:bg-[#263b30]' : 'text-[#66746c]'}
                key={value}
                onClick={() => setFilter(value)}
                size="sm"
                variant={filter === value ? 'default' : 'ghost'}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="relative w-full lg:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#657269]" />
            <Input
              aria-label="Search evidence by order or row ID"
              className="h-8 border-[#dce2dc] bg-[#f9faf8] pl-8 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order or row…"
              value={query}
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f7f9f6] hover:bg-[#f7f9f6]">
              <TableHead className="pl-4 text-[11px] uppercase tracking-wider text-[#5e6c64]">ERP target</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-[#5e6c64]">Evidence chain</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-[#5e6c64]">Method</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider text-[#5e6c64]">Gross</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider text-[#5e6c64]">Confidence</TableHead>
              <TableHead><span className="sr-only">Inspect</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(expanded ? matches : matches.slice(0, 18)).map((decision) => {
              const meta = methodMeta[decision.method!];
              return (
                <TableRow key={decision.targetId}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{decision.orderId}</p>
                    <p className="font-mono text-[10px] text-[#616e66]">{decision.ledgerRowId}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#65736b]">
                      <span>{decision.gatewayRowIds[0]}</span>
                      <ChevronRight className="size-3 text-[#a0aaa3]" />
                      <span>{decision.bankRowIds[0]}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-[#59675f]">{decision.settlementId}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatInr(decision.amountPaise)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[#526159]">{formatPercent(decision.confidence, 1)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button aria-label={`Inspect ${decision.orderId}`} onClick={() => onSelect(decision)} size="icon-sm" variant="ghost">
                      <ArrowRight />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-[#e5e9e4] px-4 py-3 text-[11px] text-[#5e6c64]">
          <span>Showing {expanded ? matches.length : Math.min(matches.length, 18)} of {matches.length} verified links</span>
          {matches.length > 18 ? (
            <Button onClick={() => setExpanded((value) => !value)} size="xs" variant="ghost">
              {expanded ? 'Show first 18' : 'Show all'}
            </Button>
          ) : (
            <span>Sorted by ERP row</span>
          )}
        </div>
      </section>
    </div>
  );
}

function ExceptionsView({
  run,
  reviewed,
  onSelect,
}: {
  run: CloseRun;
  reviewed: Set<string>;
  onSelect: (decision: ReconciliationDecision) => void;
}) {
  const exceptions = run.decisions.filter((item) => item.status === 'exception');
  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-xl border border-[#efd5b1] bg-[#fffaf1] md:grid-cols-[1fr_auto]">
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-2 text-[#93570f]">
            <span className="grid size-8 place-items-center rounded-lg bg-[#ffe9c8]">
              <TriangleAlert className="size-4" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">Honest exception list</p>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#3b2b17]">
            {exceptions.length} {exceptions.length === 1 ? 'case' : 'cases'} the agent refused to guess.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7c684d]">
            Each case shows the exact failed gate, missing evidence, rupee exposure, and safest next action. Review does not silently convert an exception into a match.
          </p>
        </div>
        <div className="grid grid-cols-2 border-t border-[#efd5b1] bg-[#fff6e7] md:border-l md:border-t-0">
          <div className="min-w-36 p-5">
            <p className="text-xs text-[#92704b]">Residual exposure</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] tabular-nums text-[#6f4310]">{formatInr(run.cash.unresolvedExposurePaise, true)}</p>
          </div>
          <div className="min-w-28 border-l border-[#efd5b1] p-5">
            <p className="text-xs text-[#92704b]">Reviewed</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-[#6f4310]">{reviewed.size} / {exceptions.length}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#dce2db] bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f7f9f6] hover:bg-[#f7f9f6]">
              <TableHead className="pl-4 text-[11px] uppercase tracking-wider text-[#5e6c64]">Case</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-[#5e6c64]">Blocker</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-[#5e6c64]">Failed control</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider text-[#5e6c64]">Exposure</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-[#5e6c64]">Status</TableHead>
              <TableHead><span className="sr-only">Inspect</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exceptions.map((decision) => {
              const failedGate = decision.gates.find((gate) => !gate.passed);
              const isReviewed = reviewed.has(decision.targetId);
              return (
                <TableRow key={decision.targetId}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{decision.orderId}</p>
                    <p className="font-mono text-[10px] text-[#616e66]">{decision.targetId}</p>
                  </TableCell>
                  <TableCell className="max-w-[310px] whitespace-normal">
                    <p className="text-sm font-medium text-[#4d3823]">{decision.title}</p>
                    <p className="mt-1 line-clamp-1 text-[10px] text-[#665442]">{decision.reasonCode}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-[#8d561a]">
                      <AlertCircle className="size-3.5" /> {failedGate?.label ?? 'Evidence gate'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatInr(decision.amountPaise)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={isReviewed ? 'border-[#cfe4d4] bg-[#eff8f1] text-[#347048]' : 'border-[#edd6b9] bg-[#fff8ec] text-[#94601f]'}
                    >
                      {isReviewed ? 'Reviewed' : 'Needs owner'}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button aria-label={`Inspect exception ${decision.orderId}`} onClick={() => onSelect(decision)} size="icon-sm" variant="ghost">
                      <ArrowRight />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-[#dce2db] bg-[#f8faf7] p-4 text-sm text-[#67756d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          <span>Maker/checker policy: review records context only; a fresh evidence-backed rerun is required before posting.</span>
        </div>
        <Button
          onClick={() => downloadText('settleproof-exceptions.csv', exceptionsToCsv(run.decisions), 'text/csv')}
          size="sm"
          variant="outline"
        >
          <Download /> Export CSV
        </Button>
      </div>
    </div>
  );
}

function BenchmarkView() {
  const run = benchmarkRun;
  const regression = runSeededRegression(25);
  const stress = benchmarkArtifact.stress;
  const ablation = benchmarkArtifact.ablation;
  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-xl border border-[#dce2db] bg-white p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-[#eaf2ff] text-[#39689b]">
              <BarChart3 className="size-4" />
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.025em]">Beyond the polished demo seed</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68766e]">
            The same frozen verifier was regression-tested over 25 seeded batches and replayed across a 50k-row stress corpus. The scenario grammar and proposal replay stay fixed; amounts and operating noise vary.
          </p>
        </div>
        <Badge variant="outline" className="border-[#ccd8e4] bg-[#f5f9ff] text-[#496a8c]">Reproducible · npm run evaluate</Badge>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard detail={`${regression.rawRows.toLocaleString('en-IN')} seeded source rows`} icon={Fingerprint} label="Regression precision" tone="green" value={formatPercent(regression.precisionMean, 0)} />
        <MetricCard detail="Fixed scenarios; amounts and noise vary" icon={Gauge} label="Regression coverage" value={formatPercent(regression.coverageMean)} />
        <MetricCard detail={`${stress.durationMs.toFixed(0)} ms measured locally`} icon={Activity} label="Stress throughput" value={`${Math.round(stress.rowsPerSecond / 1000)}k/s`} />
        <MetricCard detail={`${stress.rows.toLocaleString('en-IN')} rows · ${stress.falseAutoCloses} false writes`} icon={ShieldCheck} label="Stress corpus" tone="green" value="50k+" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-xl border border-[#dce2db] bg-white p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#5e6c64]">Ablation</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.025em]">What the AI layer adds</h3>
            </div>
            <Badge className="bg-[#f1edff] text-[#604a99]">+{(ablation.incrementalCoverage * 100).toFixed(1)} pts</Badge>
          </div>
          <div className="mt-7 space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Rules + constraints only</span>
                <span className="font-semibold tabular-nums">{formatPercent(ablation.rulesOnlyCoverage)}</span>
              </div>
              <Progress className="[&_[data-slot=progress-indicator]]:bg-[#6f8278] [&_[data-slot=progress-track]]:h-2" value={ablation.rulesOnlyCoverage * 100} />
              <p className="mt-2 text-[11px] text-[#5e6c64]">58 exact + 8 normalized-reference links</p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-[#6952a5]" /> Verified agent</span>
                <span className="font-semibold tabular-nums">{formatPercent(ablation.verifiedAgentCoverage)}</span>
              </div>
              <Progress className="[&_[data-slot=progress-indicator]]:bg-[#745bb7] [&_[data-slot=progress-track]]:h-2" value={ablation.verifiedAgentCoverage * 100} />
              <p className="mt-2 text-[11px] text-[#5e6c64]">Adds 12 narration proposals without lowering the 100% precision floor</p>
            </div>
          </div>
          <div className="mt-7 rounded-lg border border-[#e1d9f7] bg-[#f8f5ff] p-4">
            <p className="text-sm font-medium text-[#514078]">The model proposes; the verifier closes.</p>
            <p className="mt-1 text-xs leading-5 text-[#74688c]">
              Replay mode keeps the demo deterministic and key-free. It reuses structured narration proposals; all arithmetic, uniqueness, timing, bank, and posting gates execute live.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-[#dce2db] bg-[#f8faf7] p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#5e6c64]">Metric contract</p>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.025em]">Denominators, not vibes</h3>
          <div className="mt-5 space-y-4">
            {[
              ['Auto-match precision', 'correct auto-matches ÷ all auto-matches', '78 ÷ 78'],
              ['Safe match rate', 'correct auto-matches ÷ all targets', '78 ÷ 84'],
              ['Exception recall', 'correctly surfaced breaks ÷ injected breaks', '6 ÷ 6'],
              ['Value coverage', 'correctly closed ₹ ÷ total target ₹', formatPercent(run.metrics.valueWeightedCoverage)],
            ].map(([name, formula, result]) => (
              <div className="border-b border-[#e0e5df] pb-4 last:border-0 last:pb-0" key={name}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{name}</p>
                  <code className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-[#40534a]">{result}</code>
                </div>
                <p className="mt-1 text-[11px] text-[#5e6c64]">{formula}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-[#dce2db] bg-white p-5">
          <div className="flex items-center gap-2">
            <FileJson className="size-4 text-[#50635a]" />
            <h3 className="font-semibold">Machine-readable proof packet</h3>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {['metrics.json', 'exceptions.csv', 'matches.jsonl', 'dispositions.jsonl', 'run_manifest.json', 'close_certificate.json'].map((file) => (
              <div className="rounded-lg border border-[#e0e5df] bg-[#fafbf9] px-3 py-2 font-mono text-[10px] text-[#65736b]" key={file}>{file}</div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-[#e9d9c0] bg-[#fffbf4] p-5">
          <div className="flex items-center gap-2 text-[#81551e]">
            <HelpCircle className="size-4" />
            <h3 className="font-semibold">Limits stated up front</h3>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#806d54]">
            The corpus is synthetic, the narration model is replayed for reproducibility, and the benchmark does not claim production performance. Live gateway ingestion, model-provider evaluation, and human approval are adapter boundaries—not silently simulated here.
          </p>
        </section>
      </div>
    </div>
  );
}

function DecisionDialog({
  decision,
  run,
  isReviewed,
  onClose,
  onReview,
}: {
  decision: ReconciliationDecision | null;
  run: CloseRun;
  isReviewed: boolean;
  onClose: () => void;
  onReview: (targetId: string) => void;
}) {
  const journal = decision
    ? run.journals.find((item) => item.settlementId === decision.settlementId)
    : null;
  return (
    <Dialog open={Boolean(decision)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0 sm:max-w-2xl">
        {decision && (
          <>
            <DialogHeader className="border-b border-[#e1e6e0] p-5 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={decision.status === 'matched' ? 'bg-[#e8f9ec] text-[#246c3d]' : 'bg-[#fff2dd] text-[#955a13]'}
                >
                  {decision.status === 'matched' ? <CheckCircle2 /> : <TriangleAlert />}
                  {decision.status === 'matched' ? 'Verified match' : 'Posting blocked'}
                </Badge>
                <span className="font-mono text-[10px] text-[#616e66]">{decision.targetId}</span>
              </div>
              <DialogTitle className="mt-3 text-xl tracking-[-0.025em]">{decision.title}</DialogTitle>
              <DialogDescription>{decision.explanation}</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 p-5">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-[#e0e5df] bg-[#fafbf9] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#616e66]">ERP evidence</p>
                  <p className="mt-2 text-sm font-medium">{decision.ledgerRowId}</p>
                  <p className="mt-1 text-xs tabular-nums text-[#68766e]">{formatInr(decision.amountPaise)}</p>
                </div>
                <div className="rounded-lg border border-[#e0e5df] bg-[#fafbf9] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#616e66]">Gateway evidence</p>
                  <p className="mt-2 truncate text-sm font-medium">{decision.gatewayRowIds.join(', ') || 'Missing'}</p>
                  <p className="mt-1 text-xs text-[#68766e]">{decision.settlementId}</p>
                </div>
                <div className="rounded-lg border border-[#e0e5df] bg-[#fafbf9] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#616e66]">Bank evidence</p>
                  <p className="mt-2 truncate text-sm font-medium">{decision.bankRowIds.join(', ') || 'Missing'}</p>
                  <p className="mt-1 text-xs text-[#68766e]">Unique UTR required</p>
                </div>
              </div>

              {decision.modelProposal && (
                <div className="rounded-lg border border-[#ded6f4] bg-[#f7f4ff] p-4">
                  <div className="flex items-center gap-2 text-[#604a97]">
                    <Sparkles className="size-4" />
                    <p className="text-xs font-semibold uppercase tracking-[0.11em]">Model proposal</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#665b7b]">{decision.modelProposal}</p>
                </div>
              )}

              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5e6c64]">Control gates</p>
                <div className="mt-3 overflow-hidden rounded-lg border border-[#e0e5df]">
                  {decision.gates.map((gate, index) => (
                    <div className={`flex items-start gap-3 px-3 py-3 ${index > 0 ? 'border-t border-[#e6eae5]' : ''}`} key={gate.label}>
                      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${gate.passed ? 'bg-[#e7f8eb] text-[#277443]' : 'bg-[#fff0df] text-[#a15e13]'}`}>
                        {gate.passed ? <Check className="size-3" /> : <AlertCircle className="size-3" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{gate.label}</p>
                        <p className="mt-0.5 text-xs text-[#5e6c64]">{gate.detail}</p>
                      </div>
                      <Badge variant="outline" className={`ml-auto ${gate.passed ? 'border-[#d6e9da] text-[#39734c]' : 'border-[#efd7b9] text-[#9b621e]'}`}>
                        {gate.passed ? 'Pass' : 'Fail'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>

              {decision.status === 'exception' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-[#fff5e8] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9b641f]">Missing evidence</p>
                    <p className="mt-2 text-sm leading-5 text-[#71522e]">{decision.missingEvidence}</p>
                  </div>
                  <div className="rounded-lg bg-[#f3f6f2] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#66766d]">Safest next action</p>
                    <p className="mt-2 text-sm leading-5 text-[#4f5e56]">{decision.nextAction}</p>
                  </div>
                </div>
              ) : journal ? (
                <section>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5e6c64]">Balanced settlement journal</p>
                    <Badge className="bg-[#e8f9ec] text-[#276e3f]"><Check /> Balanced to paise</Badge>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-lg border border-[#e0e5df]">
                    {journal.lines.map((line) => (
                      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-[#e8ebe7] px-3 py-2.5 text-xs last:border-0" key={line.account}>
                        <span>{line.account}</span>
                        <span className="w-24 text-right tabular-nums text-[#4e6257]">{line.debitPaise ? `Dr ${formatInr(line.debitPaise)}` : '—'}</span>
                        <span className="w-24 text-right tabular-nums text-[#4e6257]">{line.creditPaise ? `Cr ${formatInr(line.creditPaise)}` : '—'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <DialogFooter className="mx-0 mb-0 px-5">
              {decision.status === 'exception' ? (
                <Button
                  disabled={isReviewed}
                  onClick={() => onReview(decision.targetId)}
                  className={isReviewed ? '' : 'bg-[#17281f] text-white'}
                >
                  {isReviewed ? <Check /> : <FileCheck2 />}
                  {isReviewed ? 'Marked reviewed' : 'Mark reviewed'}
                </Button>
              ) : (
                <Button onClick={onClose} variant="outline">Close proof</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [run, setRun] = useState<CloseRun>(benchmarkRun);
  const [view, setView] = useState<View>('overview');
  const [phase, setPhase] = useState<Phase>('complete');
  const [stage, setStage] = useState(3);
  const [selected, setSelected] = useState<ReconciliationDecision | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importSession, setImportSession] = useState<ImportedCloseSession | null>(null);

  const isImported = Boolean(importSession);
  const cutoffDate = importSession?.manifest.cutoffDate ?? '2026-08-31';
  const exceptionCount = run.decisions.filter(
    (item) => item.status === 'exception',
  ).length;

  const replay = async () => {
    if (phase === 'running') return;
    setView('overview');
    setPhase('running');
    for (let index = 0; index < pipelineSteps(run.metrics.sourceRows).length; index += 1) {
      setStage(index);
      await new Promise((resolve) => setTimeout(resolve, 420));
    }
    if (importSession) {
      const nextRun = runImportedClose(
        {
          ledger: run.batch.ledger,
          gateway: run.batch.gateway,
          bank: run.batch.bank,
        },
        {
          id: run.batch.id,
          period: run.batch.period,
          generatedAt: new Date().toISOString(),
          cutoffDate: importSession.manifest.cutoffDate,
          openingCashPaise: importSession.manifest.openingCashPaise,
        },
      );
      setRun(nextRun);
      setImportSession({ ...importSession, run: nextRun });
    } else {
      setRun(runClose());
    }
    setPhase('complete');
  };

  const returnToBenchmark = () => {
    setRun(runClose());
    setImportSession(null);
    setReviewed(new Set());
    setSelected(null);
    setView('overview');
    setStage(3);
  };

  const exportPacket = () => {
    downloadText(
      `settleproof-${run.batch.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-proof-packet.json`,
      JSON.stringify(
        {
          mode: isImported ? 'browser-local-import' : 'synthetic-benchmark',
          manifest: importSession?.manifest ?? manifestArtifact,
          inputs: {
            ledger: run.batch.ledger,
            gateway: run.batch.gateway,
            bank: run.batch.bank,
          },
          metrics: run.metrics,
          evaluationDisclosure: isImported
            ? 'No independent truth labels were supplied. Precision, recall, and false-close counts are intentionally unscored for this imported batch.'
            : 'Scored against evaluator-only synthetic truth labels.',
          benchmark: benchmarkArtifact,
          certificate: run.certificate,
          decisions: run.decisions,
          journals: run.journals,
          dispositions: run.dispositions,
        },
        null,
        2,
      ),
      'application/json',
    );
  };

  const selectedIsReviewed = selected ? reviewed.has(selected.targetId) : false;
  return (
    <main className="min-h-screen bg-[#f1f3ee] text-[#14231c]">
      <div className="grid min-h-screen lg:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="hidden min-h-screen flex-col bg-[#101a16] p-5 text-white lg:flex">
          <div className="flex items-center gap-3 border-b border-white/10 pb-6">
            <span className="grid size-9 place-items-center rounded-xl bg-[#b7ffca] text-[#0e2017] shadow-[0_0_30px_rgba(183,255,202,0.15)]">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="font-semibold tracking-[-0.025em]">SettleProof</p>
              <p className="text-[10px] uppercase tracking-[0.17em] text-white/60">Finance controller</p>
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-white/60">Close window</span>
              <span className="size-1.5 rounded-full bg-[#86f4a4] shadow-[0_0_10px_#86f4a4]" />
            </div>
            <p className="mt-1 text-sm font-medium">Through {cutoffDate}</p>
            <p className="mt-0.5 text-[10px] text-white/60">{isImported ? 'Imported local batch' : 'Aurelia Commerce'} · INR</p>
          </div>
          <nav aria-label="Workspace views" className="mt-5 space-y-1">
            {navItems.map(({ value, label, icon: Icon }) => (
              <Button
                aria-pressed={view === value}
                className={`h-10 w-full justify-start gap-3 px-3 ${view === value ? 'bg-white/10 text-white hover:bg-white/14' : 'text-white/65 hover:bg-white/5 hover:text-white/85'}`}
                key={value}
                onClick={() => setView(value)}
                variant="ghost"
              >
                <Icon className={view === value ? 'text-[#b7ffca]' : ''} />
                {label}
                {value === 'exceptions' && (
                  <span className="ml-auto rounded-full bg-[#e8a64a]/15 px-1.5 py-0.5 text-[10px] text-[#f1bd72]">{exceptionCount}</span>
                )}
              </Button>
            ))}
          </nav>
          <div className="mt-auto space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2 text-[#b7ffca]">
                <ShieldCheck className="size-4" />
                <p className="text-xs font-medium">Zero-false-close policy</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/65">The agent may propose a match. Only the verifier can post it.</p>
            </div>
            <p className="px-1 text-[9px] uppercase tracking-[0.14em] text-white/55">
              {isImported ? 'Browser-local import · v1.4.0' : 'Synthetic benchmark · v1.3.0'}
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#dce2db] bg-[#f7f9f5]/90 px-4 backdrop-blur-xl md:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#14241d] text-[#b7ffca] lg:hidden">
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-[#6f7d75]">{isImported ? 'Imported workspace' : 'Aurelia Commerce'}</p>
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{isImported ? `${run.batch.period} settlement close` : 'August settlement close'}</p>
                  <span className="hidden items-center gap-1 text-[10px] text-[#5e8c6b] sm:flex"><span className="size-1.5 rounded-full bg-[#45a966]" /> {run.certificate.status === 'BLOCKED' ? 'Safe hold' : 'Proof issued'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden border-[#ced7cf] bg-white text-[#68756d] md:inline-flex">
                {isImported ? <><LockKeyhole /> Local import</> : 'Seed 260831'}
              </Badge>
              <Button onClick={exportPacket} size="sm" variant="outline" className="border-[#ced7cf] bg-white">
                <Download /> <span className="hidden sm:inline">Export proof packet</span><span className="sm:hidden">Export</span>
              </Button>
            </div>
          </header>

          <div className="mx-auto max-w-[1360px] px-4 py-6 md:px-7 md:py-8">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#627067]">
                  <span className="size-2 rounded-full bg-[#54ae70]" /> Proof-carrying close
                </div>
                <h1 className="text-3xl font-semibold tracking-[-0.047em] md:text-[38px] md:leading-[1.08]">
                  Every rupee accounted for.
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68766e]">
                  {isImported
                    ? 'Your files were normalized and reconciled locally. Operational coverage is shown without pretending unlabeled data has measured accuracy.'
                    : 'Three-way settlement reconciliation with measured accuracy, deterministic posting gates, and no hidden exceptions.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden text-right sm:block">
                  <p className="text-[10px] uppercase tracking-wider text-[#616e66]">Last close</p>
                  <p className="mt-0.5 text-xs tabular-nums text-[#58675f]">{isImported ? cutoffDate : '31 Aug · 10:30 IST'}</p>
                </div>
                {isImported && (
                  <Button onClick={returnToBenchmark} size="sm" variant="ghost">Benchmark</Button>
                )}
                <Button
                  className="h-10 border-[#bac9bd] bg-white text-[#284237] hover:bg-[#f7faf7]"
                  disabled={phase === 'running'}
                  onClick={() => setImportOpen(true)}
                  variant="outline"
                >
                  <UploadCloud /> {isImported ? 'Load another batch' : 'Use your data'}
                </Button>
                <Button
                  className="h-10 bg-[#16271f] px-4 text-[#c6ffd4] hover:bg-[#263a30]"
                  disabled={phase === 'running'}
                  onClick={replay}
                >
                  {phase === 'running' ? <RefreshCw className="animate-spin" /> : <Play className="fill-current" />}
                  {phase === 'running'
                    ? 'Verifying…'
                    : isImported
                      ? `Re-run ${run.metrics.sourceRows}-row close`
                      : 'Replay 217-row close'}
                </Button>
              </div>
            </div>

            <Tabs onValueChange={(value) => setView(value as View)} value={view}>
              <TabsList className="mb-5 flex h-9 w-full justify-start overflow-x-auto border border-[#dce2db] bg-white p-1 lg:hidden">
                {navItems.map(({ value, label }) => (
                  <TabsTrigger className="min-w-max px-3 text-xs" key={value} value={value}>{label}</TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="overview"><CloseOverview cutoffDate={cutoffDate} phase={phase} run={run} stage={stage} /></TabsContent>
              <TabsContent value="evidence"><EvidenceView onSelect={setSelected} run={run} /></TabsContent>
              <TabsContent value="exceptions"><ExceptionsView onSelect={setSelected} reviewed={reviewed} run={run} /></TabsContent>
              <TabsContent value="benchmark"><BenchmarkView /></TabsContent>
            </Tabs>
          </div>
        </section>
      </div>

      <DecisionDialog
        decision={selected}
        isReviewed={selectedIsReviewed}
        onClose={() => setSelected(null)}
        onReview={(targetId) => {
          setReviewed((current) => new Set(current).add(targetId));
        }}
        run={run}
      />
      <ImportCloseDialog
        onComplete={(session) => {
          setImportSession(session);
          setRun(session.run);
          setReviewed(new Set());
          setSelected(null);
          setView('overview');
          setStage(3);
        }}
        onOpenChange={setImportOpen}
        open={importOpen}
        sampleRun={benchmarkRun}
      />
    </main>
  );
}
