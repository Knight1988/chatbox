/**
 * Google Drive REST API helpers.
 * Uses plain fetch + Bearer tokens — no googleapis SDK.
 * Scope required: https://www.googleapis.com/auth/drive.file
 *
 * Each backup creates a new timestamped file named
 * "chatbox-backup-YYYY-MM-DD HH:mm:ss.json" in the user's Drive.
 * After each backup, files beyond the 3 most recent are deleted.
 */
import dayjs from 'dayjs'
import platform from '@/platform'
import { googleAuthStore } from '@/stores/googleAuthStore'
import { type ExportDataItem, buildBackupJson, restoreFromBackupJson } from './data-backup'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const BACKUP_APP_PROPERTY_KEY = 'chatboxBackup'
const BACKUP_APP_PROPERTY_VALUE = 'true'
const MAX_BACKUP_VERSIONS = 3

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

export interface DriveBackupFile {
  id: string
  name: string
  modifiedTime: string
}

/**
 * List all chatbox backup files in Drive, sorted newest-first.
 */
async function listBackupFiles(token: string): Promise<DriveBackupFile[]> {
  const q = encodeURIComponent(
    `trashed=false and appProperties has { key='${BACKUP_APP_PROPERTY_KEY}' and value='${BACKUP_APP_PROPERTY_VALUE}' }`
  )
  const url = `${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc`

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!resp.ok) {
    throw new Error(`Drive files.list failed: ${resp.status} ${resp.statusText}`)
  }

  const data: { files: DriveBackupFile[] } = await resp.json()
  return data.files ?? []
}

/**
 * Create a new backup file in Drive using multipart upload.
 */
async function createBackupFile(token: string, filename: string, jsonContent: string): Promise<void> {
  const boundary = 'chatbox_backup_boundary'
  const metadata = JSON.stringify({
    name: filename,
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
 * Delete a backup file from Drive by its file ID.
 */
async function deleteBackupFile(token: string, fileId: string): Promise<void> {
  const resp = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  // 204 = success, 404 = already gone — both are acceptable
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Drive files.delete failed: ${resp.status} ${resp.statusText}`)
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

/**
 * Delete all backup files beyond the N most recent.
 * Errors are swallowed so a prune failure never fails the backup itself.
 */
async function pruneOldBackups(token: string): Promise<void> {
  try {
    const files = await listBackupFiles(token)
    const toDelete = files.slice(MAX_BACKUP_VERSIONS)
    for (const file of toDelete) {
      try {
        await deleteBackupFile(token, file.id)
      } catch (err) {
        console.warn(`Failed to delete old backup ${file.name}:`, err)
      }
    }
  } catch (err) {
    console.warn('Failed to prune old backups:', err)
  }
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
 * Serialize selected data and upload a new timestamped backup file to Google Drive.
 * After upload, prunes old backups beyond MAX_BACKUP_VERSIONS.
 */
export async function driveBackup(exportItems: ExportDataItem[]): Promise<void> {
  const jsonContent = await buildBackupJson(exportItems)
  const filename = `chatbox-backup-${dayjs().format('YYYY-MM-DD HH:mm:ss')}.json`

  await withTokenRetry(async (token) => {
    await createBackupFile(token, filename, jsonContent)
    await pruneOldBackups(token)
  })
}

/**
 * List all available backup versions in Google Drive, sorted newest-first.
 * Throws GoogleAuthExpiredError if auth is missing/expired and refresh fails.
 * Throws GoogleDriveNoBackupError if no backups exist.
 */
export async function driveListBackups(): Promise<DriveBackupFile[]> {
  return withTokenRetry(async (token) => {
    const files = await listBackupFiles(token)
    if (files.length === 0) {
      throw new GoogleDriveNoBackupError()
    }
    return files
  })
}

/**
 * Download the specified backup from Google Drive and restore it.
 * Calls platform.relaunch() on success (via restoreFromBackupJson).
 * Throws GoogleAuthExpiredError if auth is missing/expired and refresh fails.
 */
export async function driveRestore(fileId: string): Promise<void> {
  await withTokenRetry(async (token) => {
    const jsonText = await downloadBackupFile(token, fileId)
    await restoreFromBackupJson(jsonText)
  })
}
