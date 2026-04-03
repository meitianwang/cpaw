// Stub: OAuth types for external builds (Klaus does not use claude.ai OAuth)

export type SubscriptionType = 'free' | 'pro' | 'team' | 'enterprise' | 'max_5' | 'max_20' | string

export type BillingType = 'self_serve' | 'invoiced' | 'stripe' | string

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  subscriptionType?: SubscriptionType | null
  scopes?: string[]
  rateLimitTier?: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: {
    uuid?: string
    emailAddress?: string
    organizationUuid?: string
  }
}

export type RateLimitTier = string

export interface OAuthProfileResponse {
  id: string
  email: string
  name?: string
}

export interface OAuthTokenExchangeResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
  account?: {
    uuid?: string
    email_address?: string
    display_name?: string
    organization?: {
      uuid?: string
      name?: string
    }
  }
  organization?: {
    uuid?: string
    name?: string
  }
}

export interface ReferralEligibilityResponse {
  isEligible: boolean
  referralCode?: string
}
