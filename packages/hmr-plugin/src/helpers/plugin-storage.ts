import { PLUGIN_NAME } from "../constants/plugin"

export type StorageScope = "global" | "character" | "chat"

export type ChatStorageContext = {
  readonly characterId: string
  readonly chatId: string
}

export type StorageKeyInput = {
  readonly pluginName: string
  readonly scope: StorageScope
  readonly ids: readonly string[]
  readonly key: string
}

export class PluginStorageKeyError extends Error {
  constructor(readonly segment: string) {
    super(`Storage key segment must be non-empty and cannot contain colon: ${segment}`)
    this.name = "PluginStorageKeyError"
  }
}

export function makeKey(input: StorageKeyInput): string {
  const segments = [input.pluginName, input.scope, ...input.ids, input.key]

  for (const segment of segments) {
    if (segment.length === 0 || segment.includes(":")) {
      throw new PluginStorageKeyError(segment)
    }
  }

  return segments.join(":")
}

function scopedKey(scope: StorageScope, ids: readonly string[], key: string): string {
  return makeKey({ pluginName: PLUGIN_NAME, scope, ids, key })
}

export async function getGlobalStorage<T>(key: string): Promise<T | null> {
  const value: T | null = await risuai.pluginStorage.getItem(scopedKey("global", [], key))
  return value
}

export async function setGlobalStorage<T>(key: string, value: T): Promise<void> {
  await risuai.pluginStorage.setItem(scopedKey("global", [], key), value)
}

export async function removeGlobalStorage(key: string): Promise<void> {
  await risuai.pluginStorage.removeItem(scopedKey("global", [], key))
}

export async function getCharacterStorage<T>(characterId: string, key: string): Promise<T | null> {
  const value: T | null = await risuai.pluginStorage.getItem(scopedKey("character", [characterId], key))
  return value
}

export async function setCharacterStorage<T>(characterId: string, key: string, value: T): Promise<void> {
  await risuai.pluginStorage.setItem(scopedKey("character", [characterId], key), value)
}

export async function removeCharacterStorage(characterId: string, key: string): Promise<void> {
  await risuai.pluginStorage.removeItem(scopedKey("character", [characterId], key))
}

export async function getCurrentChatStorage<T>(context: ChatStorageContext, key: string): Promise<T | null> {
  const value: T | null = await risuai.pluginStorage.getItem(
    scopedKey("chat", [context.characterId, context.chatId], key),
  )
  return value
}

export async function setCurrentChatStorage<T>(context: ChatStorageContext, key: string, value: T): Promise<void> {
  await risuai.pluginStorage.setItem(scopedKey("chat", [context.characterId, context.chatId], key), value)
}

export async function removeCurrentChatStorage(context: ChatStorageContext, key: string): Promise<void> {
  await risuai.pluginStorage.removeItem(scopedKey("chat", [context.characterId, context.chatId], key))
}
