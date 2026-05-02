// Simple UUID v4 generator without node:crypto dependency
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Upstream character type (minimal interface for createBlankChar).
 * Based on risuai-pork/src/ts/characters.ts:createBlankChar()
 */
export interface UpstreamCharacter {
  name: string;
  firstMessage: string;
  desc: string;
  notes: string;
  chats: Array<{
    message: unknown[];
    note: string;
    name: string;
    localLore: unknown[];
  }>;
  chatFolders: unknown[];
  chatPage: number;
  emotionImages: unknown[];
  bias: unknown[];
  viewScreen: string;
  globalLore: unknown[];
  chaId: string;
  type: 'character';
  sdData: unknown;
  utilityBot: boolean;
  customscript: unknown[];
  exampleMessage: string;
  creatorNotes: string;
  systemPrompt: string;
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  personality: string;
  scenario: string;
  firstMsgIndex: number;
  replaceGlobalNote: string;
  triggerscript: Array<{
    comment: string;
    type: string;
    conditions: unknown[];
    effect: Array<{
      type: string;
      code: string;
      indent: number;
    }>;
  }>;
  additionalText: string;
}

/**
 * V3 character card data shape (for export).
 * Based on risuai-pork/src/ts/characterCards.ts:createBaseV3()
 */
export interface CharxV3Data {
  name: string;
  description: string;
  first_mes: string;
  creator: string;
  character_version: string;
  creator_notes: string;
  system_prompt: string;
  alternate_greetings: string[];
  replaceGlobalNote: string;
  tags: string[];
  personality: string;
  scenario: string;
  character_book?: {
    entries?: unknown[];
  };
  extensions: {
    risuai: {
      customScripts: unknown[];
      triggerscript: unknown[];
      defaultVariables?: string;
      backgroundHTML?: string;
      additionalText: string;
      utilityBot: boolean;
      lowLevelAccess: boolean;
    };
  };
}

/**
 * V3 character card envelope.
 */
export interface CharxV3Envelope {
  spec: 'chara_card_v3';
  spec_version: '3.0';
  data: CharxV3Data;
}

/**
 * Creates a blank character with upstream defaults.
 * Mirrors risuai-pork/src/ts/characters.ts:createBlankChar()
 *
 * @returns Blank character with all fields initialized to defaults
 */
export function createBlankChar(): UpstreamCharacter {
  return {
    name: '',
    firstMessage: '',
    desc: '',
    notes: '',
    chats: [
      {
        message: [],
        note: '',
        name: 'Chat 1',
        localLore: [],
      },
    ],
    chatFolders: [],
    chatPage: 0,
    emotionImages: [],
    bias: [],
    viewScreen: 'none',
    globalLore: [],
    chaId: generateUUID(),
    type: 'character',
    sdData: {},
    utilityBot: false,
    customscript: [],
    exampleMessage: '',
    creatorNotes: '',
    systemPrompt: '',
    alternateGreetings: [],

    tags: [],
    creator: '',
    characterVersion: '',
    personality: '',
    scenario: '',
    firstMsgIndex: -1,
    replaceGlobalNote: '',
    triggerscript: [
      {
        comment: '',
        type: 'manual',
        conditions: [],
        effect: [
          {
            type: 'v2Header',
            code: '',
            indent: 0,
          },
        ],
      },
      {
        comment: 'New Event',
        type: 'manual',
        conditions: [],
        effect: [],
      },
    ],
    additionalText: '',
  };
}

/**
 * Converts a blank character to V3 card envelope format.
 * Mirrors risuai-pork/src/ts/characterCards.ts:createBaseV3()
 *
 * @param char - The character to convert (defaults to blank)
 * @returns V3 character card envelope
 */
export function createBlankCharxV3(char: UpstreamCharacter = createBlankChar()): CharxV3Envelope {
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: char.name,
      description: char.desc,
      first_mes: char.firstMessage,
      creator: char.creator,
      character_version: char.characterVersion,
      creator_notes: char.creatorNotes,
      system_prompt: char.systemPrompt,
      alternate_greetings: char.alternateGreetings,
      replaceGlobalNote: char.replaceGlobalNote,
      tags: char.tags,
      personality: char.personality,
      scenario: char.scenario,
      extensions: {
        risuai: {
          customScripts: char.customscript,
          triggerscript: char.triggerscript,
          additionalText: char.additionalText,
          utilityBot: char.utilityBot,
          lowLevelAccess: false,
        },
      },
    },
  };
}
