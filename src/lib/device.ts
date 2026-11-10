// ============================================================
// Device token — stable anonymous identity stored in localStorage
// Used to tie requests/devices to a browser without login
// ============================================================

const DEVICE_TOKEN_KEY = 'tk_device_token'

export function getDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  }
  return token
}

export function getDeviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Browser'
}

// Per-table session code stored in localStorage
const SESSION_CODE_PREFIX = 'tk_session_code_'
const SESSION_ID_PREFIX = 'tk_session_id_'

export function storeSessionAccess(tableId: string, sessionId: string, code: string) {
  localStorage.setItem(SESSION_CODE_PREFIX + tableId, code)
  localStorage.setItem(SESSION_ID_PREFIX + tableId, sessionId)
}

export function getStoredSessionId(tableId: string): string | null {
  return localStorage.getItem(SESSION_ID_PREFIX + tableId)
}

export function clearSessionAccess(tableId: string) {
  localStorage.removeItem(SESSION_CODE_PREFIX + tableId)
  localStorage.removeItem(SESSION_ID_PREFIX + tableId)
}

export function getIdempotencyKey(): string {
  return crypto.randomUUID()
}

// ── Paired device token (for shared tablets/phones) ──────────

const PAIRED_DEVICE_KEY = 'tk_paired_device_token'

export function getPairedDeviceToken(): string | null {
  return localStorage.getItem(PAIRED_DEVICE_KEY)
}

export function setPairedDeviceToken(token: string) {
  localStorage.setItem(PAIRED_DEVICE_KEY, token)
}

export function clearPairedDeviceToken() {
  localStorage.removeItem(PAIRED_DEVICE_KEY)
}

// ── PIN session token (for PIN-based login on shared devices) ─

const STAFF_SESSION_KEY = 'tk_staff_session_token'

export function getStaffSessionToken(): string | null {
  return localStorage.getItem(STAFF_SESSION_KEY)
}

export function setStaffSessionToken(token: string) {
  localStorage.setItem(STAFF_SESSION_KEY, token)
}

export function clearStaffSessionToken() {
  localStorage.removeItem(STAFF_SESSION_KEY)
}
