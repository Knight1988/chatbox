/**
 * MobilePlatform - Platform implementation for mobile (Capacitor) environments.
 *
 * Uses SQLite for primary storage via MobileSQLiteStorage.
 */

import * as defaults from '@shared/defaults'
import type { Config, Language, Settings, ShortcutSetting } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import { type ImageGenerationStorage, IndexedDBImageGenerationStorage } from '@/storage/ImageGenerationStorage'
import type { Exporter, Platform, PlatformType } from './interfaces'
import WebExporter from './web_exporter'
import { MobileSQLiteStorage } from './storages'

export default class MobilePlatform implements Platform {
  public type: PlatformType = 'mobile'

  public exporter: Exporter = new WebExporter()

  private imageGenerationStorage: ImageGenerationStorage | null = null

  private storage: MobileSQLiteStorage

  constructor() {
    this.storage = new MobileSQLiteStorage()
  }

  public getStorageType(): string {
    return this.storage.getStorageType()
  }

  public async setStoreValue(key: string, value: any): Promise<void> {
    return this.storage.setStoreValue(key, value)
  }

  public async getStoreValue<T = any>(key: string): Promise<T | null> {
    return this.storage.getStoreValue<T>(key)
  }

  public async removeStoreValue(key: string): Promise<void> {
    return this.storage.delStoreValue(key)
  }

  public async getAllStoreKeys(): Promise<string[]> {
    return this.storage.getAllStoreKeys()
  }

  public async getAllStoreData(): Promise<{ [key: string]: any }> {
    return this.storage.getAllStoreValues()
  }

  public async getVersion(): Promise<string> {
    return 'mobile'
  }

  public async getPlatform(): Promise<string> {
    return 'mobile'
  }

  public async getArch(): Promise<string> {
    return 'mobile'
  }

  public async shouldUseDarkColors(): Promise<boolean> {
    return false
  }

  public onSystemThemeChange(): () => void {
    return () => {}
  }

  public onWindowShow(): () => void {
    return () => {}
  }

  public onWindowFocused(): () => void {
    return () => {}
  }

  public onUpdateDownloaded(): () => void {
    return () => {}
  }

  public async openLink(url: string): Promise<void> {
    window.open(url)
  }

  public async getDeviceName(): Promise<string> {
    return 'Mobile Device'
  }

  public async getInstanceName(): Promise<string> {
    return 'Mobile Device'
  }

  public async getLocale(): Language {
    return 'en'
  }

  public async getTZ(): string {
    return 'UTC'
  }

  public async getSessionStamp(): Promise<string> {
    const sessions = await this.getAllStoreData()
    const timestamps = Object.values(sessions)
      .map((s: any) => s?.timestamp)
      .filter((t): t is number => typeof t === 'number')
    return timestamps.length > 0 ? String(Math.max(...timestamps)) : '0'
  }

  public async createSessionId(): Promise<string> {
    const stamp = await this.getSessionStamp()
    return uuidv4()
  }

  public async getImageGenerationStorage(): Promise<ImageGenerationStorage> {
    if (!this.imageGenerationStorage) {
      this.imageGenerationStorage = new IndexedDBImageGenerationStorage()
      await this.imageGenerationStorage.init()
    }
    return this.imageGenerationStorage
  }
}
