/**
 * Desktop user-auth module — OAuth 2.0 Authorization Code Flow + PKCE,
 * backed by the Klaus web server's /api/auth/desktop/* endpoints.
 *
 * Callback transport: loopback HTTP on a random localhost port (RFC 8252
 * "native apps" pattern). This is the same mechanism GitHub CLI, VSCode's
 * MS login, and Claude's own OAuth use. It's more robust than custom URL
 * schemes: no LaunchServices registration, no packaging dependency, no
 * "allow this app to open?" prompt, works identically in dev and packaged
 * builds, and immune to scheme-handler hijacking by other electron apps on
 * the same machine.
 *
 * Flow:
 *   1. startLogin() spins up an http.Server on 127.0.0.1:0 (random free
 *      port), generates PKCE verifier+challenge+state, then opens the
 *      server's /login page in the system browser with ?desktop=1
 *      &state=…&code_challenge=…&redirect_port=<port>.
 *   2. Web login completes → server 302s the browser to
 *      http://localhost:<port>/auth/callback?code=…&state=…
 *   3. Our loopback listener receives the GET, validates state, serves a
 *      tiny "登录成功，可关闭此页面" HTML so the user knows it worked,
 *      then POSTs code+verifier to /api/auth/desktop/token.
 *   4. Bearer token is persisted to ~/.klaus/desktop-auth.json (0600) and
 *      the startLogin() promise resolves.
 *
 * Token persistence: plain JSON. Keytar isn't used to keep the Electron
 * build dependency-free; the file lives inside the user's home which
 * already carries comparable trust.
 */

import { shell } from 'electron'
import { randomBytes, createHash } from 'node:crypto'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, chmodSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

// ---------- Config ----------

const AUTH_FILE = join(homedir(), '.klaus', 'desktop-auth.json')
export const SERVER_URL = 'https://klaus-ai.site'

export interface StoredAuth {
  token: string
  user: {
    id: string
    email: string
    displayName: string
    role: string
    avatarUrl: string | null
  }
  loggedInAt: number
}

// ---------- PKCE helpers ----------

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest())
}

function generateState(): string {
  return randomBytes(16).toString('hex')
}

// ---------- Token persistence ----------

function readStoredAuth(): StoredAuth | null {
  try {
    if (!existsSync(AUTH_FILE)) return null
    const raw = readFileSync(AUTH_FILE, 'utf8')
    const data = JSON.parse(raw) as StoredAuth
    if (!data?.token || !data?.user?.id) return null
    return data
  } catch (err) {
    console.warn('[KlausAuth] Failed to read stored auth:', err)
    return null
  }
}

function writeStoredAuth(auth: StoredAuth): void {
  mkdirSync(dirname(AUTH_FILE), { recursive: true })
  writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf8')
  try { chmodSync(AUTH_FILE, 0o600) } catch { /* best-effort */ }
}

function deleteStoredAuth(): void {
  try { if (existsSync(AUTH_FILE)) unlinkSync(AUTH_FILE) } catch { /* ignore */ }
}

// ---------- Module state ----------

let currentAuth: StoredAuth | null = readStoredAuth()
let inflightAbort: (() => void) | null = null

// ---------- Loopback callback listener ----------

interface CallbackResult {
  code: string
  state: string
}

/**
 * Start an HTTP server on 127.0.0.1:<random-free-port> and wait for a single
 * GET /auth/callback?code=…&state=… request. Rejects on timeout (10 min) or
 * close. Server is bound to loopback only so other hosts on the network
 * can't hit it.
 */
function waitForCallback(
  expectedState: string,
): { port: Promise<number>; result: Promise<CallbackResult>; close: () => void } {
  let server: Server | null = null
  let settled = false

  const portResolvers: { resolve: (p: number) => void; reject: (e: Error) => void } = {} as any
  const portPromise = new Promise<number>((resolve, reject) => {
    portResolvers.resolve = resolve
    portResolvers.reject = reject
  })

  const resultResolvers: {
    resolve: (r: CallbackResult) => void
    reject: (e: Error) => void
  } = {} as any
  const resultPromise = new Promise<CallbackResult>((resolve, reject) => {
    resultResolvers.resolve = resolve
    resultResolvers.reject = reject
  })

  const close = () => {
    if (server) {
      try { server.close() } catch { /* ignore */ }
      server = null
    }
  }

  const finishErr = (err: Error) => {
    if (settled) return
    settled = true
    resultResolvers.reject(err)
    close()
  }

  const finishOk = (r: CallbackResult) => {
    if (settled) return
    settled = true
    resultResolvers.resolve(r)
    // Give the browser a moment to receive the success page before we close
    setTimeout(close, 100)
  }

  const timer = setTimeout(
    () => finishErr(new Error('login timed out after 10 minutes')),
    10 * 60 * 1000,
  )
  resultPromise.finally(() => clearTimeout(timer)).catch(() => {})

  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`)
      if (req.method !== 'GET' || url.pathname !== '/auth/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('not found')
        return
      }

      const code = url.searchParams.get('code') ?? ''
      const state = url.searchParams.get('state') ?? ''
      const errorParam = url.searchParams.get('error') ?? ''

      if (errorParam) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderCallbackHtml(false, errorParam))
        finishErr(new Error('auth error: ' + errorParam))
        return
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderCallbackHtml(false, 'missing code or state'))
        finishErr(new Error('callback missing code or state'))
        return
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderCallbackHtml(false, 'state mismatch'))
        finishErr(new Error('state mismatch — possible CSRF'))
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(renderCallbackHtml(true))
      finishOk({ code, state })
    } catch (err: any) {
      finishErr(new Error('callback handler error: ' + (err?.message || String(err))))
    }
  })

  server.on('error', (err) => {
    if (!settled) {
      portResolvers.reject(err)
      finishErr(err)
    }
  })

  server.listen(0, '127.0.0.1', () => {
    const addr = server?.address()
    if (addr && typeof addr !== 'string') {
      portResolvers.resolve(addr.port)
    } else {
      portResolvers.reject(new Error('failed to get listener port'))
      finishErr(new Error('failed to get listener port'))
    }
  })

  return { port: portPromise, result: resultPromise, close }
}

function renderCallbackHtml(ok: boolean, errorMsg?: string): string {
  const title = ok ? '登录成功' : '登录失败'
  const body = ok
    ? '你已登录 Klaus，可关闭此页面返回应用。'
    : `登录失败：${errorMsg ?? '未知错误'}`
  return `<!DOCTYPE html>
<html lang="zh"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Klaus — ${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box }
:root {
  --bg:#ffffff; --fg:#0f172a; --muted:#64748b;
  --font:'Inter',-apple-system,sans-serif;
}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#f8fafc;--muted:#94a3b8}}
html,body{height:100%;font-family:var(--font);background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{text-align:center;max-width:360px}
h1{font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:10px}
p{font-size:14px;color:var(--muted);line-height:1.6}
</style></head><body>
<div class="wrap"><div class="card"><h1>${title}</h1><p>${body}</p></div></div>
</body></html>`
}

// ---------- Public API ----------

/** Currently stored auth (if any). */
export function getCurrentAuth(): StoredAuth | null {
  return currentAuth
}

export interface AuthStatus {
  loggedIn: boolean
  user?: StoredAuth['user']
}

export function getStatus(): AuthStatus {
  if (!currentAuth) return { loggedIn: false }
  return { loggedIn: true, user: currentAuth.user }
}

/**
 * Kick off the login flow. Starts a loopback listener, opens the server's
 * /login page in the default browser, and resolves when the callback comes
 * back. Calling while another login is in flight cancels the previous one.
 */
export async function startLogin(): Promise<StoredAuth> {
  // Cancel any in-flight attempt
  if (inflightAbort) {
    try { inflightAbort() } catch { /* ignore */ }
    inflightAbort = null
  }

  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  const state = generateState()

  const listener = waitForCallback(state)
  inflightAbort = () => listener.close()

  try {
    const port = await listener.port

    const loginUrl = new URL('/login', SERVER_URL)
    loginUrl.searchParams.set('desktop', '1')
    loginUrl.searchParams.set('state', state)
    loginUrl.searchParams.set('code_challenge', challenge)
    loginUrl.searchParams.set('redirect_port', String(port))

    await shell.openExternal(loginUrl.toString())

    const { code } = await listener.result

    const resp = await fetch(`${SERVER_URL}/api/auth/desktop/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        state,
        device_info: `Klaus Desktop/${process.platform}`,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`token exchange failed (${resp.status}): ${errText.slice(0, 200)}`)
    }

    const data = (await resp.json()) as { token: string; user: StoredAuth['user'] }
    if (!data?.token || !data?.user) {
      throw new Error('token exchange returned invalid payload')
    }

    const auth: StoredAuth = {
      token: data.token,
      user: data.user,
      loggedInAt: Date.now(),
    }
    writeStoredAuth(auth)
    currentAuth = auth
    return auth
  } finally {
    inflightAbort = null
    listener.close()
  }
}

/** Revoke token on the server (best-effort) and clear local state. */
export async function logout(): Promise<void> {
  const auth = currentAuth
  if (auth) {
    try {
      await fetch(`${SERVER_URL}/api/auth/desktop/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
      })
    } catch (err) {
      console.warn('[KlausAuth] Server logout failed (continuing):', err)
    }
  }
  currentAuth = null
  deleteStoredAuth()
}

/**
 * GET JSON from a Klaus server path with Bearer auth. Returns null on any
 * failure (no token, network, non-2xx, parse error). A 401 response drops
 * local auth state so boot() will surface the login screen on next check.
 *
 * Used by engine-host to pull prompts from /api/prompts; every cloud-synced
 * read should go through this one helper so auth + error handling is uniform.
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  if (!currentAuth) return null
  try {
    const resp = await fetch(`${SERVER_URL}${path}`, {
      headers: { Authorization: `Bearer ${currentAuth.token}` },
    })
    if (resp.status === 401) {
      currentAuth = null
      deleteStoredAuth()
      return null
    }
    if (!resp.ok) return null
    return (await resp.json()) as T
  } catch (err) {
    console.warn(`[KlausAuth] apiGet(${path}) failed:`, err)
    return null
  }
}

/**
 * Refresh user info from the server. Returns null if the token was rejected
 * (401) and local state is cleared. Network errors leave state untouched
 * and return the cached user.
 */
export async function refreshMe(): Promise<StoredAuth['user'] | null> {
  if (!currentAuth) return null
  const auth = currentAuth
  try {
    const resp = await fetch(`${SERVER_URL}/api/auth/desktop/me`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (resp.status === 401) {
      currentAuth = null
      deleteStoredAuth()
      return null
    }
    if (!resp.ok) return auth.user
    const data = (await resp.json()) as { user: StoredAuth['user'] }
    if (data?.user) {
      currentAuth = { ...auth, user: data.user }
      writeStoredAuth(currentAuth)
      return data.user
    }
    return auth.user
  } catch (err) {
    console.warn('[KlausAuth] refreshMe network error:', err)
    return auth.user
  }
}
