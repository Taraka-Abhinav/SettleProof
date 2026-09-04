import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DEMO_SEED,
  closeExceptionsToCsv,
  runClose,
  runSeededRegression,
} from '../lib/reconciliation.ts';
import { runAdversarialControlSuite } from '../lib/control-suite.ts';

const projectRoot = resolve(import.meta.dirname, '..');
const artifactsDir = resolve(projectRoot, 'artifacts');
const publicProofDir = resolve(projectRoot, 'public', 'proof');
const run = runClose(DEMO_SEED);
const seededRegression = runSeededRegression(100);
const adversarialSuite = runAdversarialControlSuite();

const stressTargetRows = 50_000;
const repeats = Math.ceil(stressTargetRows / run.metrics.sourceRows);
let stressRows = 0;
let stressFalseAutoCloses = 0;
let stressExceptions = 0;
let stressRefundExceptions = 0;
let stressChargebackExceptions = 0;
let stressInvariantFailures = 0;
const latenciesMs: number[] = [];
for (let index = 0; index < 5; index += 1) runClose(DEMO_SEED + 9_000 + index);
const stressStart = performance.now();
for (let index = 0; index < repeats; index += 1) {
  const startedAt = performance.now();
  const close = runClose(DEMO_SEED + 10_000 + index);
  latenciesMs.push(performance.now() - startedAt);
  stressRows += close.metrics.sourceRows;
  stressFalseAutoCloses += close.metrics.falseAutoCloses;
  stressExceptions += close.metrics.totalExceptions;
  stressRefundExceptions += close.metrics.refundExceptions;
  stressChargebackExceptions += close.metrics.chargebackExceptions;
  stressInvariantFailures += close.certificate.invariants.filter((item) => !item.passed).length;
}
const stressDurationMs = performance.now() - stressStart;
const sortedLatencies = [...latenciesMs].sort((a, b) => a - b);
const percentile = (value: number) =>
  sortedLatencies[Math.min(sortedLatencies.length - 1, Math.ceil(sortedLatencies.length * value) - 1)];

const benchmark = {
  schemaVersion: '2.0',
  challengeBar: 'Throughput plus measured accuracy plus an honest exception list. One cherry-picked match proves nothing.',
  seededRegression,
  stress: {
    rows: stressRows,
    batches: repeats,
    durationMs: Number(stressDurationMs.toFixed(2)),
    rowsPerSecond: Math.round((stressRows / stressDurationMs) * 1000),
    falseAutoCloses: stressFalseAutoCloses,
    totalExceptions: stressExceptions,
    refundExceptions: stressRefundExceptions,
    chargebackExceptions: stressChargebackExceptions,
    invariantFailures: stressInvariantFailures,
    latencyMs: {
      min: Number(sortedLatencies[0].toFixed(3)),
      p50: Number(percentile(0.5).toFixed(3)),
      p95: Number(percentile(0.95).toFixed(3)),
      p99: Number(percentile(0.99).toFixed(3)),
      max: Number(sortedLatencies.at(-1)!.toFixed(3)),
    },
    measurementScope: 'Full runClose loop: generation, proposal replay, deterministic payment reconciliation, independent refund/chargeback allocation, posting gates, settlement and debit journals, dispositions, cash, exceptions, metrics, and certificate. CSV parsing, UI rendering, and export serialization excluded.',
  },
  ablation: {
    rulesOnlyCoverage: seededRegression.rulesOnlyCoverage,
    verifiedAgentCoverage: seededRegression.coverageMean,
    incrementalCoverage:
      seededRegression.coverageMean - seededRegression.rulesOnlyCoverage,
  },
  confusionMatrix: {
    correctAutoCloses: seededRegression.correctAutoMatches,
    unsafeAutoCloses: seededRegression.falseAutoCloses,
    correctHolds: seededRegression.correctlySurfacedExceptions,
    incorrectHolds: seededRegression.falseExceptionCount,
  },
  adversarialControls: {
    passed: adversarialSuite.passed,
    total: adversarialSuite.total,
    unsafeWrites: adversarialSuite.unsafeWrites,
  },
  disclosures: [
    'Synthetic scored benchmark; not production accuracy.',
    'Seeded runs vary amounts and operating noise within a disclosed fixed topology.',
    'Narration proposals are replayed; deterministic financial controls execute live.',
  ],
};

const engineSource = await readFile(
  resolve(projectRoot, 'lib', 'reconciliation.ts'),
  'utf8',
);
const proposalSource = await readFile(
  resolve(projectRoot, 'lib', 'ai-proposals.ts'),
  'utf8',
);
const controlSource = await readFile(resolve(projectRoot, 'lib', 'control-suite.ts'), 'utf8');
const shaSource = await readFile(resolve(projectRoot, 'lib', 'sha256.ts'), 'utf8');
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
  engineSha256: sha256(`reconciliation.ts\n${engineSource}\nai-proposals.ts\n${proposalSource}\ncontrol-suite.ts\n${controlSource}\nsha256.ts\n${shaSource}`),
  artifacts: [
    'metrics.json',
    'benchmark.json',
    'run_manifest.json',
    'exceptions.csv',
    'matches.jsonl',
    'close_certificate.json',
    'synthetic_batch.json',
    'ground_truth.json',
    'dispositions.jsonl',
    'adversarial_suite.json',
    'independent_debits.json',
    'challenge_scorecard.json',
    'benchmark_report.md',
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
      evidenceStrength: item.evidenceStrength,
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
    `${closeExceptionsToCsv(run.exceptions)}\n`,
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
  writeFile(resolve(artifactsDir, 'adversarial_suite.json'), `${JSON.stringify(adversarialSuite, null, 2)}\n`),
  writeFile(resolve(artifactsDir, 'independent_debits.json'), `${JSON.stringify({ refundChecks: run.refundChecks, chargebackChecks: run.chargebackChecks, journals: run.debitJournals }, null, 2)}\n`),
  writeFile(resolve(artifactsDir, 'challenge_scorecard.json'), `${JSON.stringify({ challengeBar: benchmark.challengeBar, benchmark, certificate: run.certificate, currentExceptions: run.exceptions }, null, 2)}\n`),
  writeFile(resolve(artifactsDir, 'benchmark_report.md'), `# SettleProof benchmark report\n\n> ${benchmark.challengeBar}\n\n- Throughput: ${benchmark.stress.rowsPerSecond.toLocaleString('en-IN')} rows/sec over ${benchmark.stress.rows.toLocaleString('en-IN')} full-loop rows; p95 ${benchmark.stress.latencyMs.p95} ms/batch.\n- Accuracy: ${seededRegression.correctAutoMatches}/${seededRegression.autoMatches} correct auto-closes across ${seededRegression.seeds} seeded batches; ${seededRegression.falseAutoCloses} unsafe auto-closes.\n- Exceptions: ${seededRegression.correctlySurfacedExceptions}/${seededRegression.injectedExceptions} injected target exceptions surfaced; refund and chargeback controls are independently counted.\n- Controls: ${adversarialSuite.passed}/${adversarialSuite.total} adversarial controls passed.\n\n${benchmark.stress.measurementScope}\n`),
]);

await mkdir(publicProofDir, { recursive: true });
await Promise.all(
  manifest.artifacts.map((fileName) =>
    copyFile(
      resolve(artifactsDir, fileName),
      resolve(publicProofDir, fileName),
    ),
  ),
);

console.log(
  JSON.stringify(
    {
      batch: run.batch.id,
      rows: run.metrics.sourceRows,
      targets: run.metrics.targets,
      safeMatchRate: run.metrics.safeMatchRate,
      precision: run.metrics.autoMatchPrecision,
      exceptions: run.metrics.totalExceptions,
      falseAutoCloses: run.metrics.falseAutoCloses,
      stress: benchmark.stress,
      artifacts: artifactsDir,
    },
    null,
    2,
  ),
);
