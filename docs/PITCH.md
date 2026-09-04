# Five-minute pitch script

## 0:00–0:25 — The promise

**On screen:** SettleProof overview.

“Finance teams do not need another chatbot that suggests a match. They need proof that cash arrived, the journal balances, and everything the agent could not resolve is still visible. SettleProof closes one settlement loop and carries the evidence for every write.”

## 0:25–1:05 — Prove it accepts raw files

**Action:** click **Use your data**, then **Load example raw files**.

“This is not an upload façade. SettleProof serializes three finance exports and sends all 223 rows through the same browser-local parser available for merchant CSV or JSON files. Here are the detected mappings, raw-byte hashes, control totals, cutoff date, and zero silently dropped rows. The files never leave this session.”

**Action:** continue through **Map**, **Validate**, and **Run verified close**.

“Imported data has no ground-truth labels, so this view reports operational coverage and verifier invariants—not fake precision. The independent measured accuracy stays in the benchmark.”

## 1:05–1:25 — The batch

**On screen:** source flow and seed.

“This is a deterministic synthetic batch: 84 ERP rows, 93 gateway recon rows, and 46 bank rows—223 source rows and 84 end-to-end targets. It contains fees, tax, separately funded refunds, a verified chargeback, timing drift, noisy references, same-value hard negatives, missing bank cash, and duplicated events.”

## 1:25–1:45 — Run the close

**Action:** click **Replay 223-row close**.

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

“For the safe subset, SettleProof creates nine settlement journals and four independent refund/chargeback debit journals. The visible equation includes every bank movement and lands at a zero bridge delta. Nine certificate invariants prove record, settlement, bank, ledger, debit-journal, cutoff, refund, and chargeback conservation.”

## 3:50–4:20 — Show the agent contribution

**Action:** open **Benchmark & audit**.

“Rules and normalized constraints safely close 75.0%. The verified narration layer adds 17.9 points, reaching 92.9% without lowering precision. A 100-seed regression covers 22,300 source rows, a 50,175-row full-loop replay measures throughput, and 28 adversarial finance attacks all fail closed. I am not presenting this as held-out model generalization.”

## 4:20–4:45 — Machine-readable evidence

**Action:** click **Export redacted proof**.

“An AI reviewer does not need to trust this video. The default export is allowlisted and pseudonymized—no filenames, row IDs, order IDs, UTRs, narrations, or model text. The optional full packet is AES-256-GCM encrypted in the browser with authenticated metadata. The repository also ships the frozen batch, separate truth, every match, every exception, independent-debit proof, hashes, benchmark, and certificate.”

## 4:45–5:00 — Honest ending

“The accuracy claim is synthetic and the model proposals are replayed for a deterministic, key-free benchmark. But raw-file ingestion, normalization, hashing, exception handling, settlement controls, and proof export are live. SettleProof is fast enough to run the books, strict enough to protect them, and honest enough to say ‘I don’t know.’”

## Recording notes

- Record at 1080p with browser zoom near 100%.
- Keep the pointer still while speaking over metrics.
- Do not skip the exception list or limitations screen.
- Show the URL bar once and the public repository once.
- End on the four green invariants plus visible residual exposure.
