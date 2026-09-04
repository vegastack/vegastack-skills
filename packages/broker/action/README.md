# VegaStack Factory token action

**This directory is the action.** GitHub Actions resolves an action from a subdirectory of any
public repository, so there is no separate action repository to mirror: consumers reference this
path in `vegastack/vegafactory` directly. `factory-token-v1` is the moving tag the Ship runbook
advances whenever this directory changes; a release tag such as `v0.19.0` pins one exact version.

Exchange a GitHub Actions OIDC token for a one-repository VegaStack Factory token — issues and
projects, one hour, that repository only. No private key in your organisation.

## Use it

```yaml
jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # required — without it there is no OIDC token to exchange
      contents: read
    steps:
      - uses: vegastack/vegafactory/packages/broker/action@factory-token-v1
        id: factory
      - run: gh issue edit 12 --add-label ready
        env:
          GH_TOKEN: ${{ steps.factory.outputs.token }}
```

| Input | Default | What it is |
|---|---|---|
| `endpoint` | `https://factory-token.vegastack.com/token` | The broker endpoint |
| `audience` | `vegastack-factory` | The OIDC audience the broker verifies |

| Output | What it is |
|---|---|
| `token` | The installation token, already masked with `core.setSecret` |
| `expires_at` | When it expires — GitHub's fixed one hour from minting |

## Before it works

Install the [VegaFactory App](https://github.com/apps/vegafactory) on the repository. Without an
installation the broker answers `403`, which is also how you revoke it: uninstall, and the next
request fails closed.

The token cannot push code. The cap is `issues: write`, `metadata: read`,
`organization_projects: write` on exactly one repository, enforced both in the request and against
the response's own permission echo.

Full reference — status codes, tenancy, what is stored, the rate limit, rotation, and the support
boundary — is in `github-app.md` under **Hosted token broker** in
[`vegastack/vegafactory`](https://github.com/vegastack/vegafactory).
