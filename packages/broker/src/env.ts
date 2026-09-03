// The Worker's bindings, narrowed to the two shapes this service actually uses, so every module
// can be unit-tested with a plain object instead of a live Cloudflare binding.
//
// APP_PRIVATE_KEY is a Secrets Store secret (`secrets_store_secrets` in wrangler.jsonc), read with
// `await binding.get()`. Cloudflare's own guidance is not to hold sensitive values in plaintext
// vars; the account-level store also keeps one copy for both environments and carries its own
// audit log. In local development `.dev.vars` supplies a plain string under the same name, which
// is why `readSecret` accepts either shape and every call site stays identical.
export interface SecretBinding {
  get(): Promise<string>
}

// TOKEN_LIMITER is the GA rate-limit binding (`ratelimits` in wrangler.jsonc), called as
// `await binding.limit({ key })`. See src/ratelimit.ts for what its verdict does and does not mean.
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  APP_PRIVATE_KEY: SecretBinding
  TOKEN_LIMITER: RateLimiter
  VEGAFACTORY_APP_ID: string
  OIDC_AUDIENCE: string
}

export async function readSecret(binding: SecretBinding | string): Promise<string> {
  return typeof binding === 'string' ? binding : await binding.get()
}
