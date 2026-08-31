# Evaluation artifacts

Regenerate everything in this directory with:

```bash
npm run evaluate
```

The command performs the demo evaluation, 25-seed verifier regression, and a 50k+ source-row stress replay before rewriting the artifacts.

| File | Contents |
| --- | --- |
| `synthetic_batch.json` | runtime ERP, gateway, and bank inputs; no truth labels |
| `ground_truth.json` | evaluator-only expected links and exception labels |
| `matches.jsonl` | one independently scored auto-match per line |
| `exceptions.csv` | complete unresolved population and next actions |
| `metrics.json` | formulas, denominators, demo score, and regression score |
| `benchmark.json` | stress timing and rules-vs-agent ablation |
| `close_certificate.json` | close status and four conservation proofs |
| `run_manifest.json` | seed, runtime, policy, and SHA-256 fingerprints |
| `dispositions.jsonl` | one explicit classification for every source row |

Stress throughput is machine-dependent. Match decisions and correctness scores are deterministic for a given seed and engine version.
