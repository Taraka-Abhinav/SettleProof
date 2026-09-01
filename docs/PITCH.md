# Five-minute pitch script

## 0:00–0:25 — The promise

**On screen:** SettleProof overview.

“Finance teams do not need another chatbot that suggests a match. They need proof that cash arrived, the journal balances, and everything the agent could not resolve is still visible. SettleProof closes one settlement loop and carries the evidence for every write.”

## 0:25–1:05 — Prove it accepts raw files

**Action:** click **Use your data**, then **Load example raw files**.

“This is not an upload façade. SettleProof serializes three finance exports and sends all 217 rows through the same browser-local parser available for merchant CSV or JSON files. Here are the detected mappings, source hashes, control totals, cutoff date, and zero silently dropped rows. The files never leave this session.”

**Action:** continue through **Map**, **Validate**, and **Run verified close**.

“Imported data has no ground-truth labels, so this view reports operational coverage and verifier invariants—not fake precision. The independent measured accuracy stays in the benchmark.”

## 1:05–1:25 — The batch

**On screen:** source flow and seed.

“This is a deterministic synthetic batch: 84 ERP rows, 91 gateway recon rows, and 42 bank rows—217 source rows and 84 end-to-end targets. It contains fees, tax, refunds, timing drift, noisy references, same-value hard negatives, missing bank cash, and duplicated events.”

## 1:25–1:45 — Run the close

**Action:** click **Replay 217-row close**.

“The agent profiles sources, generates candidates, verifies money invariants, and posts only balanced journals. Twelve messy narrations need AI interpretation. The model can propose a reference, but it never performs arithmetic and never owns the write gate.”

## 1:45–2:10 — Measured outcome

**On screen:** overview KPIs.

“The result is 78 correct auto-matches out of 84 targets: a 92.9% safe match rate, 100% precision, 87.5% rupee-weighted coverage, all six injected exceptions found, and zero false auto-closes. Notice the denominators: abstentions remain inside coverage.”

## 2:10–2:45 — Prove one difficult match

**Action:** open **Evidence ledger**, filter to **Verified AI**, inspect a row.

“This gateway row has no structured order ID. A fingerprint-bound model replay extracts the order reference from its exact narration. SettleProof then proves amount equality, date policy, unique assignment, settlement arithmetic, one bank UTR credit, and a balanced settlement journal. If the narration changes, the replay is invalidated. Confidence is evidence—not authority.”

## 2:45–3:25 — Show deliberate abstention

**Action:** open **Exception inbox**, inspect `DUPLICATE_BANK_CREDIT`.

“Here one UTR appears twice in the bank. A fuzzy matcher might choose the first and inflate cash. SettleProof refuses both, quantifies exposure, names the missing bank confirmation, and gives treasury the next action. Marking it reviewed does not post it; new evidence must pass a fresh rerun.”

## 3:25–3:50 — Close the books, not just a match table

**On screen:** cash position and four verifier checks.

“For the safe subset, SettleProof creates nine idempotent journals that balance to the paise and updates opening cash, verified settlements, other bank movements, closing cash, confirmed cash in transit, and duplicate-credit value under review. The certificate proves record, settlement, bank, and ledger conservation.”

## 3:50–4:20 — Show the agent contribution

**Action:** open **Benchmark & audit**.

“Rules and normalized constraints safely close 78.6%. The verified narration layer adds 14.3 points, reaching 92.9% without lowering precision. A 25-seed regression varies values and operating noise with the same scenario grammar, and a 50,127-row stress replay measures throughput. I am not presenting this as held-out model generalization.”

## 4:20–4:45 — Machine-readable evidence

**Action:** click **Export proof packet**.

“An AI reviewer does not need to trust this video. The repository includes the frozen synthetic batch, separate ground truth, metric formulas, every match as JSONL, the full exception CSV, source and engine hashes, benchmark output, and the close certificate.”

## 4:45–5:00 — Honest ending

“The accuracy claim is synthetic and the model proposals are replayed for a deterministic, key-free benchmark. But raw-file ingestion, normalization, hashing, exception handling, settlement controls, and proof export are live. SettleProof is fast enough to run the books, strict enough to protect them, and honest enough to say ‘I don’t know.’”

## Recording notes

- Record at 1080p with browser zoom near 100%.
- Keep the pointer still while speaking over metrics.
- Do not skip the exception list or limitations screen.
- Show the URL bar once and the public repository once.
- End on the four green invariants plus visible residual exposure.
