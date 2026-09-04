# SettleProof architecture

## Scope and closure boundary

SettleProof closes one loop only: ERP payments to gateway recon entries, gateway entries to settlement batches, settlement batches to bank credits, refunds and chargebacks to separate bank debits, and every verified cash event to balanced journals and an updated cash bridge.

It does not broaden autonomy into payouts, tax filing, or forecasting. Those are future consumers of the verified close, not part of this write boundary.

## Trust model

| Component | May interpret text | May calculate money | May authorize a write |
| --- | ---: | ---: | ---: |
| Replayable AI proposal provider | Yes | No | No |
| Candidate generator | Limited normalization | No | No |
| Deterministic verifier | No | Yes, integer paise only | Yes, if every gate passes |
| Evaluator | No | Scores only | No |
| Human reviewer | Adds evidence/context | No implicit posting | New evidence must be re-verified |

Source narration is always untrusted data. It can influence a typed proposal, never policy or execution.

## Data flow

1. **Generate / ingest** — ERP, gateway combined recon, and bank statement records enter separate typed collections, either from the frozen generator or browser-local CSV/JSON files.
2. **Profile** — source SHA-256 hashes, selected mappings, counts and control totals are recorded before matching.
3. **Normalize** — quoted CSV is parsed without splitting errors, references are case/spacing normalized, dates share one calendar representation, and decimal INR becomes integer paise through string arithmetic.
4. **Generate candidates** — exact identifiers first, normalized constraints second, replayed narration proposals last.
5. **Verify payments** — uniqueness, amount, date, settlement assignment, settlement equation, UTR receipt, and journal balance are checked independently of the proposal.
6. **Verify independent debits** — refunds and chargebacks enter one global allocation graph. A match requires a unique bank debit, exact paise amount, UTR lineage, debit direction, and an in-window date; bank evidence cannot be reused across event types.
7. **Commit safe subset** — a group can post only when every payment component is assigned exactly once, no component exception remains, the UTR is consistent, and the bank proof passes. Each verified settlement and independent debit receives a deterministic balanced journal ID.
8. **Escalate remainder** — every abstention records a reason code, failed gate, missing evidence, exposure, owner, SLA, and next action.
9. **Certify** — the cash bridge and close certificate contain both the safe subset and residual risk.
10. **Evaluate** — only after decisions are frozen does the evaluator read truth labels and compute precision, recall, coverage, exception recall, and false writes.

## Matching state machine

```text
UNSEEN
  ├─ unique exact/normalized reference + amount equal ──► GATEWAY_LINKED
  ├─ unique replayed narration proposal + amount/date ─► GATEWAY_LINKED
  ├─ no evidence ───────────────────────────────────────► EXCEPTION:NO_GATEWAY
  ├─ amount differs ────────────────────────────────────► EXCEPTION:AMOUNT_VARIANCE
  ├─ wrong date/settlement ─────────────────────────────► EXCEPTION:POLICY_MISMATCH
  └─ candidate count > 1 or row reused ────────────────► EXCEPTION:AMBIGUOUS_OR_DUPLICATE

GATEWAY_LINKED
  ├─ settlement equation passes + one UTR bank credit ─► BANK_VERIFIED
  ├─ no in-window bank credit ──────────────────────────► EXCEPTION:BANK_CREDIT_MISSING
  └─ bank candidate count > 1 ──────────────────────────► EXCEPTION:DUPLICATE_BANK_CREDIT

BANK_VERIFIED
  ├─ balanced idempotent journal ───────────────────────► POSTED
  └─ any invariant fails ───────────────────────────────► EXCEPTION:CONTROL_FAILURE
```

Every target terminates in exactly one of `POSTED` or `EXCEPTION`. Every accepted source row receives a disposition. There is no dropped target state.

## Money invariants

### Record conservation

All source rows receive a disposition and all 84 targets reach a terminal decision. Operating bank movements remain classified but cannot become settlement evidence.

### Settlement conservation

For each posted settlement, only settlement-funded rows (`payment` and `adjustment`) enter the equation:

```text
Σ gateway credit paise − Σ gateway debit paise = unique bank credit paise
```

Signed combined-recon credits and debits are authoritative. Separately funded `refund` and `chargeback` rows are intentionally excluded; they require their own bank debit and journal. This prevents the same refund from reducing both a settlement credit and cash a second time.

### Independent debit conservation

For each refund or chargeback:

```text
gateway debit paise = one unique bank debit paise
gateway UTR = bank UTR (when supplied)
event date ≤ bank date ≤ min(close cutoff, event date + 5 days)
```

Duplicate events, duplicate bank candidates, cross-event evidence reuse, cumulative refunds above the original payment, pre-event cash, orphan refund-like debits, and settlement reversals all fail closed. A payment can post while its later refund remains an explicit exception; the two controls never mask each other.

### Bank conservation

A processed settlement is not received cash. A write requires one in-window bank credit with the expected amount and a non-empty UTR consistent across the gateway settlement. Zero candidates becomes cash in transit; multiple candidates remain under review. Evidence after the configured import cutoff is excluded.

### Import integrity

Raw files are processed in the browser and are not persisted. SHA-256 is computed over original bytes before strict UTF-8 decoding, so malformed bytes cannot collapse into the same replacement text. The preflight binds filenames, raw-byte hashes, selected mappings, raw/accepted counts, control totals, cutoff date, opening cash, and the canonical input fingerprint into a root manifest hash; that root is carried into the close certificate fingerprint. Structural errors clear the replaced source and block the run—there is no “best effort” row dropping or stale-file fallback. Imported batches have no independent truth labels, so `evaluateDecisions()` remains benchmark-only and the UI suppresses precision, recall, and false-close claims for them.

### Ledger conservation

For each posted settlement journal:

```text
Dr Bank — settlement clearing          net
Dr Gateway fees, tax, and adjustments  deductions
Cr Razorpay clearing                   gross
```

Verified separate debits receive their own balanced entry:

```text
Dr Customer refunds clearing / chargeback receivable    amount
Cr Bank — independent debit clearing                     amount
```

Total debits equal credits to the paise. Journal IDs are functions of settlement or event identity, making reruns idempotent.

## AI proposal contract

The key-free demo uses a checked-in replay with this shape:

```ts
interface NarrationProposal {
  extractedOrderId: string;
  confidence: number;
  evidenceSpan: string;
  sourceFingerprint: string;
  replayed: true;
}
```

A replay applies only if the complete narration fingerprint and quoted evidence span still match the source. Editing narration invalidates the proposal. A live provider can replace the replay but cannot change verifier behavior. High confidence never compensates for an amount mismatch, ambiguity, missing bank credit, cutoff breach, or imbalanced journal.

## Evaluation boundary

`reconcileBatch()` accepts only runtime inputs and close policy. `evaluateDecisions()` receives frozen synthetic decisions plus `ground_truth.json` afterward. Imported runs use a separate operational metric contract. Tests assert exact scores and exception codes so a change that raises coverage by making unsafe writes fails visibly.

The 100-seed suite is a **verifier regression**, not a held-out model-generalization claim: it varies values and unrelated operating noise while preserving the scenario grammar and proposal replay. The current stress artifact processes 225 seeded batches (50,175 source rows) and reports wall-clock throughput. A separate 28-case adversarial suite attacks payment, settlement, refund, chargeback, reversal, orphan-debit, cutoff, idempotency, injection, and overflow controls. All regenerate with `npm run evaluate`.

## Production adapter boundaries

A production deployment would add, without changing the verifier:

- read-only Razorpay recon and settlement adapters with pagination;
- direct bank/gateway API ingestion (browser-local CSV/JSON schema validation already exists);
- webhook signature verification and event-ID deduplication;
- durable journal-idempotency storage;
- authenticated maker/checker review and approval policy;
- a live structured-output model provider with prompt/version telemetry;
- encrypted evidence retention, access controls, and audit export.

Until those adapters exist, the product distinguishes a synthetic scored benchmark from an imported local batch and never implies a live financial write.
