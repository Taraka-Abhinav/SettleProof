# SettleProof benchmark report

> Throughput plus measured accuracy plus an honest exception list. One cherry-picked match proves nothing.

- Throughput: 8,156 rows/sec over 50,175 full-loop rows; p95 33.028 ms/batch.
- Accuracy: 7800/7800 correct auto-closes across 100 seeded batches; 0 unsafe auto-closes.
- Exceptions: 600/600 injected target exceptions surfaced; refund and chargeback controls are independently counted.
- Controls: 28/28 adversarial controls passed.

Full runClose loop: generation, proposal replay, deterministic payment reconciliation, independent refund/chargeback allocation, posting gates, settlement and debit journals, dispositions, cash, exceptions, metrics, and certificate. CSV parsing, UI rendering, and export serialization excluded.
