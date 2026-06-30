/**
 * Shared backup/restore logic for both file export and Google Drive backup.
 * Extracted from general.tsx so both code paths share the same serialization.
 */
import type { ProviderInfo, Settings } from '@shared/types'
import { mapValues, uniqBy } from 'lodash'
import platform from '@/platform'
import storage, { StorageKey } from '@/storage'
import { migrateOnData } from '@/stores/migration'

export enum ExportDataItem {
  Setting = 'setting',
  Key = 'key',
  Conversations = 'conversations',
  Copilot = 'copilot',
}

/**
 * Build a JSON string of selected export items, applying sensitive-field scrubbing.
 * Mirrors the streaming generator in ImportExportDataSection.onExport().
 */
export async function buildBackupJson(exportItems: ExportDataItem[]): Promise<string> {
  const date = new Date()
  const result: Record<string, unknown> = {
    __exported_items: exportItems,
    __exported_at: date.toISOString(),
  }

  try {
    const allKeys = await storage.getAllKeys()

    for (const key of allKeys) {
      let shouldExport = false

      if (key === StorageKey.Settings && exportItems.includes(ExportDataItem.Setting)) {
        shouldExport = true
      } else if (key.startsWith('session:') && exportItems.includes(ExportDataItem.Conversations)) {
        shouldExport = true
      } else if (key === StorageKey.MyCopilots && exportItems.includes(ExportDataItem.Copilot)) {
        shouldExport = true
      } else if (key === StorageKey.ChatSessionsList && exportItems.includes(ExportDataItem.Conversations)) {
        shouldExport = true
      } else if (key === StorageKey.ChatSessionSettings && exportItems.includes(ExportDataItem.Conversations)) {
        shouldExport = true
      } else if (
        key === StorageKey.PictureSessionSettings &&
        exportItems.includes(ExportDataItem.Conversations)
      ) {
        shouldExport = true
      } else if (key === StorageKey.ConfigVersion) {
        shouldExport = true
      }

      // Never export the device uuid
      if (key === StorageKey.Configs) {
        shouldExport = false
      }

      if (shouldExport) {
        try {
          const value = await storage.getItem(key, null)
          if (value !== null) {
            if (key === StorageKey.Settings) {
              // Strip sensitive fields
              const cleanedSettings = { ...(value as Settings) }
              cleanedSettings.licenseDetail = undefined
              cleanedSettings.licenseInstances = undefined

              if (!exportItems.includes(ExportDataItem.Key)) {
                delete cleanedSettings.licenseKey
                if (cleanedSettings.providers) {
                  cleanedSettings.providers = mapValues(
                    cleanedSettings.providers,
                    (provider: ProviderInfo) => {
                      const cleanedProvider = { ...provider }
                      delete cleanedProvider.apiKey
                      delete cleanedProvider.accessKey
                      delete cleanedProvider.secretKey
                      delete cleanedProvider.sessionToken
                      return cleanedProvider
                    }
                  ) as unknown as { [key: string]: ProviderInfo }
                }
              }

              result[key] = cleanedSettings
            } else {
              result[key] = value
            }
          }
        } catch (error) {
          console.warn(`Failed to export key ${key}:`, error)
        }
      }
    }
  } catch (error) {
    console.error('Failed to get storage keys:', error)
  }

  return JSON.stringify(result)
}

/**
 * Restore app data from a JSON backup string.
 * Runs migration, writes each entry, merges session list, then relaunches.
 * Throws on parse error or migration failure.
 */
export async function restoreFromBackupJson(jsonText: string): Promise<void> {
  const importData = JSON.parse(jsonText) // throws SyntaxError on bad JSON

  // Migrate old-version exports
  await migrateOnData(
    {
      getData: (key, defaultValue) => Promise.resolve(importData[key] ?? defaultValue),
      setData: (key, value) => {
        importData[key] = value
        return Promise.resolve()
      },
      setAll: (data) => {
        Object.assign(importData, data)
        return Promise.resolve()
      },
    },
    false
  )

  // Determine whether the backup included API keys/credentials
  const exportedItems: ExportDataItem[] = Array.isArray(importData['__exported_items'])
    ? importData['__exported_items']
    : []
  const backupIncludedKeys = exportedItems.includes(ExportDataItem.Key)

  const entriesToImport = Object.entries(importData).filter(
    ([key]) =>
      key !== StorageKey.ChatSessionsList && key !== StorageKey.ConfigVersion && !key.startsWith('__')
  )

  const importedChatSessions = Array.isArray(importData[StorageKey.ChatSessionsList])
    ? importData[StorageKey.ChatSessionsList]
    : undefined

  for (const [key, value] of entriesToImport) {
    if (key === StorageKey.Settings && !backupIncludedKeys) {
      // The backup was exported without credentials — preserve the user's existing
      // API keys, access keys, secret keys, session tokens, OAuth credentials, and
      // license key so they are not wiped out by the restore.
      const currentSettings = await storage.getItem<Settings | null>(StorageKey.Settings, null)
      const importedSettings = value as Settings

      if (currentSettings) {
        // Preserve top-level licenseKey if the backup doesn't have one
        if (!importedSettings.licenseKey && currentSettings.licenseKey) {
          importedSettings.licenseKey = currentSettings.licenseKey
        }

        // Preserve per-provider credentials that are missing from the backup
        if (currentSettings.providers) {
          importedSettings.providers = importedSettings.providers ?? {}
          for (const [providerId, currentProvider] of Object.entries(currentSettings.providers)) {
            const importedProvider = importedSettings.providers[providerId]
            if (importedProvider) {
              // Provider exists in import — fill in missing credential fields
              if (!importedProvider.apiKey && currentProvider.apiKey) {
                importedProvider.apiKey = currentProvider.apiKey
              }
              if (!importedProvider.accessKey && currentProvider.accessKey) {
                importedProvider.accessKey = currentProvider.accessKey
              }
              if (!importedProvider.secretKey && currentProvider.secretKey) {
                importedProvider.secretKey = currentProvider.secretKey
              }
              if (!importedProvider.sessionToken && currentProvider.sessionToken) {
                importedProvider.sessionToken = currentProvider.sessionToken
              }
              if (!importedProvider.oauth && currentProvider.oauth) {
                importedProvider.oauth = currentProvider.oauth
              }
            } else {
              // Provider not in backup at all — keep the user's existing entry
              importedSettings.providers[providerId] = currentProvider
            }
          }
        }
      }

      await storage.setItemNow(key, importedSettings)
    } else {
      await storage.setItemNow(key, value)
    }
  }

  if (importedChatSessions) {
    const previousChatSessions = await storage.getItem(StorageKey.ChatSessionsList, [])
    await storage.setItemNow(
      StorageKey.ChatSessionsList,
      uniqBy([...previousChatSessions, ...importedChatSessions], 'id')
    )
  }

  platform.relaunch()
}
