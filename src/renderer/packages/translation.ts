/**
 * Translation service stub for the open-source edition.
 * Returns the input texts unchanged so callers that depend on this
 * module can still operate without an active translation backend.
 */

export interface TranslateTextsOptions {
  sourceLang?: string
}

export async function translateTexts(texts: string[], _language: string, _options?: TranslateTextsOptions): Promise<string[]> {
  return texts
}