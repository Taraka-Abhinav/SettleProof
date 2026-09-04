import type { CloseRun } from './reconciliation.ts';

const ENCRYPTION_ITERATIONS = 310_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Base64(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(digest));
}

export function buildRedactedProof(
  run: CloseRun,
  mode: 'browser-local-import' | 'synthetic-benchmark',
) {
  return {
    schema: 'settleproof-redacted-proof/v2',
    mode,
    disclosure:
      mode === 'browser-local-import'
        ? 'Operational aggregates only; no independent truth labels, raw rows, filenames, or source identifiers are included. Aggregate amounts can still be commercially sensitive.'
        : 'Truth-scored synthetic aggregates; raw records and source identifiers are excluded.',
    metrics: {
      evaluationMode: run.metrics.evaluationMode,
      sourceRows: run.metrics.sourceRows,
      targets: run.metrics.targets,
      autoMatches: run.metrics.autoMatches,
      unresolved: run.metrics.unresolved,
      sourceExceptions: run.metrics.sourceExceptions,
      totalExceptions: run.metrics.totalExceptions,
      valueWeightedCoverage: run.metrics.valueWeightedCoverage,
      exactMatches: run.metrics.exactMatches,
      constraintMatches: run.metrics.constraintMatches,
      aiAssistedMatches: run.metrics.aiAssistedMatches,
      refundChecks: run.metrics.refundChecks,
      refundMatches: run.metrics.refundMatches,
      refundExceptions: run.metrics.refundExceptions,
      chargebackChecks: run.metrics.chargebackChecks,
      chargebackMatches: run.metrics.chargebackMatches,
      chargebackExceptions: run.metrics.chargebackExceptions,
      durationMs: run.metrics.durationMs,
      rowsPerSecond: run.metrics.rowsPerSecond,
      correctAutoMatches: run.metrics.correctAutoMatches,
      trulyMatchable: run.metrics.trulyMatchable,
      autoMatchPrecision: run.metrics.autoMatchPrecision,
      matchRecall: run.metrics.matchRecall,
      safeMatchRate: run.metrics.safeMatchRate,
      operationalCloseRate: run.metrics.operationalCloseRate,
      exceptionRecall: run.metrics.exceptionRecall,
      falseAutoCloses: run.metrics.falseAutoCloses,
      falseExceptionCount: run.metrics.falseExceptionCount,
      decisionIntegrityViolations: run.metrics.decisionIntegrityViolations,
    },
    cash: {
      openingPaise: run.cash.openingPaise,
      verifiedSettlementsPaise: run.cash.verifiedSettlementsPaise,
      verifiedRefundDebitsPaise: run.cash.verifiedRefundDebitsPaise,
      verifiedChargebackDebitsPaise: run.cash.verifiedChargebackDebitsPaise,
      otherBankMovementPaise: run.cash.otherBankMovementPaise,
      unresolvedBankMovementPaise: run.cash.unresolvedBankMovementPaise,
      closingBankPaise: run.cash.closingBankPaise,
      confirmedInTransitPaise: run.cash.confirmedInTransitPaise,
      underReviewPaise: run.cash.underReviewPaise,
      sourceExceptionExposurePaise: run.cash.sourceExceptionExposurePaise,
      unresolvedExposurePaise: run.cash.unresolvedExposurePaise,
    },
    certificate: {
      status: run.certificate.status,
      policyVersion: run.certificate.policyVersion,
      invariants: run.certificate.invariants.map((invariant) => ({
        name: invariant.name,
        passed: invariant.passed,
      })),
    },
    exceptions: run.exceptions.map((exception, index) => ({
      ref: `EXC-${String(index + 1).padStart(3, '0')}`,
      type: exception.type ?? exception.reasonCode,
      amountPaise: exception.amountPaise,
      materiality: exception.materiality,
      ownerQueue: exception.ownerQueue,
      sla: exception.sla,
    })),
  };
}

function csvCell(value: string | number) {
  const raw = String(value);
  const neutralized = /^[=+@]/.test(raw) || /^-(?!\d)/.test(raw)
    ? `'${raw}`
    : raw;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export function redactedExceptionsToCsv(run: CloseRun) {
  const header = [
    'exception_ref',
    'type',
    'amount_inr',
    'materiality',
    'owner_queue',
    'sla',
  ];
  const rows = run.exceptions.map((exception, index) => [
    `EXC-${String(index + 1).padStart(3, '0')}`,
    exception.type ?? exception.reasonCode,
    (exception.amountPaise / 100).toFixed(2),
    exception.materiality,
    exception.ownerQueue,
    exception.sla,
  ]);
  return [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

interface AuthenticatedMetadata {
  schema: 'settleproof-encrypted-export/v2';
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-HMAC-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  tagLength: 128;
  digest: 'SHA-256';
  contentType: 'application/json';
}

export interface EncryptedProofEnvelope {
  authenticatedMetadata: AuthenticatedMetadata;
  aadEncoding: 'UTF-8 JSON.stringify(authenticatedMetadata)';
  ciphertext: string;
}

async function deriveEncryptionKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  usage: KeyUsage[],
) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: ENCRYPTION_ITERATIONS,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

export async function encryptJsonWithPassphrase(
  payload: unknown,
  passphrase: string,
) {
  const encoder = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const authenticatedMetadata: AuthenticatedMetadata = {
    schema: 'settleproof-encrypted-export/v2',
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-HMAC-SHA-256',
    iterations: ENCRYPTION_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    tagLength: 128,
    digest: 'SHA-256',
    contentType: 'application/json',
  };
  const additionalData = encoder.encode(JSON.stringify(authenticatedMetadata));
  const key = await deriveEncryptionKey(passphrase, salt, ['encrypt']);
  const plaintext = encoder.encode(
    JSON.stringify({
      payloadSha256: await sha256Base64(payloadJson),
      payload,
    }),
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData,
        tagLength: authenticatedMetadata.tagLength,
      },
      key,
      plaintext,
    ),
  );
  const envelope: EncryptedProofEnvelope = {
    authenticatedMetadata,
    aadEncoding: 'UTF-8 JSON.stringify(authenticatedMetadata)',
    ciphertext: bytesToBase64(ciphertext),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptJsonWithPassphrase(
  encodedEnvelope: string,
  passphrase: string,
) {
  const envelope = JSON.parse(encodedEnvelope) as EncryptedProofEnvelope;
  const metadata = envelope.authenticatedMetadata;
  if (
    !metadata ||
    metadata.schema !== 'settleproof-encrypted-export/v2' ||
    metadata.cipher !== 'AES-256-GCM' ||
    metadata.kdf !== 'PBKDF2-HMAC-SHA-256' ||
    metadata.iterations !== ENCRYPTION_ITERATIONS ||
    metadata.tagLength !== 128 ||
    metadata.digest !== 'SHA-256' ||
    metadata.contentType !== 'application/json' ||
    envelope.aadEncoding !== 'UTF-8 JSON.stringify(authenticatedMetadata)'
  ) {
    throw new Error('Unsupported or malformed encrypted proof envelope.');
  }
  const salt = base64ToBytes(metadata.salt);
  const iv = base64ToBytes(metadata.iv);
  if (salt.length !== 16 || iv.length !== 12) {
    throw new Error('Encrypted proof salt or IV has an invalid length.');
  }
  const key = await deriveEncryptionKey(passphrase, salt, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(JSON.stringify(metadata)),
      tagLength: metadata.tagLength,
    },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as {
    payloadSha256: string;
    payload: unknown;
  };
  const actualDigest = await sha256Base64(JSON.stringify(decoded.payload));
  if (decoded.payloadSha256 !== actualDigest) {
    throw new Error('Encrypted proof payload digest mismatch.');
  }
  return decoded.payload;
}
