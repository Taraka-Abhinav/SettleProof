import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRedactedProof,
  decryptJsonWithPassphrase,
  encryptJsonWithPassphrase,
  redactedExceptionsToCsv,
} from '../lib/proof-export.ts';
import { runClose } from '../lib/reconciliation.ts';

void test('redacted proof and CSV exclude every raw identifier and free-text field', () => {
  const sentinel = 'SENTINEL-PRIVATE-IDENTIFIER';
  const run = structuredClone(runClose());
  run.batch.id = sentinel;
  run.batch.ledger[0].id = sentinel;
  run.batch.ledger[0].orderId = sentinel;
  run.batch.ledger[0].receipt = sentinel;
  run.batch.ledger[0].customer = sentinel;
  run.batch.ledger[0].settlementId = sentinel;
  run.batch.gateway[0].id = sentinel;
  run.batch.gateway[0].description = sentinel;
  run.batch.gateway[0].settlementUtr = sentinel;
  run.batch.bank[0].id = sentinel;
  run.batch.bank[0].utr = sentinel;
  run.batch.bank[0].narration = sentinel;
  run.decisions[0].explanation = sentinel;
  run.decisions[0].modelProposal = sentinel;
  run.decisions[0].gates[0].detail = sentinel;
  run.exceptions[0].id = sentinel;
  run.exceptions[0].explanation = sentinel;
  run.exceptions[0].missingEvidence = sentinel;
  run.exceptions[0].nextAction = sentinel;
  run.certificate.inputFingerprint = sentinel;
  run.certificate.invariants[0].proof = sentinel;

  const redacted = buildRedactedProof(run, 'browser-local-import');
  const encoded = JSON.stringify(redacted);
  assert.ok(!encoded.includes(sentinel));
  assert.deepEqual(Object.keys(redacted), [
    'schema',
    'mode',
    'disclosure',
    'metrics',
    'cash',
    'certificate',
    'exceptions',
  ]);
  assert.ok(redacted.exceptions.every((item) => /^EXC-\d{3}$/.test(item.ref)));

  const csv = redactedExceptionsToCsv(run);
  assert.ok(!csv.includes(sentinel));
  assert.ok(!csv.includes('order_id'));
  assert.ok(!csv.includes('settlement_utr'));
});

void test('encrypted full exports round-trip and authenticate metadata and ciphertext', async () => {
  const payload = {
    rawIdentifier: 'SENTINEL-FULL-PAYLOAD',
    amountPaise: 12_345,
  };
  const passphrase = 'correct horse battery staple';
  const first = await encryptJsonWithPassphrase(payload, passphrase);
  const second = await encryptJsonWithPassphrase(payload, passphrase);
  assert.notEqual(first, second);
  assert.deepEqual(await decryptJsonWithPassphrase(first, passphrase), payload);
  await assert.rejects(
    decryptJsonWithPassphrase(first, 'wrong passphrase value'),
  );

  const tamperedMetadata = JSON.parse(first);
  tamperedMetadata.authenticatedMetadata.contentType = 'text/plain';
  await assert.rejects(
    decryptJsonWithPassphrase(JSON.stringify(tamperedMetadata), passphrase),
  );

  const tamperedCiphertext = JSON.parse(first);
  const ciphertext = tamperedCiphertext.ciphertext as string;
  const replacement = ciphertext.at(-2) === 'A' ? 'B' : 'A';
  tamperedCiphertext.ciphertext = `${ciphertext.slice(0, -2)}${replacement}${ciphertext.slice(-1)}`;
  await assert.rejects(
    decryptJsonWithPassphrase(JSON.stringify(tamperedCiphertext), passphrase),
  );
});
