import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DEMO_SEED,
  evaluateDecisions,
  exceptionsToCsv,
  generateSyntheticBatch,
  reconcileBatch,
  runClose,
  runSeededRegression,
} from '../lib/reconciliation.ts';

const projectRoot = resolve(import.meta.dirname, '..');
const artifactsDir = resolve(projectRoot, 'artifacts');
const run = runClose(DEMO_SEED);
const seededRegression = runSeededRegression(25);

const stressTargetRows = 50_000;
const repeats = Math.ceil(stressTargetRows / run.metrics.sourceRows);
let stressRows = 0;
let stressFalseAutoCloses = 0;
const stressStart = performance.now();
for (let index = 0; index < repeats; index += 1) {
  const batch = generateSyntheticBatch(DEMO_SEED + 10_000 + index);
  const decisions = reconcileBatch(batch);
  const evaluation = evaluateDecisions(batch, decisions, 1);
  stressRows += evaluation.sourceRows;
  stressFalseAutoCloses += evaluation.falseAutoCloses;
}
const stressDurationMs = performance.now() - stressStart;

const benchmark = {
  schemaVersion: '1.0',
  seededRegression,
  stress: {
    rows: stressRows,
    batches: repeats,
    durationMs: Number(stressDurationMs.toFixed(2)),
    rowsPerSecond: Math.round((stressRows / stressDurationMs) * 1000),
    falseAutoCloses: stressFalseAutoCloses,
  },
  ablation: {
    rulesOnlyCoverage: seededRegression.rulesOnlyCoverage,
    verifiedAgentCoverage: seededRegression.coverageMean,
    incrementalCoverage:
      seededRegression.coverageMean - seededRegression.rulesOnlyCoverage,
  },
};

const engineSource = await readFile(
  resolve(projectRoot, 'lib', 'reconciliation.ts'),
  'utf8',
);
const proposalSource = await readFile(
  resolve(projectRoot, 'lib', 'ai-proposals.ts'),
  'utf8',
);
const sourcePayload = JSON.stringify({
  ledger: run.batch.ledger,
  gateway: run.batch.gateway,
  bank: run.batch.bank,
});
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const metricsArtifact = {
  schemaVersion: '1.0',
  batchId: run.batch.id,
  seed: run.batch.seed,
  syntheticOnly: true,
  formulas: {
    autoMatchPrecision: 'correct auto-matches / all auto-matches',
    matchRecall: 'correct auto-matches / all truly matchable targets',
    safeMatchRate: 'correct auto-matches / all reconciliation targets',
    valueWeightedCoverage: 'correctly auto-closed INR / total target INR',
    exceptionRecall: 'correctly surfaced injected exceptions / all injected exceptions',
  },
  result: run.metrics,
  seededRegression,
};

const manifest = {
  schemaVersion: '1.0',
  batchId: run.batch.id,
  seed: run.batch.seed,
  generatedAt: run.batch.generatedAt,
  runtime: process.version,
  policyVersion: run.certificate.policyVersion,
  agentMode: run.certificate.agentMode,
  inputSha256: sha256(sourcePayload),
  engineSha256: sha256(`${engineSource}\n${proposalSource}`),
  artifacts: [
    'metrics.json',
    'benchmark.json',
    'exceptions.csv',
    'matches.jsonl',
    'close_certificate.json',
    'synthetic_batch.json',
    'ground_truth.json',
    'dispositions.jsonl',
  ],
};

const matchesJsonl = run.decisions
  .filter((item) => item.status === 'matched')
  .map((item) =>
    JSON.stringify({
      targetId: item.targetId,
      ledgerRowId: item.ledgerRowId,
      gatewayRowIds: item.gatewayRowIds,
      bankRowIds: item.bankRowIds,
      settlementId: item.settlementId,
      amountPaise: item.amountPaise,
      method: item.method,
      confidence: item.confidence,
      gates: item.gates,
    }),
  )
  .join('\n');
const dispositionsJsonl = run.dispositions
  .map((item) => JSON.stringify(item))
  .join('\n');

await mkdir(artifactsDir, { recursive: true });
await Promise.all([
  writeFile(
    resolve(artifactsDir, 'metrics.json'),
    `${JSON.stringify(metricsArtifact, null, 2)}\n`,
  ),
  writeFile(
    resolve(artifactsDir, 'benchmark.json'),
    `${JSON.stringify(benchmark, null, 2)}\n`,
  ),
  writeFile(
    resolve(artifactsDir, 'run_manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
  writeFile(
    resolve(artifactsDir, 'close_certificate.json'),
    `${JSON.stringify(run.certificate, null, 2)}\n`,
  ),
  writeFile(
    resolve(artifactsDir, 'exceptions.csv'),
    `${exceptionsToCsv(run.decisions)}\n`,
  ),
  writeFile(resolve(artifactsDir, 'matches.jsonl'), `${matchesJsonl}\n`),
  writeFile(
    resolve(artifactsDir, 'dispositions.jsonl'),
    `${dispositionsJsonl}\n`,
  ),
  writeFile(
    resolve(artifactsDir, 'synthetic_batch.json'),
    `${JSON.stringify(
      {
        id: run.batch.id,
        seed: run.batch.seed,
        period: run.batch.period,
        ledger: run.batch.ledger,
        gateway: run.batch.gateway,
        bank: run.batch.bank,
      },
      null,
      2,
    )}\n`,
  ),
  writeFile(
    resolve(artifactsDir, 'ground_truth.json'),
    `${JSON.stringify(run.batch.truth, null, 2)}\n`,
  ),
]);

console.log(
  JSON.stringify(
    {
      batch: run.batch.id,
      rows: run.metrics.sourceRows,
      targets: run.metrics.targets,
      safeMatchRate: run.metrics.safeMatchRate,
      precision: run.metrics.autoMatchPrecision,
      exceptions: run.metrics.unresolved,
      falseAutoCloses: run.metrics.falseAutoCloses,
      stress: benchmark.stress,
      artifacts: artifactsDir,
    },
    null,
    2,
  ),
);
