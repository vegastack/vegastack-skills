# VegaStack Skills — Productionization Plan (v2)

**Date:** 2026-08-07 (v2 — revised after adversarial review of v1 by three independent review passes: plan-vs-code feasibility, full file sweep, refresh-system/strategy attack)
**Decisions locked in:** public npm package, advisory-only checks (no CI gates in product repos), multi-skill family repo, scheduled agent-driven refresh with PR + human review, slimmed advisory ceremony. npm `@vegastack` scope and GitHub org exist.

> **Sanitization note:** this document is written to be commit-safe. It deliberately does not reproduce the leaked strings it orders purged (a client name and personal absolute paths found in `.vegastack/evidence-cache.json` and `work/` artifacts — referred to below as "the B6 strings"). v1 of this plan contained them verbatim; that was itself a leak vector and is fixed in this revision.

---

## Part 1 — Findings from the repo review (unchanged from v1, corrected where the plan review disproved them)

### Blockers

| # | Finding | Evidence |
|---|---------|----------|
| B1 | **No version control.** Zero commits; no `.gitignore`; caches, packed tarballs, generated copies untracked next to source. | `git ls-files` = 0 |
| B2 | **`bun run check` machine-locked** on a hardcoded personal `~/.codex` python validator path. | `package.json:10` |
| B3 | **Flagship check ~98% false positives** on this repo (REJECT, 44 FAIL / 0 PASS), including flagging its own detection regexes. *Correction from review:* installed copies under `.claude/`/`.agents/` are already excluded (`architecture-check.mjs:10`); most of the 44 findings come from `work/verifier-bundle`, which Phase 0 deletes — the remaining fix is scoping + caps, smaller than v1 implied. | `scripts/architecture-check.mjs:136` |
| B4 | **`.yaml` files are secretly JSON-only** (`lib.mjs#readJsonYaml` = `JSON.parse`). | `scripts/lib.mjs:8-13` |
| B5 | **Evidence artifacts mutually impossible** (cache and drift report, identical timestamp, contradictory versions; drifted sources also listed as unaffected). | `.vegastack/*.json` |
| B6 | **Privacy leak:** evidence cache and `work/` tarballs contain personal absolute paths and a client name. The 0.1.0 packed tarball also contains them — if it was ever shared or uploaded anywhere, treat the leak as already out. | `evidence-cache.json` LOCAL-* entries; `work/packed/vegastack-skills-0.1.0.tgz` |

### High / Medium (abbreviated — see review session for full detail)

- H1: MCP spec pinned 2 breaking revisions behind (2025-06-18 vs 2026-07-28); `MCP-SPEC` and `AI-GATEWAY` marked critical in the registry but missing from `foundation-compatibility.json` `criticalSources`.
- H2: No CI/publish pipeline. Version drifts across **6+ places**, not 3: root `package.json`, `packages/cli/package.json`, `src/index.ts:273`, `bun.lock` (stale at 0.1.0), plus the separate *foundation* version constants (`architecture-profile.schema.json:123` const, `profile-tool.mjs:45`, `foundation-compatibility.json:3`).
- H3: `engines: ">=20"` wrong; `import.meta.dirname` at `architecture-check.mjs:202` crashes Node 20.0–20.10. One-line `fileURLToPath` fix (all other scripts already use it). `engines` protects only CLI install, never the installed scripts run by the user's node — the code fix is the real fix.
- H4: `$SKILL_ROOT` is fictional; SKILL.md snippets crash verbatim.
- H5: Frontmatter description persona-imperative and keyword-stuffed.
- H6: Durable-execution foundation hard-locked to a single-vendor beta tuple with no exit-plan requirement.
- M1: Governance sized for an org 10× larger (fictional topic owners, 10-field exceptions, 3-day fail-closed thresholds, unrunnable qualification matrix).
- M2: Shadow evidence set (~14 cache entries with no registry governance); `approvedHosts` in `refresh-evidence.mjs:14` drifts from the registry (a dead ORM-docs entry; an internal VegaStack hostname baked into a public tool) with no consistency check.
- M3: 78 rules, ~33 machine-covered; classification contradictions between rule-model and control-catalog.
- M4: Script output context-hostile (9k-token inspect, no `--summary`, no `--help`).
- M5: `profile-tool --output` not confined to `--dir`.
- M6: SSRF defense-in-depth gaps (DNS-rebind TOCTOU; `::ffff:` mapped-IPv4 treated as public).
- M7: Checksum manifest self-referential until npm provenance exists.
- M8: *Corrected:* `tests/` is **already excluded** from the package (allowlist in `sync-skill.mjs` never included it; tarball verified). Residual risks: (a) people copying `skills/` straight from the public repo inherit fixture fake-secrets; (b) the allowlist count check (`sync-skill.mjs:61`) is near-tautological and can't catch an unlisted or swapped file.
- M9: Stale content (sandbox egress API names; PG 18 absent; MCP per H1).
- Content gaps (unchanged): LLM evals, model lifecycle/deprecation (zero model-provider registry sources), cost/FinOps, PII-before-embedding, output moderation, provider backpressure, prompt/model canarying, prompt-injection mitigations, vendor-exit for owned capabilities, Flutter baseline pin.

---

## Part 2 — Plan (v2, corrected)

### Phase 0 — Repo foundation *(realistic effort: 1 day)*

1. `git init` this directory as its own repo under the GitHub org.
2. `.gitignore`: `node_modules/`, `dist/`, `.turbo/`, `work/`, `.claude/`, `*.tgz`, **and both** `.vegastack/evidence-cache.json` **and** `.vegastack/evidence-drift.json` (they are only meaningful as a pair generated in one code path; committing one without the other reproduces the B5 split-brain). Also ignore `packages/cli/skill/` and `packages/cli/skill-integrity.json` (see item 4).
3. Delete `work/` (packed tarballs and verifier bundle are leak artifacts — see B6; verify the old tarballs were never distributed). Note `pack:local` recreates `work/packed/`, which is fine because `work/` is ignored.
4. Generated copies (`packages/cli/skill/`, `skill-integrity.json`, `dist/`) are build outputs: ignored, rebuilt by `prepack`. **Verified sound:** `files` whitelist includes them regardless of gitignore; `loadSource` verifies from the tarball; tests self-build (`installer.test.ts:16`, `package.test.ts` via `npm pack`). **Required companion fix:** `turbo.json` caches `skill/**` as an output but doesn't hash the real inputs (`../../skills/**`), so edits to the authored skill can cache-hit a **stale** copy into a release. Either add a turbo `inputs` glob covering `../../skills/**` — or (recommended) **drop turbo entirely**: it orchestrates one package's build, and its `test` pipeline is already dead config (root `test` bypasses it).
5. Purge the B6 strings everywhere, including from this `docs/` folder — v1 of this plan contained them. Purge is not a sed job: `refresh-evidence.mjs` validates cache entries, so the `LOCAL-*` local-file evidence class must be dropped or redefined (repo-relative only), and the registry updated accordingly.
6. Replace the hardcoded validator (B2): port `quick_validate.py` to JS. **Verified trivial** (~60 lines: SKILL.md exists, frontmatter parses, allowed keys, name/description constraints).
7. Add npm metadata now (it gates Phase 3): `repository` (`git+https://github.com/<org>/vegastack-skills.git` + `directory: packages/cli`), `homepage`, `bugs`, `keywords`, `author` in `packages/cli/package.json`. **Without `repository`, provenance publishing fails with a 422.**

### Phase 1 — Skill first-touch fixes *(realistic effort: 4–6 days, was "2–3")*

1. **Checker rescope (B3/M4):** exclude the dev-repo skill source dir; support a `.guardianignore` **plus built-in defaults and a long-line/minified-bundle heuristic — do NOT attempt full `.gitignore` parsing** (zero-dep faithful gitignore semantics is a project in itself; `git check-ignore` adds a git-required assumption the checker must not have). Add `--summary` (default documented invocation), per-rule finding caps with `(+N more)`, `--help`, documented exit-code semantics. Update `tests/architecture-check.test.ts` accordingly.
2. **`.yaml` → `.json` (B4):** blast radius is **63 references across 15 files** (dominated by `validate-profile.mjs` with 38 hardcoded-path diagnostics; plus architecture-check, profile-tool defaults, refresh-evidence, verify-corpus, CLI `doctor` at `index.ts:327`, the `sync-skill.mjs` allowlist entry, 5 test files, 3 fixture profiles, SKILL.md, foundation.md, README). v1's "migration shim in profile-tool migrate" was **unimplementable** — no `migrate` command exists and `migrate-v2` throws on v3 profiles. Correct approach: **dual-extension discovery** (`.json` preferred, `.yaml` accepted with a deprecation warning) in doctor / architecture-check / validate-profile / profile-tool, with `.json` as the only documented form.
3. **Kill `$SKILL_ROOT` (H4):** snippets use an explicit `<skill-dir>` placeholder with a substitution instruction.
4. **Rewrite frontmatter description (H5)** to third-person what/when with real user phrasing.
5. **Slim ceremony (M1) — revised to respect the documented anti-suppression invariant:** v1's "path-prefix matching" would reverse `profile-governance.md:35` ("wildcards and directory-prefix suppression are forbidden") — the ban exists to stop exactly the blast-suppression failure prefix matching reintroduces. Instead: (a) one exception may list **all controls under one rule** (schema already takes lists; change is matcher + docs), **keep exact-path matching**; (b) two-tier response contract in SKILL.md (short form for questions; full 8-part only for design reviews/ADRs/migrations); (c) evidence labels optional outside review/drift reports; (d) delete `topicOwners` (verified safe — refresh falls back to a default owner); (e) `thresholdDays`: minimum 14 for weekly cadence (see Phase 4 — threshold must be ≥ 2× refresh cadence); (f) demote DUR-007 qualification to "before first paying tenant". Change surface: schema + `architecture-check.mjs:81-86` matcher + `validate-profile.mjs:58,82-83` + ADR template + 3 test blocks + fixtures.
6. **Engines/runtime (H3):** switch `architecture-check.mjs:202` to `fileURLToPath`; set `engines` to `>=20.11` as belt-and-braces.
7. **Output confinement (M5):** confine `--output` to `--dir`. *Correction:* `containedFile` from validate-profile is **not** directly reusable (it `realpath`s existing files; new outputs ENOENT) — contain the parent directory and reject absolute/`..` inputs. Fix flag-parsing missing-value crashes. Fix SSRF gaps (M6): pin resolved IP for the fetch, treat `::ffff:` as IPv4, add CGNAT/benchmark ranges. Add a registry↔`approvedHosts` consistency check; remove the dead Drizzle entry and the internal design-host entry (M2).
8. **Packaging manifest hardening (M8, reworded):** tests already don't ship. Real fix: replace the count check in `sync-skill.mjs` with a destination-inventory diff against the allowlist that **fails on unlisted files** in the authored tree.
9. **Version identity decoupling (H2):** explicitly separate the **package version** (root + CLI + changesets-managed) from the **foundation/profile-schema version** (`schema const`, `baseDraft`, `foundationVersion`). Bumping the CLI must never invalidate deployed profiles. Document the policy; single source for each.
10. **Registry snapshot contract (pulled forward from Phase 4 — decide now, files are being touched anyway):** the shipped source registry **is** the publish-time staleness snapshot. It keeps `checksum`, `checksumScope`, `currentVersion`, `retrievedAt` baselines (dropping them, as v1's sources.json sketch implied, would break drift computation entirely — `refresh-evidence.mjs:196,224,244`). The evidence cache is a consumer-local incremental optimization, never committed, never shipped. Add `MCP-SPEC` + `AI-GATEWAY` to `criticalSources` (H1). Make fail-closed real at advice time: one line in SKILL.md's drift workflow — before advice leaning on a critical source, run `refresh-evidence --topics <affected>` online, or mark the claim `NOT VERIFIED` when offline and the shipped snapshot exceeds threshold.
11. **Content fixes:** MCP 2026-07-28 + CONN-004 re-derivation; sandbox egress API (`allowedHosts`/`deniedHosts`/outbound handlers); PG 18 candidate baseline; rule-model↔control-catalog classification reconciliation (M3); exit-plan requirement for owned durable-execution (H6); fix schema `$id` dead link; new/extended references for the top content gaps (evals, model lifecycle + model-provider registry sources, cost, PII).

### Phase 4a — Deterministic freshness core *(ships BEFORE first publish; ~1 day)*

The staleness clock starts at publish, so the deterministic layer must exist first.

1. **Checksum-scope cleanup:** live vendor doc pages churn raw bytes on every site rebuild — the 2026-08-07 drift run already shows 4 pure-churn "drifts". Default doc-page sources to `html-text-v1` (already implemented in `refresh-evidence.mjs:132-142`) or version-detection-only; reserve `http-body` for immutable URLs. This alone cuts weekly review noise by more than half.
2. **Cadence arithmetic:** threshold ≥ 2× cadence. Weekly agent ⇒ 14-day minimum thresholds. Sources genuinely needing 3–7-day freshness get a **daily deterministic-only cron** (pure npm/PyPI/spec version checks, no LLM, cheap).
3. **One code path for artifacts:** the runner regenerates snapshot + drift report together; CI fails if they disagree (makes the B5 class structurally impossible).
4. **CI diff-scope guard on refresh PRs:** fails any refresh-branch PR touching files outside `skills/*/refresh/` + the designated volatile files. Instructions don't prevent agent overreach; CI does.
5. **Deterministic re-verification:** CI re-runs the version/checksum checks on the PR branch and fails if agent-claimed values don't reproduce — hallucinated "verified" versions become structurally impossible for deterministic claim classes.
6. **PR idempotency:** the runner force-updates one standing refresh branch/PR per skill; unmerged weeks never stack duplicate PRs.
7. **Layout:** put `refresh/sources.json` + `refresh/REFRESH.md` in their per-skill location (`skills/<name>/refresh/`) now — cheap, and avoids v1's sequencing contradiction where Phase 4 depended on the deferred Phase 2 structure.

### Phase 3 — Publish pipeline *(realistic effort: 2 days, was "1")*

1. **CI (GitHub Actions, Linux):** pinned Bun + Node matrix (20.11 floor / 22 / 24); `check` + `build` + packed-tarball install test on every PR. Secret-scanning hygiene for the public repo: a `.gitleaks.toml`/push-protection allowlist or obviously-fake placeholder convention for the fixture `.env` files (they *will* trip scanners for every forker).
2. **Release — with the bootstrap step v1 omitted:** trusted publishing **cannot be configured for a package that doesn't exist yet**. First publish is manual with a short-lived granular token; then configure the trusted publisher on npmjs.com; token-free OIDC thereafter. Release job runs **Node 24** (trusted publishing needs npm ≥ 11.5.1; Node 22 ships npm 10.x) with a setup-bun step (`prepack` needs Bun). Don't pass `--provenance` explicitly — it's default under trusted publishing and the explicit flag has known config-conflict issues (npm/cli#8036). `repository` field prerequisite handled in Phase 0.7.
3. **SBOM:** `npm sbom` needs an npm lockfile this Bun repo doesn't have — run `npm install --package-lock-only` first in the release job. State what's attested: the build tree (the published package has zero runtime deps).
4. **Changesets** for versioning/changelog (verified workable: no `workspace:*` deps to mangle; run `bun install` after `changeset version` so `bun.lock` doesn't go stale again).
5. **npm-facing docs:** `packages/cli/README.md` is what renders on npmjs.com — currently 5 lines with an unfulfilled-promises caveat. Rewrite it (and the root README's "violations fail CI" sentence, which contradicts the advisory-only decision). Include: what the skill does, requirements (Node ≥ 20.11), install/upgrade/uninstall, supported agent runtimes, "zero network calls at install, no telemetry" (true and currently unclaimed), Windows status (currently broken: `refresh-evidence.mjs:84,98` splits paths on `/` — fix or state unsupported).
6. **Rollback policy (v1 had none):** npm unpublish is limited to 72h — rollback = publish previous content as a new patch + `npm deprecate` the bad version. Document in the release workflow.
7. **CLI gaps for a public installer:** add `remove`/`uninstall` and `--version`.

### Dogfood gate *(between publish and announce)*

Install the published package into at least two internal VegaStack repos; use for two weeks with a lightweight "guardian was wrong/annoying" issue label before treating it as announced. Content is the product; the first external impression should not be the first real-world run. Minimum success metrics: verdicts overturned by humans; refresh PRs merged-as-is vs edited; time-from-upstream-release to compatibility update for critical sources.

### Phase 4b — Semantic refresh agent *(after publish; 1–2 days)*

Weekly scheduled Claude Code agent per skill: deterministic diffs first (from 4a), then live-doc verification per `REFRESH.md` for drifted/semantic sources only; one evidence-linked PR per skill; human merges (guarded by 4a's CI checks). Durable-rule concerns become issues, never edits.

**Content taxonomy — three tiers, not two** (v1's durable/volatile split fails where staleness risk is highest): **durable** (versionless principles), **volatile** (pins + mechanism names in one tagged place), and **mechanism-coupled** (durable intent expressed through vendor-named mechanisms — Better Auth plugin/option names in AUTH rules, the beta workflow-engine semantics throughout durable-execution.md). Mechanism-coupled content keeps concrete names, carries a source tag, and is flag-only for the agent. The durable-execution file additionally gets a human re-review trigger tied to the workflow SDK's GA, not the weekly loop. Honest coverage expectation: ~60% refresh-free for the identity/durable-execution material, not 90%.

**Consumer staleness (v1 had no answer):** `doctor` gains one registry call — `GET registry.npmjs.org/@vegastack/skills/latest` — and prints installed-vs-latest with an update hint (today it reports "ok" on arbitrarily rotten content, and `verify` against an old install misreports outdatedness as tampering). The shipped registry snapshot carries package version + publish date so the fail-closed line from Phase 1.10 naturally degrades old installs to "verify live before critical advice."

### Phase 2 — Multi-skill generalization *(defer until skill #2 is real; deeper than v1 claimed)*

The CLI's single-skill nature is structural, not cosmetic: `skill-integrity.json` is a one-skill manifest (`index.ts:198-201`), the recovery journal derives destinations from the one skill name and dedupes on agent alone (`index.ts:123-130`), `doctor`'s profile/architecture checks are arch-guardian-specific, and `sync-skill.mjs`'s allowlist is per-skill by nature. Generalization requires a schemaVersion bump of both the integrity manifest and install journal — a compatibility break for existing installs to plan deliberately. Nothing in Phases 0/1/3/4 creates rework for it (refresh layout is already per-skill; `.vegastack/` is consumer-side).

### Public-repo hygiene *(alongside Phase 3)*

`SECURITY.md` (ironic gap: the skill's registry tracks other projects' security policies), `CONTRIBUTING.md`, issue/PR templates, CODEOWNERS, Renovate/Dependabot for the repo's **own** devDependencies (the freshness system watches skill content, not the repo — turbo is pinned at 2.5.6 while the skill's own registry flags 2.10.8), a semver policy for rule content (is changing a MUST rule breaking?), and a note documenting the jsdom/mermaid optional-import design in `verify-corpus.mjs` so a future "remove unused deps" cleanup doesn't silently break `bun run check`.

### Sequence (revised)

Phase 0 (1d) → Phase 1 (4–6d, includes registry snapshot contract) → Phase 4a (1d) → Phase 3 + hygiene (2d) → **dogfood gate (2wk)** → announce → Phase 4b (1–2d) → Phase 2 when skill #2 is real.
