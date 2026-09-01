'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Fingerprint,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  buildImportManifest,
  demoBatchCsvs,
  importInput,
  normalizeImportDate,
  parseBatchPack,
  parseInrToPaise,
  parseSourceText,
  suggestedCutoff,
  templatePackJson,
  type ImportBundle,
  type ImportManifest,
  type ImportSource,
  type SourceImportResult,
} from '@/lib/importer';
import {
  formatInr,
  runImportedClose,
  type CloseRun,
} from '@/lib/reconciliation';

export interface ImportedCloseSession {
  run: CloseRun;
  manifest: ImportManifest;
  label: string;
}

interface ImportCloseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (session: ImportedCloseSession) => void;
  sampleRun: CloseRun;
}

const stepLabels = ['Files', 'Map', 'Validate', 'Close'];
const emptyBundle: ImportBundle = { ledger: null, gateway: null, bank: null };

const sourceMeta: Record<
  ImportSource,
  { label: string; detail: string; icon: typeof ReceiptText }
> = {
  ledger: {
    label: 'ERP ledger',
    detail: 'Orders, dates and booked amounts',
    icon: ReceiptText,
  },
  gateway: {
    label: 'Gateway recon',
    detail: 'Payments, settlements and deductions',
    icon: Database,
  },
  bank: {
    label: 'Bank statement',
    detail: 'Credits, debits, UTRs and narration',
    icon: Building2,
  },
};

function saveText(filename: string, content: string, type: string) {
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

function SourceCard({
  source,
  result,
  busy,
  onFile,
}: {
  source: ImportSource;
  result: SourceImportResult | null;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const meta = sourceMeta[source];
  const Icon = meta.icon;
  const errors = result?.issues.filter((issue) => issue.severity === 'error').length ?? 0;
  return (
    <article className="rounded-xl border border-[#dce2db] bg-white p-4 shadow-[0_8px_24px_rgba(20,35,28,0.035)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf6ef] text-[#286841]">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{meta.label}</h3>
            {result && (
              <Badge
                className={errors ? 'bg-[#fff0df] text-[#985711]' : 'bg-[#e8f8ec] text-[#286c40]'}
              >
                {errors ? `${errors} errors` : <><Check /> Ready</>}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[#68766e]">{meta.detail}</p>
        </div>
      </div>

      {result ? (
        <div className="mt-4 rounded-lg border border-[#e1e6e0] bg-[#f8faf7] p-3">
          <p className="truncate text-xs font-medium text-[#35483f]">{result.fileName}</p>
          <div className="mt-2 flex items-center justify-between text-[10px] text-[#66746c]">
            <span>{result.rawRowCount.toLocaleString('en-IN')} source rows</span>
            <span className="font-mono">sha256:{result.sha256.slice(0, 8)}</span>
          </div>
          <p className="mt-2 text-xs font-semibold tabular-nums text-[#315e43]">
            Control total {formatInr(result.controlTotalPaise, true)}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-[#cfd8d0] bg-[#fafbf9] px-3 py-5 text-center">
          <UploadCloud className="mx-auto size-5 text-[#6c7c73]" />
          <p className="mt-2 text-[11px] text-[#68766e]">CSV or source-specific JSON</p>
        </div>
      )}

      <label className="mt-3 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#ccd6ce] bg-white px-3 text-xs font-medium text-[#40534a] transition hover:bg-[#f2f6f1] focus-within:ring-2 focus-within:ring-[#6db581]">
        <FileSpreadsheet className="size-3.5" />
        {busy ? 'Reading…' : result ? 'Replace file' : 'Choose file'}
        <input
          accept=".csv,.json,text/csv,application/json"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
          type="file"
        />
      </label>
    </article>
  );
}

export function ImportCloseDialog({
  open,
  onOpenChange,
  onComplete,
  sampleRun,
}: ImportCloseDialogProps) {
  const [step, setStep] = useState(0);
  const [bundle, setBundle] = useState<ImportBundle>(emptyBundle);
  const [busySource, setBusySource] = useState<ImportSource | 'pack' | null>(null);
  const [fileError, setFileError] = useState('');
  const [cutoffDate, setCutoffDate] = useState('2026-08-31');
  const [openingCash, setOpeningCash] = useState('0.00');
  const [running, setRunning] = useState(false);

  const sources = useMemo(
    () => [bundle.ledger, bundle.gateway, bundle.bank].filter(
      (source): source is SourceImportResult => Boolean(source),
    ),
    [bundle],
  );
  const issues = sources.flatMap((source) =>
    source.issues.map((issue) => ({ ...issue, source: source.source })),
  );
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const allFilesPresent = sources.length === 3;
  const rawRows = sources.reduce((sum, source) => sum + source.rawRowCount, 0);
  const acceptedRows = sources.reduce((sum, source) => sum + source.rows.length, 0);
  const openingPaise = parseInrToPaise(openingCash);
  const validPolicy = Boolean(normalizeImportDate(cutoffDate)) && openingPaise !== null;
  const ready = allFilesPresent && errors.length === 0 && Boolean(importInput(bundle)) && validPolicy;

  const setSourceFile = async (source: ImportSource, file: File) => {
    setFileError('');
    if (file.size > 10 * 1024 * 1024) {
      setFileError(`${file.name} exceeds the 10 MB per-file limit.`);
      return;
    }
    setBusySource(source);
    try {
      const result = await parseSourceText(source, file.name, await file.text());
      const next = { ...bundle, [source]: result };
      setBundle(next);
      const suggestion = suggestedCutoff(next);
      if (suggestion) setCutoffDate(suggestion);
    } finally {
      setBusySource(null);
    }
  };

  const setPackFile = async (file: File) => {
    setFileError('');
    if (file.size > 25 * 1024 * 1024) {
      setFileError(`${file.name} exceeds the 25 MB JSON-pack limit.`);
      return;
    }
    setBusySource('pack');
    try {
      const next = await parseBatchPack(file.name, await file.text());
      setBundle(next);
      const suggestion = suggestedCutoff(next);
      if (suggestion) setCutoffDate(suggestion);
    } finally {
      setBusySource(null);
    }
  };

  const loadDemoFiles = async () => {
    setBusySource('pack');
    setFileError('');
    try {
      const csvs = demoBatchCsvs(sampleRun.batch);
      const next: ImportBundle = {
        ledger: await parseSourceText('ledger', 'aurelia-erp-ledger.csv', csvs.ledger),
        gateway: await parseSourceText('gateway', 'razorpay-combined-recon.csv', csvs.gateway),
        bank: await parseSourceText('bank', 'hdfc-bank-statement.csv', csvs.bank),
      };
      setBundle(next);
      setCutoffDate(suggestedCutoff(next) || '2026-08-31');
      setOpeningCash('4182630.45');
      setStep(1);
    } finally {
      setBusySource(null);
    }
  };

  const executeClose = async () => {
    const input = importInput(bundle);
    if (!input || !ready || openingPaise === null) return;
    setRunning(true);
    try {
      const manifest = await buildImportManifest(bundle, cutoffDate, openingPaise);
      await new Promise((resolve) => setTimeout(resolve, 650));
      const run = runImportedClose(input, {
        id: `IMPORT-${manifest.inputSha256.slice(0, 10).toUpperCase()}`,
        period: cutoffDate.slice(0, 7),
        generatedAt: manifest.createdAt,
        cutoffDate,
        openingCashPaise: openingPaise,
      });
      onComplete({ run, manifest, label: 'Imported local batch' });
      setStep(3);
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-x-hidden overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-[#dfe5df] bg-[#f8faf7] p-5 pr-12 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border border-[#d2e7d7] bg-[#ebf8ee] text-[#2e6d43]">
              <LockKeyhole /> Browser-local
            </Badge>
            <span className="text-[11px] text-[#65736b]">Files never leave this session</span>
          </div>
          <DialogTitle className="mt-3 text-2xl tracking-[-0.035em]">
            Close your own settlement batch
          </DialogTitle>
          <DialogDescription className="max-w-2xl leading-6">
            Import ERP, gateway and bank exports. Every row is validated, fingerprinted, and either reconciled or explicitly held back.
          </DialogDescription>
          <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Import progress">
            {stepLabels.map((label, index) => (
              <li key={label}>
                <div className={`h-1 rounded-full ${index <= step ? 'bg-[#3f9a5c]' : 'bg-[#dfe5df]'}`} />
                <p className={`mt-1.5 text-[10px] font-medium ${index === step ? 'text-[#2f6540]' : 'text-[#7b8880]'}`}>
                  {index + 1}. {label}
                </p>
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="p-5 md:p-6">
          {step === 0 && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                {(['ledger', 'gateway', 'bank'] as const).map((source) => (
                  <SourceCard
                    busy={busySource === source}
                    key={source}
                    onFile={(file) => void setSourceFile(source, file)}
                    result={bundle[source]}
                    source={source}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-[#dce2db] bg-[#f7f9f6] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Prefer one file?</p>
                  <p className="mt-1 text-xs text-[#67756d]">Import a JSON pack containing ledger, gateway and bank arrays.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => saveText('settleproof-import-template.json', templatePackJson(), 'application/json')} size="sm" variant="outline">
                    <Download /> Template
                  </Button>
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#ccd6ce] bg-white px-3 text-xs font-medium text-[#40534a] hover:bg-[#f2f6f1]">
                    <FileJson className="size-3.5" /> {busySource === 'pack' ? 'Reading…' : 'Import JSON pack'}
                    <input
                      accept=".json,application/json"
                      className="sr-only"
                      disabled={busySource !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void setPackFile(file);
                        event.target.value = '';
                      }}
                      type="file"
                    />
                  </label>
                </div>
              </div>
              <button
                className="group flex w-full items-center justify-between rounded-xl border border-[#d7d0ef] bg-[#f8f5ff] p-4 text-left transition hover:border-[#bfb2e5] hover:bg-[#f3efff] disabled:opacity-60"
                disabled={busySource !== null}
                onClick={() => void loadDemoFiles()}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-[#e9e2ff] text-[#604a98]"><ShieldCheck className="size-4" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-[#4e3c76]">Load example raw files</span>
                    <span className="mt-0.5 block text-xs text-[#776b8a]">{sampleRun.metrics.sourceRows} rows pass through this exact parser—nothing jumps back to the seed.</span>
                  </span>
                </span>
                {busySource === 'pack' ? <RefreshCw className="size-4 animate-spin text-[#6d58a2]" /> : <ArrowRight className="size-4 text-[#6d58a2] transition group-hover:translate-x-0.5" />}
              </button>
              {fileError && <p className="flex items-center gap-2 text-xs text-[#9b4f28]"><AlertCircle className="size-4" />{fileError}</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.025em]">Detected column map</h3>
                <p className="mt-1 text-sm text-[#68766e]">Canonical fields are locked to one source column. Ambiguous or missing mappings block the close.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {sources.map((source) => (
                  <section className="rounded-xl border border-[#dce2db] bg-white p-4" key={source.source}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{sourceMeta[source.source].label}</p>
                      <Badge variant="outline">{Object.keys(source.mapping).length} mapped</Badge>
                    </div>
                    <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                      {Object.entries(source.mapping).map(([canonical, original]) => (
                        <div className="flex items-center gap-2 rounded-md bg-[#f6f8f5] px-2.5 py-2 text-[10px]" key={canonical}>
                          <code className="font-semibold text-[#395044]">{original}</code>
                          <ArrowRight className="ml-auto size-3 text-[#98a49d]" />
                          <code className="text-[#66746c]">{canonical}</code>
                        </div>
                      ))}
                    </div>
                    {!source.mapping.id && <p className="mt-3 text-[10px] leading-4 text-[#7b6a51]">Row IDs will be deterministically assigned from source and line number.</p>}
                    {source.source === 'bank' && !source.mapping.kind && <p className="mt-1 text-[10px] leading-4 text-[#7b6a51]">Settlement kind will be derived from direction and UTR evidence.</p>}
                  </section>
                ))}
              </div>
              {errors.length > 0 && (
                <div className="rounded-xl border border-[#eccfae] bg-[#fff8ec] p-4">
                  <p className="text-sm font-semibold text-[#865217]">{errors.length} mapping or row errors must be fixed</p>
                  <div className="mt-2 space-y-1.5">
                    {errors.slice(0, 8).map((issue, index) => (
                      <p className="text-xs text-[#7b5b37]" key={`${issue.code}-${issue.row ?? index}`}>
                        {sourceMeta[issue.source].label}{issue.row ? ` · row ${issue.row}` : ''}: {issue.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Source rows', rawRows.toLocaleString('en-IN')],
                  ['Accepted', acceptedRows.toLocaleString('en-IN')],
                  ['Silently dropped', '0'],
                  ['Blocking errors', String(errors.length)],
                ].map(([label, value]) => (
                  <div className="rounded-xl border border-[#dce2db] bg-white p-4" key={label}>
                    <p className="text-[11px] text-[#68766e]">{label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              <section className="rounded-xl border border-[#cfe1d3] bg-[#f2faf4] p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#dcf5e2] text-[#276b40]"><Fingerprint className="size-4" /></span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#245538]">Preflight controls are locked</h3>
                    <p className="mt-1 text-xs leading-5 text-[#4f715c]">Three source hashes, column mappings, integer-paise totals and row-level validation will travel with the proof packet.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {sources.map((source) => (
                    <div className="rounded-lg border border-[#d7e8da] bg-white/70 p-3" key={source.source}>
                      <p className="text-[10px] uppercase tracking-wider text-[#66806d]">{sourceMeta[source.source].label}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">{source.rawRowCount} rows</p>
                      <p className="mt-1 font-mono text-[9px] text-[#6e7d74]">{source.sha256.slice(0, 16)}…</p>
                    </div>
                  ))}
                </div>
              </section>
              <div className="grid gap-4 rounded-xl border border-[#dce2db] bg-white p-5 md:grid-cols-2">
                <label className="text-xs font-medium text-[#536259]" htmlFor="settleproof-cutoff-date">
                  Close cutoff date
                  <Input className="mt-2" id="settleproof-cutoff-date" onChange={(event) => setCutoffDate(event.target.value)} type="date" value={cutoffDate} />
                  <span className="mt-1.5 block text-[10px] font-normal text-[#748078]">Bank rows after this date cannot authorize a posting.</span>
                </label>
                <label className="text-xs font-medium text-[#536259]" htmlFor="settleproof-opening-cash">
                  Opening bank cash (INR)
                  <Input className="mt-2" id="settleproof-opening-cash" inputMode="decimal" onChange={(event) => setOpeningCash(event.target.value)} value={openingCash} />
                  <span className="mt-1.5 block text-[10px] font-normal text-[#748078]">Optional; enter 0 when only the settlement bridge matters.</span>
                </label>
              </div>
              {rawRows < 50 && (
                <p className="flex items-center gap-2 rounded-lg border border-[#efd7b9] bg-[#fff8ed] px-3 py-2 text-xs text-[#855a25]"><AlertCircle className="size-4" />This trial is valid, but the challenge benchmark requires at least 50 source rows.</p>
              )}
              {warnings.length > 0 && <p className="text-xs text-[#7a674d]">{warnings.length} non-blocking warnings are included in the manifest.</p>}
            </div>
          )}

          {step === 3 && (
            <div className="grid min-h-64 place-items-center text-center">
              {running ? (
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e8f8ec] text-[#2d7044]"><RefreshCw className="size-6 animate-spin" /></span>
                  <h3 className="mt-4 text-lg font-semibold">Running verified close</h3>
                  <p className="mt-1 text-sm text-[#68766e]">No journal can post until every settlement gate passes.</p>
                </div>
              ) : (
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e8f8ec] text-[#2d7044]"><CheckCircle2 className="size-6" /></span>
                  <h3 className="mt-4 text-lg font-semibold">Imported batch ready</h3>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-[#dfe5df] bg-[#fafbf9] px-5 py-4 md:px-6">
          {step > 0 && step < 3 && (
            <Button disabled={running} onClick={() => setStep((current) => current - 1)} variant="ghost">
              <ArrowLeft /> Back
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button disabled={running} onClick={() => onOpenChange(false)} variant="outline">Cancel</Button>
            {step === 0 && (
              <Button className="bg-[#17281f] text-white" disabled={!allFilesPresent || busySource !== null} onClick={() => setStep(1)}>
                Review mapping <ArrowRight />
              </Button>
            )}
            {step === 1 && (
              <Button className="bg-[#17281f] text-white" disabled={!allFilesPresent || errors.length > 0} onClick={() => setStep(2)}>
                Validate batch <ArrowRight />
              </Button>
            )}
            {step === 2 && (
              <Button className="bg-[#17281f] text-[#c9ffd6]" disabled={!ready || running} onClick={() => { setStep(3); void executeClose(); }}>
                {running ? <RefreshCw className="animate-spin" /> : <ShieldCheck />}
                Run verified close
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
