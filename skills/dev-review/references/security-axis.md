# The security axis

Runs on `risky` issues, and whenever the diff's touch points hit an auth surface, money, user data, or externally-controlled input — the trigger is the surface, not the label alone.

## Method — evidence before severity

1. **Trace the data flow** for every candidate finding: origin → transformations → sink. Is the value attacker-controlled at the point of use? A finding without a traced flow is a hunch, not a finding.
2. **Check defense in depth before flagging a gap.** A missing check at one layer is not a vulnerability if another layer enforces it on every path — name the enforcing layer instead. Flag it only when no layer holds, or the only holding layer is UX (client-side, middleware-as-convenience).
3. **Verify library defaults** before "missing configuration" findings — frameworks ship safe defaults more often than training-data memory suggests; check the current docs per `dev-architect`'s verify protocol.
4. **Assess exploitability**: what does the attacker need (auth level, network position, timing, knowledge)? What mitigating controls exist? Severity follows exploitability, never vibes.

## Finding format — three extra lines

On top of the standard finding shape, every security finding carries:

```
Data flow: <origin> → <transformations> → <sink>
Attack prerequisites: <what the attacker needs>
Mitigating controls: <existing defenses that reduce but don't eliminate>
```

A finding that can't fill the Data flow line goes to the collapsed low-confidence block, not the main list.

## Severity

- **[CRITICAL]** — exploitable now: auth bypass at the enforcement layer, injection with a traced user-input path, secret/credential exposure, unprotected sensitive mutation. Blocks, above MUST-FIX.
- **[MUST-FIX]** — a real weakness needing prerequisites an attacker can plausibly meet.
- **[SHOULD-FIX]** — hardening: rate limits, PII in logs, missing timeouts, defense-in-depth gaps with a holding layer.
- Never round up to look thorough; judge against the project's Architecture facts — platform-scale concerns are not defects on a small internal tool.

## Standing red lines (from dev-architect, always in force)

Middleware/proxy is never the authorization boundary; authorization lives server-side per resource. No secret in plaintext anywhere — code, config, logs, events, agent state. Permission checks fail closed, and the deny is still audited.
