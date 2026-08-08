import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { oauthProvider } from '@better-auth/oauth-provider'

export const auth = betterAuth({
  advanced: { useSecureCookies: true, disableCSRFCheck: false, disableOriginCheck: false },
  trustedOrigins: ['https://app.example.com'],
  plugins: [organization({ teams: { enabled: true } }), oauthProvider()],
})
