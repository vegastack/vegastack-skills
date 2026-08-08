# AI evaluation

Apply this reference only when agents, prompts, or other model-backed behavior ship to users. A project with no model-backed behavior needs no eval infrastructure.

An eval is a versioned golden dataset plus a scoring method plus an explicit pass threshold, run against a pinned model and prompt. A demo transcript, a vibe check, or an unpinned notebook run is not an eval and produces no evidence.

- **EVAL-001 — Eval definition.** Every evaluated behavior **MUST** define a golden dataset with provenance and tenant-safe sourcing, a deterministic scoring method or declared judge configuration, and numeric pass/regression thresholds recorded before the run, not chosen after it.
- **EVAL-002 — Promotion gate.** Changes to agent instructions, prompts, model policy, routed model, tool schemas, or knowledge policy **MUST** pass offline regression evals against the golden datasets before publish or promote. A threshold regression blocks promotion; overriding it is a project-owner accepted risk, not a pass.
- **EVAL-003 — Versioned datasets.** Eval datasets, scoring configuration, and thresholds **MUST** be versioned alongside the prompts and agent versions they gate, so any historical eval result can be reproduced from its exact inputs. Dataset edits that change pass rates are behavior changes and go through the same review as prompt changes.
- **EVAL-004 — Online sampling.** Production eval sampling **MUST** respect workspace data policy, retention, and redaction before any live interaction enters a dataset or judge prompt. Sampled cases feed dataset growth through review, never automatically.

## Judge models

Model-as-judge scoring is permitted with declared caveats: pin the judge model and prompt version, measure judge agreement against a human-labeled slice before trusting it, and re-baseline whenever the judge model changes. Judge scores are relative evidence — they compare candidates under one fixed judge; they do not certify absolute quality. Do not use the model under test as its own judge, and do not let judge drift silently move a threshold.

## Operating the gate

| Change | Required eval evidence |
|---|---|
| prompt or instruction edit | offline regression pass on affected datasets |
| model or route change | full regression pass plus cost/latency comparison |
| tool schema change | tool-selection and output-conformance pass |
| knowledge policy change | retrieval-grounded answer pass |
| dataset edit | reviewed diff and re-baselined thresholds |

Keep datasets small enough to run in CI and grow them from triaged production failures, not synthetic bulk. Record every gate run with dataset version, model, prompt version, scores, and outcome so `AGENT-004` publication gates can cite it. Offline pass plus bounded online sampling is the evidence pair; neither alone qualifies a behavior change for tenants.
