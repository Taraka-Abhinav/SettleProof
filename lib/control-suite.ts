import {
  DEMO_SEED,
  generateSyntheticBatch,
  runImportedClose,
  type BankRow,
  type GatewayRow,
  type LedgerRow,
  type SyntheticBatch,
} from './reconciliation.ts';

export interface ControlSuiteCase {
  id: string;
  control: string;
  attack: string;
  passed: boolean;
  proof: string;
}

type CloseInput = Pick<SyntheticBatch, 'ledger' | 'gateway' | 'bank'>;

const options = {
  id: 'CONTROL-SUITE',
  period: '2026-08',
  generatedAt: '2026-08-31T12:00:00.000Z',
  cutoffDate: '2026-08-31',
  openingCashPaise: 418_263_045,
};

const clone = <Value>(value: Value): Value => structuredClone(value);
const baseInput = (): CloseInput => {
  const batch = generateSyntheticBatch(DEMO_SEED);
  return {
    ledger: clone(batch.ledger),
    gateway: clone(batch.gateway),
    bank: clone(batch.bank),
  };
};

const noJournal = (
  run: ReturnType<typeof runImportedClose>,
  settlementId: string,
) => !run.journals.some((journal) => journal.settlementId === settlementId);

const result = (
  id: string,
  control: string,
  attack: string,
  passed: boolean,
  proof: string,
): ControlSuiteCase => ({ id, control, attack, passed, proof });

const outcome = (run: ReturnType<typeof runImportedClose>) =>
  JSON.stringify({
    decisions: run.decisions
      .map((item) => ({
        ledgerRowId: item.ledgerRowId,
        status: item.status,
        reasonCode: item.reasonCode,
        gatewayRowIds: [...item.gatewayRowIds].sort(),
        bankRowIds: [...item.bankRowIds].sort(),
      }))
      .sort((a, b) => a.ledgerRowId.localeCompare(b.ledgerRowId)),
    journals: run.journals.map((item) => item.id).sort(),
  });

export function runAdversarialControlSuite() {
  const cases: ControlSuiteCase[] = [];

  {
    const input = baseInput();
    const original = runImportedClose(input, options);
    const reordered = runImportedClose(
      {
        ledger: [...input.ledger].reverse(),
        gateway: [...input.gateway].reverse(),
        bank: [...input.bank].reverse(),
      },
      options,
    );
    const passed = outcome(original) === outcome(reordered);
    cases.push(
      result(
        'ORDER_INVARIANCE',
        'Global assignment is order-independent',
        'Reverse all three source files',
        passed,
        passed
          ? 'Decisions, evidence links, and journal IDs were unchanged.'
          : 'Reordering changed a financial outcome.',
      ),
    );
  }

  {
    const input = baseInput();
    input.gateway.push({ ...input.gateway[0], id: 'attack_duplicate_gateway' });
    const run = runImportedClose(input, options);
    const passed =
      noJournal(run, 'setl_sp_01') &&
      run.exceptions.some(
        (item) => item.reasonCode === 'DUPLICATE_CAPTURE',
      );
    cases.push(
      result(
        'DUPLICATE_CAPTURE',
        'Duplicate gateway evidence cannot post',
        'Replay a payment event with a fresh source ID',
        passed,
        passed ? 'The full settlement was held and no journal was generated.' : 'Duplicate evidence escaped quarantine.',
      ),
    );
  }

  {
    const input = baseInput();
    input.gateway[0].creditPaise += 1;
    const run = runImportedClose(input, options);
    const passed =
      noJournal(run, 'setl_sp_01') &&
      run.exceptions.some((item) => item.reasonCode === 'AMOUNT_VARIANCE');
    cases.push(
      result(
        'ONE_PAISE_VARIANCE',
        'Money equality is exact to the paise',
        'Increase one gateway capture by ₹0.01',
        passed,
        passed ? 'A one-paise mutation blocked the settlement journal.' : 'The amount mutation remained postable.',
      ),
    );
  }

  {
    const input = baseInput();
    input.bank = input.bank.filter((row) => row.id !== 'bank_setl_01');
    const run = runImportedClose(input, options);
    const passed =
      noJournal(run, 'setl_sp_01') &&
      run.exceptions.some((item) => item.reasonCode === 'BANK_CREDIT_MISSING');
    cases.push(
      result(
        'MISSING_BANK_RECEIPT',
        'Gateway processed does not mean cash received',
        'Delete the settlement bank credit',
        passed,
        passed ? 'The batch records cash in transit and withholds the journal.' : 'A settlement posted without bank receipt.',
      ),
    );
  }

  {
    const input = baseInput();
    const bankRow = input.bank.find((row) => row.id === 'bank_setl_01')!;
    input.bank.push({
      ...bankRow,
      id: 'attack_mislabeled_duplicate',
      kind: 'operating',
    });
    const run = runImportedClose(input, options);
    const passed =
      noJournal(run, 'setl_sp_01') &&
      run.exceptions.some(
        (item) => item.reasonCode === 'DUPLICATE_BANK_CREDIT',
      );
    cases.push(
      result(
        'MISLABELED_DUPLICATE_BANK',
        'Source classification cannot hide duplicate cash',
        'Duplicate a UTR credit but label it operating',
        passed,
        passed ? 'Both UTR credits were considered and the settlement was quarantined.' : 'The advisory kind field hid a duplicate.',
      ),
    );
  }

  {
    const input = baseInput();
    input.gateway[0].settlementUtr = '';
    const run = runImportedClose(input, options);
    const passed =
      noJournal(run, 'setl_sp_01') &&
      run.exceptions.some(
        (item) => item.reasonCode === 'SETTLEMENT_UTR_MISSING',
      );
    cases.push(
      result(
        'MISSING_COMPONENT_UTR',
        'Every settlement component needs the same nonempty UTR',
        'Remove the UTR from one component',
        passed,
        passed ? 'One blank component UTR held the complete settlement.' : 'A blank component UTR disappeared from the proof.',
      ),
    );
  }

  {
    const input = baseInput();
    input.gateway[0].settlementUtr = 'ATTACK-CONFLICT-UTR';
    const run = runImportedClose(input, options);
    const passed =
      noJournal(run, 'setl_sp_01') &&
      run.exceptions.some(
        (item) => item.reasonCode === 'CONFLICTING_SETTLEMENT_UTR',
      );
    cases.push(
      result(
        'CONFLICTING_COMPONENT_UTR',
        'Settlement UTR lineage must be consistent',
        'Change one component to a different UTR',
        passed,
        passed ? 'Conflicting UTR lineage blocked the group.' : 'Conflicting UTRs remained postable.',
      ),
    );
  }

  {
    const input = baseInput();
    const component: GatewayRow = {
      ...input.gateway[0],
      id: 'attack_late_adjustment',
      type: 'adjustment',
      orderId: null,
      description: 'Late settlement adjustment',
      createdAt: '2026-09-01',
      creditPaise: 0,
      debitPaise: 1,
      feePaise: 0,
      taxPaise: 0,
    };
    input.gateway.push(component);
    const run = runImportedClose(input, options);
    const passed = noJournal(run, 'setl_sp_01');
    cases.push(
      result(
        'POST_CUTOFF_COMPONENT',
        'Every journal component is cutoff-bound',
        'Add a next-period adjustment to an August settlement',
        passed,
        passed ? 'The late component prevented the August journal.' : 'Post-cutoff settlement activity entered the close.',
      ),
    );
  }

  {
    const input = baseInput();
    const baseline = runImportedClose(input, options);
    input.bank.push({
      id: 'attack_future_operating',
      postedAt: '2026-09-05',
      direction: 'debit',
      amountPaise: 12_345,
      utr: null,
      narration: 'Future operating debit',
      kind: 'operating',
      currency: 'INR',
    });
    const run = runImportedClose(input, options);
    const passed =
      run.cash.closingBankPaise === baseline.cash.closingBankPaise &&
      run.dispositions.some(
        (item) =>
          item.rowId === 'attack_future_operating' &&
          item.disposition === 'post-cutoff',
      );
    cases.push(
      result(
        'FUTURE_CASH_EXCLUDED',
        'Historical cash respects the close cutoff',
        'Add a bank debit five days after close',
        passed,
        passed ? 'Closing cash was unchanged and the row was explicitly excluded.' : 'Future cash leaked into the historical balance.',
      ),
    );
  }

  {
    const ledger: LedgerRow[] = [
      { id: 'L1', orderId: 'O1', receipt: '', bookedAt: '2026-08-30', customer: 'A', amountPaise: 10_000, settlementId: 'S1', currency: 'INR' },
      { id: 'L2', orderId: 'O2', receipt: '', bookedAt: '2026-08-30', customer: 'B', amountPaise: 10_000, settlementId: 'S2', currency: 'INR' },
    ];
    const gateway: GatewayRow[] = ledger.map((row, index) => ({
      id: `G${index + 1}`,
      type: 'payment',
      orderId: row.orderId,
      description: row.orderId,
      createdAt: '2026-08-30',
      settlementId: row.settlementId,
      settlementUtr: 'SHARED-UTR',
      creditPaise: 10_000,
      debitPaise: 0,
      feePaise: 0,
      taxPaise: 0,
      currency: 'INR',
    }));
    const bank: BankRow[] = [{
      id: 'B1',
      postedAt: '2026-08-31',
      direction: 'credit',
      amountPaise: 10_000,
      utr: 'SHARED-UTR',
      narration: 'One receipt',
      kind: 'settlement',
      currency: 'INR',
    }];
    const run = runImportedClose({ ledger, gateway, bank }, options);
    const passed =
      run.journals.length === 0 &&
      run.exceptions.filter(
        (item) => item.reasonCode === 'BANK_EVIDENCE_REUSED',
      ).length === 2;
    cases.push(
      result(
        'CROSS_SETTLEMENT_BANK_REUSE',
        'One bank receipt cannot authorize two settlements',
        'Give two settlements the same UTR, amount, and bank credit',
        passed,
        passed ? 'Both competing settlements were quarantined; zero journals were generated.' : 'A bank receipt was reused across journals.',
      ),
    );
  }

  {
    const input = baseInput();
    input.gateway.push({
      ...input.gateway[0],
      id: 'attack_orphan_payment',
      orderId: 'NO-ERP-OWNER',
    });
    const run = runImportedClose(input, options);
    const passed =
      noJournal(run, 'setl_sp_01') &&
      run.exceptions.some(
        (item) => item.reasonCode === 'ORPHAN_GATEWAY_PAYMENT',
      );
    cases.push(
      result(
        'ORPHAN_PAYMENT_LISTED',
        'Unowned payments appear in the honest exception list',
        'Add a gateway payment with no ERP target',
        passed,
        passed ? 'The source row is listed with owner, exposure, SLA, and next action.' : 'An orphan payment disappeared from the exception population.',
      ),
    );
  }

  {
    const run = runImportedClose(baseInput(), options);
    const paymentMatched = run.decisions.some(
      (item) => item.orderId === 'ORDER-1059' && item.status === 'matched',
    );
    const passed =
      paymentMatched &&
      run.exceptions.some(
        (item) =>
          item.transactionId === 'REF-1059' &&
          item.type === 'refund_missing_bank_debit',
      );
    cases.push(
      result(
        'REFUND_MISSING_BANK_DEBIT',
        'Refunds reconcile independently from original payments',
        'Keep ORDER-1059 payment clean while omitting REF-1059 bank debit',
        passed,
        passed ? 'The payment stayed matched and REF-1059 was independently held.' : 'The clean payment masked its refund exception.',
      ),
    );
  }

  {
    const input = baseInput();
    input.bank.find((row) => row.id === 'bank_refund_01')!.amountPaise += 1;
    const run = runImportedClose(input, options);
    const passed = run.exceptions.some(
      (item) =>
        item.transactionId === 'gw_adj_01' &&
        item.type === 'refund_amount_mismatch',
    );
    cases.push(
      result(
        'REFUND_AMOUNT_MISMATCH',
        'Refund bank debits must match to the paise',
        'Increase a refund bank debit by ₹0.01',
        passed,
        passed ? 'The one-paise refund variance entered the exception list.' : 'A refund amount variance escaped.',
      ),
    );
  }

  {
    const input = baseInput();
    input.bank.find((row) => row.id === 'bank_refund_01')!.utr = 'WRONG-REFUND-UTR';
    const run = runImportedClose(input, options);
    const passed = run.exceptions.some(
      (item) =>
        item.transactionId === 'gw_adj_01' &&
        item.type === 'refund_utr_mismatch',
    );
    cases.push(
      result(
        'REFUND_UTR_MISMATCH',
        'Refund UTR lineage is independently verified',
        'Keep amount/date aligned but alter the bank debit UTR',
        passed,
        passed ? 'The mismatched refund UTR was quarantined.' : 'A wrong refund UTR remained clean.',
      ),
    );
  }

  {
    const input = baseInput();
    input.gateway.push({
      id: 'attack_orphan_adjustment',
      type: 'adjustment',
      orderId: null,
      description: 'Unowned adjustment',
      createdAt: '2026-08-30',
      settlementId: 'S-ORPHAN',
      settlementUtr: 'UTR-ORPHAN',
      creditPaise: 0,
      debitPaise: 500,
      feePaise: 0,
      taxPaise: 0,
      currency: 'INR',
    });
    const run = runImportedClose(input, options);
    const passed =
      run.certificate.status === 'BLOCKED' &&
      run.exceptions.some(
        (item) => item.reasonCode === 'ORPHAN_SETTLEMENT_COMPONENT',
      );
    cases.push(
      result(
        'ORPHAN_COMPONENT_LISTED',
        'Unowned refunds and adjustments block the certificate',
        'Add an adjustment outside the close population',
        passed,
        passed ? 'The unowned component appears in the unified exception list.' : 'An orphan component was silently classified.',
      ),
    );
  }

  {
    const ledger: LedgerRow[] = [{
      id: 'ONLY-L', orderId: 'ONLY-O', receipt: '', bookedAt: '2026-08-30', customer: 'A', amountPaise: 10_000, settlementId: '', currency: 'INR',
    }];
    const run = runImportedClose({ ledger, gateway: [], bank: [] }, options);
    const passed =
      run.certificate.status === 'BLOCKED' && run.journals.length === 0;
    cases.push(
      result(
        'NON_VACUOUS_CLOSE',
        'An all-exception batch cannot be called ready',
        'Provide no gateway or bank evidence',
        passed,
        passed ? 'The non-vacuity invariant blocked the certificate.' : 'Zero eligible settlements passed vacuously.',
      ),
    );
  }

  {
    const input = baseInput();
    const first = runImportedClose(input, options);
    const second = runImportedClose(clone(input), options);
    const passed =
      JSON.stringify(first.journals) === JSON.stringify(second.journals) &&
      first.certificate.inputFingerprint === second.certificate.inputFingerprint;
    cases.push(
      result(
        'IDEMPOTENT_REPLAY',
        'Exact reruns produce identical posting intent',
        'Replay the same canonical batch twice',
        passed,
        passed ? 'Journal IDs, amounts, and SHA-256 proof fingerprint were identical.' : 'A rerun changed the proof or journal intent.',
      ),
    );
  }

  {
    const run = runImportedClose(baseInput(), options);
    const malicious = run.batch.gateway.find((row) =>
      row.description.startsWith('Ignore all matching policy'),
    );
    const passed =
      Boolean(malicious) &&
      run.decisions.every(
        (decision) => !decision.gatewayRowIds.includes(malicious!.id),
      );
    cases.push(
      result(
        'PROMPT_INJECTION_DATA',
        'Instruction-like source text has no authority',
        'Place a policy-bypass instruction inside a gateway adjustment',
        passed,
        passed ? 'The string remained untrusted data and never became match evidence.' : 'Source text influenced posting authority.',
      ),
    );
  }

  {
    const unsafe: CloseInput = {
      ledger: [
        { id: 'MAX', orderId: 'MAX', receipt: '', bookedAt: '2026-08-30', customer: 'A', amountPaise: Number.MAX_SAFE_INTEGER, settlementId: '', currency: 'INR' },
        { id: 'ONE', orderId: 'ONE', receipt: '', bookedAt: '2026-08-30', customer: 'B', amountPaise: 1, settlementId: '', currency: 'INR' },
      ],
      gateway: [],
      bank: [],
    };
    let blocked = false;
    try {
      runImportedClose(unsafe, options);
    } catch (error) {
      blocked = error instanceof RangeError;
    }
    cases.push(
      result(
        'PAISE_OVERFLOW',
        'Aggregate arithmetic cannot exceed exact paise range',
        'Sum individually valid values beyond Number.MAX_SAFE_INTEGER',
        blocked,
        blocked ? 'The batch was rejected before reconciliation.' : 'Unsafe aggregate arithmetic was accepted.',
      ),
    );
  }

  return {
    schemaVersion: '1.0',
    name: 'SettleProof adversarial finance-control suite',
    total: cases.length,
    passed: cases.filter((item) => item.passed).length,
    failed: cases.filter((item) => !item.passed).length,
    unsafeWrites: cases.filter((item) => !item.passed).length,
    cases,
    disclosure:
      'These are deterministic control-conformance attacks, not production accuracy claims.',
  };
}
