# SettleProof benchmark report

> Throughput plus measured accuracy plus an honest exception list. One cherry-picked match proves nothing.

- Throughput: 10,801 rows/sec over 50,167 full-loop rows; p95 22.174 ms/batch.
- Accuracy: 7800/7800 correct auto-closes across 100 seeded batches; 0 unsafe auto-closes.
- Exceptions: 600/600 injected target exceptions surfaced; refund exceptions are independently counted.
- Controls: 19/19 adversarial controls passed.

Full runClose loop: generation, proposal replay, deterministic reconciliation, refund checks, posting gate, journals, dispositions, cash, exceptions, metrics, and certificate. CSV parsing, UI rendering, and export serialization excluded.
