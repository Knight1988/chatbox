/**
 * Google Drive REST API helpers.
 * Uses plain fetch + Bearer tokens — no googleapis SDK.
 * Scope required: https://www.googleapis.com/auth/drive.file
 *
 * The app creates/updates a single file named "chatbox-backup.json" in the
 * user's Drive (visible to the user, owned by the user).
 */
import platform from '@/platform'
import { googleAuthStore } from '@/stores/googleAuthStore'
import { type ExportDataItem, buildBackupJson, restoreFromBackupJson } from './data-backup'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const BACKUP_FILENAME = 'chatbox-backup.json'
const BACKUP_APP_PROPERTY_KEY = 'chatboxBackup'
const BACKUP_APP_PROPERTY_VALUE = 'true'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GoogleAuthExpiredError extends Error {
  constructor() {
    super('Google auth expired or missing — please reconnect')
    this.name = 'GoogleAuthExpiredError'
  }
}

export class GoogleDriveNoBackupError extends Error {
  constructor() {
    super('No backup found in Google Drive')
    this.name = 'GoogleDriveNoBackupError'
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Returns a valid access token, refreshing via the platform method if needed.
 * Throws GoogleAuthExpiredError if no token is available or refresh fails.
 */
async function getValidAccessToken(): Promise<string> {
  const { accessToken, expiresAt } = googleAuthStore.getState()

  // Token exists and won't expire in the next 60 seconds
  if (accessToken && expiresAt && Date.now() < expiresAt - 60_000) {
    return accessToken
  }

  // Try to refresh
  if (platform.refreshGoogleAuth) {
    try {
      return await platform.refreshGoogleAuth()
    } catch {
      googleAuthStore.getState().clearGoogleAuth()
      throw new GoogleAuthExpiredError()
    }
  }

  // No access token and no refresh method
  googleAuthStore.getState().clearGoogleAuth()
  throw new GoogleAuthExpiredError()
}

// ---------------------------------------------------------------------------
// Drive REST helpers
// ---------------------------------------------------------------------------

interface DriveFile {
  id: string
  modifiedTime?: string
}

/**
 * Find the most recently modified chatbox backup file in Drive.
 * Returns null if none found.
 */
async function findBackupFile(token: string): Promise<DriveFile | null> {
  const q = encodeURIComponent(
    `name='${BACKUP_FILENAME}' and trashed=false and appProperties has { key='${BACKUP_APP_PROPERTY_KEY}' and value='${BACKUP_APP_PROPERTY_VALUE}' }`
  )
  const url = `${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)&orderBy=modifiedTime+desc`

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!resp.ok) {
    throw new Error(`Drive files.list failed: ${resp.status} ${resp.statusText}`)
  }

  const data: { files: DriveFile[] } = await resp.json()
  return data.files?.[0] ?? null
}

/**
 * Create a new backup file in Drive using multipart upload.
 */
async function createBackupFile(token: string, jsonContent: string): Promise<void> {
  const boundary = 'chatbox_backup_boundary'
  const metadata = JSON.stringify({
    name: BACKUP_FILENAME,
    mimeType: 'application/json',
    appProperties: { [BACKUP_APP_PROPERTY_KEY]: BACKUP_APP_PROPERTY_VALUE },
  })

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    jsonContent,
    `--${boundary}--`,
  ].join('\r\n')

  const resp = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!resp.ok) {
    throw new Error(`Drive files.create failed: ${resp.status} ${resp.statusText}`)
  }
}

/**
 * Update the content of an existing backup file in Drive.
 */
async function updateBackupFile(token: string, fileId: string, jsonContent: string): Promise<void> {
  const resp = await fetch(`${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: jsonContent,
  })

  if (!resp.ok) {
    throw new Error(`Drive files.update failed: ${resp.status} ${resp.statusText}`)
  }
}

/**
 * Download the content of a backup file from Drive.
 */
async function downloadBackupFile(token: string, fileId: string): Promise<string> {
  const resp = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!resp.ok) {
    throw new Error(`Drive files.get (download) failed: ${resp.status} ${resp.statusText}`)
  }

  return resp.text()
}

// ---------------------------------------------------------------------------
// Retry wrapper for 401
// ---------------------------------------------------------------------------

/**
 * Execute a Drive operation; on 401, refresh the token once and retry.
 * If still failing, clear auth and throw GoogleAuthExpiredError.
 */
async function withTokenRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  let token = await getValidAccessToken()
  try {
    return await fn(token)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('401')) {
      // Token rejected — try to refresh once
      if (platform.refreshGoogleAuth) {
        try {
          token = await platform.refreshGoogleAuth()
          return await fn(token)
        } catch {
          googleAuthStore.getState().clearGoogleAuth()
          throw new GoogleAuthExpiredError()
        }
      }
      googleAuthStore.getState().clearGoogleAuth()
      throw new GoogleAuthExpiredError()
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize selected data and upload/update the backup file in Google Drive.
 */
export async function driveBackup(exportItems: ExportDataItem[]): Promise<void> {
  const jsonContent = await buildBackupJson(exportItems)

  await withTokenRetry(async (token) => {
    const existing = await findBackupFile(token)
    if (existing) {
      await updateBackupFile(token, existing.id, jsonContent)
    } else {
      await createBackupFile(token, jsonContent)
    }
  })
}

/**
 * Download the most recent backup from Google Drive and restore it.
 * Calls platform.relaunch() on success (via restoreFromBackupJson).
 * Throws GoogleDriveNoBackupError if no backup exists.
 * Throws GoogleAuthExpiredError if auth is missing/expired and refresh fails.
 */
export async function driveRestore(): Promise<void> {
  await withTokenRetry(async (token) => {
    const file = await findBackupFile(token)
    if (!file) {
      throw new GoogleDriveNoBackupError()
    }
    const jsonText = await downloadBackupFile(token, file.id)
    await restoreFromBackupJson(jsonText)
  })
}
