/**
 * Google OAuth loopback + PKCE flow for the Electron main process.
 *
 * Uses a "Desktop app" OAuth client (no client secret required).
 * Opens the system browser to the Google authorization URL, captures the
 * auth code via a temporary local HTTP server, exchanges it for tokens.
 *
 * References:
 *   https://developers.google.com/identity/protocols/oauth2/native-app
 */

import * as crypto from 'node:crypto'
import * as http from 'node:http'
import { shell } from 'electron'

// Client ID injected at build time (see electron.vite.config.ts)
const DESKTOP_CLIENT_ID = process.env.CHATBOX_GOOGLE_CLIENT_ID_DESKTOP || ''

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email'
const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes to complete login

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(64).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

// ---------------------------------------------------------------------------
// Loopback HTTP server (captures OAuth redirect)
// ---------------------------------------------------------------------------

interface LoopbackResult {
  code: string
  port: number
}

function startLoopbackServer(): Promise<{ server: http.Server; result: Promise<LoopbackResult> }> {
  return new Promise((resolveServer) => {
    let resolveResult: (v: LoopbackResult) => void
    let rejectResult: (e: Error) => void
    const result = new Promise<LoopbackResult>((res, rej) => {
      resolveResult = res
      rejectResult = rej
    })

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          `<html><body><h2>Authentication failed</h2><p>${error}</p><p>You may close this window.</p></body></html>`
        )
        server.close()
        rejectResult(new Error(`OAuth error: ${error}`))
        return
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          '<html><body><h2>Authentication successful!</h2><p>You may close this window and return to Chatbox.</p></body></html>'
        )
        server.close()
        resolveResult({ code, port: (server.address() as any).port })
      }
    })

    server.listen(0, '127.0.0.1', () => {
      resolveServer({ server, result })
    })
  })
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
  email?: string
}

async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: DESKTOP_CLIENT_ID,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token exchange failed: ${resp.status} ${text}`)
  }

  const data = await resp.json()

  // Decode email from id_token (JWT payload — client-side, no signature verification needed)
  let email: string | undefined
  if (data.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64').toString('utf8'))
      email = payload.email
    } catch {
      // email is optional
    }
  }

  return { ...data, email }
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export interface RefreshResult {
  access_token: string
  expires_in: number
}

export async function googleRefresh(refreshToken: string): Promise<RefreshResult> {
  const body = new URLSearchParams({
    client_id: DESKTOP_CLIENT_ID,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token refresh failed: ${resp.status} ${text}`)
  }

  return resp.json()
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function googleLoginLoopback(): Promise<TokenResponse> {
  if (!DESKTOP_CLIENT_ID) {
    throw new Error('CHATBOX_GOOGLE_CLIENT_ID_DESKTOP is not configured')
  }

  const { verifier, challenge } = generatePKCE()
  const { server, result: resultPromise } = await startLoopbackServer()

  const port = (server.address() as any).port
  const redirectUri = `http://127.0.0.1:${port}`

  const params = new URLSearchParams({
    client_id: DESKTOP_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent', // ensures refresh_token is returned
  })

  await shell.openExternal(`${GOOGLE_AUTH_URL}?${params.toString()}`)

  // Wait for the auth code with a timeout
  const { code } = await Promise.race([
    resultPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        server.close()
        reject(new Error('Google login timed out (5 minutes)'))
      }, TIMEOUT_MS)
    ),
  ])

  return exchangeCodeForTokens(code, verifier, redirectUri)
}
