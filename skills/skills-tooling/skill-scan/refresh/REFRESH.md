# Refresh contract — skill-scan

The scan discipline itself (exit codes, the baseline's three sections, the literal-matcher rule, the "Still flag if:" clause) asserts nothing that can go stale. What is volatile is `scripts/lib/skillspector.mjs`, which parses the output of third-party commands and calls a third-party API — the six sources below.

What the registry tracks, and why each one is load-bearing rather than decorative: every parser below fails **silently** if its upstream surface changes — returning "not installed", which the guard reports as a missing scanner instead of a parsing bug. That silence is the whole reason these are registered.

| Source | The claim it holds up | Breaks how |
|---|---|---|
| `SS-INSTALL` | `uv tool install git+https://github.com/NVIDIA/skillspector.git` is upstream's documented install, and the package is not on PyPI | the install command installs nothing, or the wrong thing |
| `SS-VERSION-OUTPUT` | `skillspector --version` prints `SkillSpector v<x.y.z>` on **stdout**, warnings on stderr | version reporting goes null; the baseline-pin warning stops firing |
| `SS-RELEASES-API` | the GitHub releases endpoint shape, and its 60-request/hour unauthenticated limit | `notify` silently reports nothing |
| `UV-TOOL-LIST` | `uv tool list --show-paths` prints `- skillspector (/abs/path)` | uv-installed scanners read as absent |
| `BREW-PREFIX` | `brew list --versions` exits non-zero when absent, while `brew --prefix` exits **0 with a path for any known formula** whether or not it is installed | brew detection returns a path that does not exist |
| `PIPX-LIST` | `pipx list --short` exits 0 even with nothing installed, so its output must be parsed | pipx-installed scanners read as absent, or absence reads as present |

These six moved here from `dev-review` on 03-09-2026 with issue #113, when the guard became its own skill; the registry entries are unchanged, and their `affected` paths were already skill-relative.

Drift in any of them means reading the changed surface and updating both the parser and its dated comment in the same reviewed PR — never auto-applying. The parsers each have a unit test pinning the exact output shape, so a corrected parser has a failing test to satisfy.
