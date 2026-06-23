import type { ProviderSettings } from '../types'

/**
 * In the open-source edition OAuth is not available.
 * These stubs keep the provider pipeline working without it.
 */

export interface OAuthProviderInfo {
  providerId: string
  name: string
  flowType: 'callback' | 'code-paste' | 'device-code'
}

export interface OAuthCredentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scope?: string
  tokenType?: string
}

export interface OAuthResult {
  success: boolean
  credentials?: OAuthCredentials
  error?: string
}

export interface OAuthStartResult {
  success: boolean
  // For code-paste flow
  verificationUrl?: string
  userCode?: string
  error?: string
}

export interface DeviceFlowStartResult extends OAuthStartResult {
  deviceCode?: string
  interval?: number
}

/**
 * IPC channel names used by the desktop OAuth flows.
 * Stubbed here so the renderer hook that references them can compile
 * in the open-source edition (no IPC traffic actually flows).
 */
export const OAuthIpcChannels = {
  LOGIN: 'oauth:login',
  CANCEL: 'oauth:cancel',
  START_LOGIN: 'oauth:start-login',
  EXCHANGE_CODE: 'oauth:exchange-code',
  START_DEVICE_FLOW: 'oauth:start-device-flow',
  WAIT_DEVICE_TOKEN: 'oauth:wait-device-token',
  REFRESH: 'oauth:refresh',
} as const

export function mergeSharedOAuthProviderSettings(
  providerId: string,
  providers: Record<string, ProviderSettings> | undefined
): ProviderSettings {
  return providers?.[providerId] || {}
}

export function resolveEffectiveApiKey(
  providerSetting: ProviderSettings,
  _platformType: string
): string {
  return providerSetting.apiKey || ''
}

export function isUsingOAuth(
  _providerSetting: ProviderSettings,
  _platformType: string
): boolean {
  return false
}

export function isOAuthExpired(_providerSetting: ProviderSettings): boolean {
  return false
}

export function toOAuthProviderId(_chatboxProviderId: string): string | undefined {
  return undefined
}

export function toOAuthSettingsProviderId(_chatboxProviderId: string): string | undefined {
  return undefined
}

// No-op credential manager stub
export function createOAuthCredentialManager(..._args: unknown[]): undefined {
  return undefined
}

// No-op OAuth fetch stubs — they are only called when `isOAuth && credentialManager` is truthy,
// which never happens in the open-source edition. Returning undefined keeps the type contract.
export function createBearerOAuthFetch(..._args: unknown[]): undefined {
  return undefined
}

export function createOpenAIOAuthFetch(..._args: unknown[]): undefined {
  return undefined
}
