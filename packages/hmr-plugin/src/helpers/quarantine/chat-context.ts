export type ResolvedChatContext = {
  readonly characterIndex: number | null;
  readonly characterId: string | null;
  readonly characterName: string | null;
  readonly chatIndex: number | null;
  readonly chatId: string | null;
  readonly chatName?: string;
};

type ContextIndices = {
  readonly characterIndex: number | null;
  readonly chatIndex: number | null;
};

type TextFields = readonly string[];

const CHARACTER_ID_FIELDS = ["chaId", "characterId", "id"] as const;
const CHARACTER_NAME_FIELDS = ["name", "characterName"] as const;
const CHAT_ID_FIELDS = ["chatId", "id"] as const;
const CHAT_NAME_FIELDS = ["name", "chatName", "title"] as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const readText = (source: unknown, fields: TextFields): string | null => {
  if (!isRecord(source)) {
    return null;
  }

  for (const field of fields) {
    const value = source[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
};

const readIndex = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

const readLocalChat = (character: unknown, chatIndex: number | null): unknown => {
  if (!isRecord(character) || chatIndex === null) {
    return null;
  }

  const chats = character["chats"];
  return Array.isArray(chats) ? chats[chatIndex] ?? null : null;
};

const toResolvedChatContext = (
  character: unknown,
  chat: unknown,
  indices: ContextIndices,
): ResolvedChatContext => {
  const base = {
    characterIndex: indices.characterIndex,
    characterId: readText(character, CHARACTER_ID_FIELDS),
    characterName: readText(character, CHARACTER_NAME_FIELDS),
    chatIndex: indices.chatIndex,
    chatId: readText(chat, CHAT_ID_FIELDS),
  } satisfies Omit<ResolvedChatContext, "chatName">;

  const chatName = readText(chat, CHAT_NAME_FIELDS);
  return chatName === null ? base : { ...base, chatName };
};

const warnChatContextUnavailable = (operation: string, error: Error): void => {
  console.warn(`Chat context ${operation} is unavailable on this page: ${error.message}`);
};

export class ChatContext {
  async resolve(): Promise<ResolvedChatContext> {
    const character = await this.readCurrentCharacter();
    const characterIndex = await this.readCurrentCharacterIndex();
    const chatIndex = await this.readCurrentChatIndex();
    const indexedChat = await this.readIndexedChat(characterIndex, chatIndex);
    const chat = indexedChat ?? readLocalChat(character, chatIndex);

    return toResolvedChatContext(character, chat, { characterIndex, chatIndex });
  }

  private async readCurrentCharacter(): Promise<unknown> {
    try {
      return await risuai.getCharacter();
    } catch (error) {
      if (error instanceof Error) {
        warnChatContextUnavailable("character", error);
        return null;
      }

      throw error;
    }
  }

  private async readCurrentCharacterIndex(): Promise<number | null> {
    try {
      return readIndex(await risuai.getCurrentCharacterIndex());
    } catch (error) {
      if (error instanceof Error) {
        warnChatContextUnavailable("character index", error);
        return null;
      }

      throw error;
    }
  }

  private async readCurrentChatIndex(): Promise<number | null> {
    try {
      return readIndex(await risuai.getCurrentChatIndex());
    } catch (error) {
      if (error instanceof Error) {
        warnChatContextUnavailable("chat index", error);
        return null;
      }

      throw error;
    }
  }

  private async readIndexedChat(
    characterIndex: number | null,
    chatIndex: number | null,
  ): Promise<unknown> {
    if (
      characterIndex === null ||
      chatIndex === null ||
      typeof risuai.getChatFromIndex !== "function"
    ) {
      return null;
    }

    try {
      return await risuai.getChatFromIndex(characterIndex, chatIndex);
    } catch (error) {
      if (error instanceof Error) {
        warnChatContextUnavailable("indexed chat", error);
        return null;
      }

      throw error;
    }
  }
}
