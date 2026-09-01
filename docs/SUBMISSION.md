# Razorpay Buildathon submission copy

Replace bracketed personal links before submitting. The official form says the final submission cannot be edited afterward.

## Project title

**SettleProof — Every rupee accounted for. Every exception admitted.**

## Selected track

**Track 04 — AI Finance Controller**

## Objectives / what it solves

SettleProof closes the daily settlement reconciliation loop across an internal ERP ledger, Razorpay-style combined recon data, and a bank statement. A browser-local ingestion wizard accepts three real CSV/JSON exports, auto-detects their schema, converts money to integer paise, fingerprints every input, validates every row, and sends the canonical batch through the same verifier used by the benchmark—without uploading merchant data. It uses AI only to interpret noisy payment narrations, while deterministic policy independently verifies global one-to-one assignment, cutoff dates, complete settlement groups, consistent UTRs, settlement netting, bank receipt, balanced journals, and every refund’s bank debit. On the included 221-row synthetic batch, it safely auto-closes 78 of 84 payment targets at 100% precision, surfaces all six injected target exceptions, and independently flags `REF-1059` even though `ORDER-1059` matched. It exports posting-ready journals, a close certificate, and the complete unified exception list. Imported files are honestly reported with operational coverage only because they have no evaluator truth labels.

## GitHub URL

`[PASTE PUBLIC GITHUB REPOSITORY URL]`

Before submitting, confirm that a signed-out browser can see the README, evaluation artifacts, architecture, pitch script, and reproduction commands.

## Five-minute pitch URL

`[PASTE PUBLIC OR UNLISTED VIDEO URL]`

Script: [`PITCH.md`](PITCH.md)

## Build challenges and technical obstacles

**1. Preventing AI confidence from becoming financial authority.** Early designs made the narration resolver look like the matcher. I split the system into a schema-shaped AI proposal layer and an independent deterministic verifier. Model output can nominate a reference, but amount equality, date policy, unique assignment, settlement arithmetic, bank UTR receipt, and journal balance must all pass before posting.

**2. Measuring performance without hiding hard cases.** A headline “accuracy” score can be inflated by dropping ambiguous rows. I gave every target one terminal state, kept abstentions in the safe-match-rate denominator, isolated ground truth from runtime inputs, and exported precision, recall, count- and value-weighted coverage, exception recall, false writes, and the full exception CSV.

**3. Reconciling settlement arithmetic correctly.** Fee and tax fields are easy to subtract twice. The verifier treats signed combined-recon credits and debits as authoritative, proves `Σ credits − Σ debits = bank amount`, and replays the result through a double-entry journal that must balance to integer paise.

**4. Distinguishing a processed settlement from received cash.** A gateway “processed” state does not prove the bank received funds. I kept gateway and bank evidence separate: zero in-window bank candidates becomes cash in transit, while duplicate credits remain blocked for treasury review.

**5. Building a repeatable AI demo without secrets or network flakiness.** The repository checks in fingerprint-bound narration proposal replays and clearly labels replay mode. This keeps judging deterministic and key-free while preserving an adapter boundary for a live structured-output model. The verifier and every score still execute live.

**6. Proving reruns are safe.** Each journal ID derives from batch and settlement IDs. Tests rerun the same batch, assert stable unique journal keys, and verify debits equal credits to the paise.

**7. Making raw data usable without faking accuracy.** I added a real browser-local CSV/JSON pipeline with quoted-field parsing, alias-based mapping, SHA-256 manifests, row-level errors, exact paise conversion, policy configuration, and zero silent drops. Custom data produces operational metrics only; benchmark precision and recall never leak into an unlabeled upload.

**8. Preventing partial settlement posting.** A single matched payment is not enough to journal a settlement. Every payment component must link exactly once, the UTR must be non-empty and consistent, one bank credit must prove the net amount, and no component exception may remain. Orphan rows block the certificate.

## Final checklist

- [ ] Personal details, college, graduation year, in-person availability, and internship duration are correct.
- [ ] Track 04 is selected.
- [ ] Public repository URL works while signed out.
- [ ] Five-minute video URL works while signed out and is no longer than five minutes.
- [ ] Hosted demo URL, if included, works in an incognito window.
- [ ] Results in the video match `artifacts/metrics.json`.
- [ ] The video shows one difficult verified match and one deliberate abstention.
- [ ] The video shows the raw-file preflight and explicitly distinguishes imported operational metrics from benchmark accuracy.
- [ ] The repository contains no API keys, credentials, private data, or placeholder submission links.
- [ ] `npm ci && npm run verify` passes from a clean checkout.
- [ ] Final confirmation is submitted only after every link is checked.

Official challenge page: <https://razorpay.com/buildathon/>
