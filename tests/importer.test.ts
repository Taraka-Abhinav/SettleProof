import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImportManifest,
  demoBatchCsvs,
  importInput,
  parseInrToPaise,
  parseSourceText,
  type ImportBundle,
} from '../lib/importer.ts';
import {
  DEMO_SEED,
  exceptionsToCsv,
  runClose,
  runImportedClose,
} from '../lib/reconciliation.ts';

async function parsedDemoBundle(): Promise<ImportBundle> {
  const demo = runClose(DEMO_SEED);
  const csv = demoBatchCsvs(demo.batch);
  return {
    ledger: await parseSourceText('ledger', 'ledger.csv', csv.ledger),
    gateway: await parseSourceText('gateway', 'gateway.csv', csv.gateway),
    bank: await parseSourceText('bank', 'bank.csv', csv.bank),
  };
}

void test('CSV parsing preserves quoted commas, escaped quotes, BOM, and CRLF', async () => {
  const csv = '\uFEFForder_id,booked_at,amount_inr,customer,currency\r\n"ORD-1",2026-08-31,123.45,"Doe, ""Jane""",INR\r\n';
  const result = await parseSourceText('ledger', 'ledger.csv', csv);
  assert.equal(result.rawRowCount, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.issues.filter((issue) => issue.severity === 'error').length, 0);
  assert.equal((result.rows[0] as { customer: string }).customer, 'Doe, "Jane"');
});

void test('money normalization uses integer paise and rejects unsafe formats', () => {
  assert.equal(parseInrToPaise('₹1,234.50'), 123450);
  assert.equal(parseInrToPaise('0.01'), 1);
  assert.equal(parseInrToPaise('12.345'), null);
  assert.equal(parseInrToPaise('1e3'), null);
  assert.equal(parseInrToPaise('-10.00'), null);
});

void test('the 221-row example files traverse the real importer and preserve outcomes', async () => {
  const bundle = await parsedDemoBundle();
  const input = importInput(bundle);
  assert.ok(input);
  assert.equal(input.ledger.length + input.gateway.length + input.bank.length, 221);
  const run = runImportedClose(input, {
    id: 'IMPORT-DEMO',
    period: '2026-08',
    generatedAt: '2026-08-31T12:00:00.000Z',
    cutoffDate: '2026-08-31',
    openingCashPaise: 418_263_045,
  });
  assert.equal(run.metrics.evaluationMode, 'operational');
  assert.equal(run.metrics.autoMatches, 78);
  assert.equal(run.metrics.unresolved, 6);
  assert.equal(run.journals.length, 9);
  assert.equal(run.certificate.status, 'READY_WITH_EXCEPTIONS');
  assert.ok(run.certificate.invariants.every((invariant) => invariant.passed));
});

void test('imported data never receives synthetic precision or recall claims', async () => {
  const input = importInput(await parsedDemoBundle());
  assert.ok(input);
  const run = runImportedClose(input, {
    id: 'IMPORT-UNLABELED',
    period: '2026-08',
    generatedAt: '2026-08-31T12:00:00.000Z',
    cutoffDate: '2026-08-31',
  });
  assert.equal(run.metrics.evaluationMode, 'operational');
  assert.equal(run.metrics.autoMatchPrecision, null);
  assert.equal(run.metrics.matchRecall, null);
  assert.equal(run.metrics.exceptionRecall, null);
  assert.equal(run.metrics.operationalCloseRate, 78 / 84);
});

void test('invalid rows are blocked and counted instead of silently discarded', async () => {
  const csv = [
    'row_id,order_id,booked_at,amount_inr,currency',
    'L-1,ORDER-1,2026-08-31,100.00,INR',
    'L-1,=SUM(A1:A2),08/09/2026,10.999,USD',
  ].join('\n');
  const result = await parseSourceText('ledger', 'unsafe.csv', csv);
  assert.equal(result.rawRowCount, 2);
  assert.equal(result.rows.length, 1);
  assert.ok(result.issues.some((issue) => issue.code === 'DUPLICATE_ID'));
  assert.ok(result.issues.some((issue) => issue.code === 'FORMULA_LIKE_VALUE'));
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_AMOUNT'));
  assert.ok(result.issues.some((issue) => issue.code === 'UNSUPPORTED_CURRENCY'));
});

void test('missing settlement UTR becomes a financial exception', async () => {
  const input = importInput(await parsedDemoBundle());
  assert.ok(input);
  input.gateway
    .filter((row) => row.settlementId === 'setl_sp_01')
    .forEach((row) => { row.settlementUtr = ''; });
  const run = runImportedClose(input, {
    id: 'IMPORT-MISSING-UTR',
    period: '2026-08',
    generatedAt: '2026-08-31T12:00:00.000Z',
    cutoffDate: '2026-08-31',
  });
  assert.ok(
    run.decisions
      .filter((decision) => decision.settlementId === 'setl_sp_01')
      .every((decision) => decision.reasonCode === 'SETTLEMENT_UTR_MISSING'),
  );
});

void test('an orphan gateway payment prevents a partial settlement journal', async () => {
  const input = importInput(await parsedDemoBundle());
  assert.ok(input);
  input.gateway.push({
    ...input.gateway.find((row) => row.id === 'gw_001')!,
    id: 'orphan_gateway_payment',
    orderId: 'NO-ERP-TARGET',
  });
  const run = runImportedClose(input, {
    id: 'IMPORT-ORPHAN',
    period: '2026-08',
    generatedAt: '2026-08-31T12:00:00.000Z',
    cutoffDate: '2026-08-31',
  });
  assert.ok(!run.journals.some((journal) => journal.settlementId === 'setl_sp_01'));
  assert.equal(run.certificate.status, 'BLOCKED');
  assert.ok(run.dispositions.some((item) => item.rowId === 'orphan_gateway_payment' && item.disposition === 'unclassified'));
});

void test('import manifest binds file hashes, mappings, counts, and canonical input', async () => {
  const bundle = await parsedDemoBundle();
  const manifest = await buildImportManifest(bundle, '2026-08-31', 0);
  assert.match(manifest.inputSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.sources.length, 3);
  assert.equal(manifest.sourceRows, 221);
  assert.equal(manifest.acceptedRows, 221);
  assert.equal(manifest.rejectedRows, 0);
  assert.ok(manifest.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)));
});

void test('imported target and journal IDs remain stable when rows are reordered', async () => {
  const input = importInput(await parsedDemoBundle());
  assert.ok(input);
  const options = {
    id: 'IMPORT-STABLE',
    period: '2026-08',
    generatedAt: '2026-08-31T12:00:00.000Z',
    cutoffDate: '2026-08-31',
  };
  const original = runImportedClose(input, options);
  const reordered = runImportedClose(
    {
      ledger: [...input.ledger].reverse(),
      gateway: [...input.gateway].reverse(),
      bank: [...input.bank].reverse(),
    },
    options,
  );
  assert.deepEqual(
    original.decisions.map((item) => item.targetId).sort(),
    reordered.decisions.map((item) => item.targetId).sort(),
  );
  assert.deepEqual(
    original.journals.map((item) => item.id).sort(),
    reordered.journals.map((item) => item.id).sort(),
  );
});

void test('exception CSV neutralizes spreadsheet formulas', () => {
  const run = runClose(DEMO_SEED);
  const decision = run.decisions.find((item) => item.status === 'exception')!;
  const csv = exceptionsToCsv([{ ...decision, orderId: '=HYPERLINK("bad")' }]);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
});
