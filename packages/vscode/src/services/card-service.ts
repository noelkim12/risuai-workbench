import * as core from 'risu-workbench-core';

declare const require: (id: string) => any;

const { parseCardFile } = require('risu-workbench-core/node') as {
  parseCardFile: (cardPath: string) => unknown;
};

export interface CardSummary {
  path: string;
  name: string;
  lorebookEntries: number;
  customScripts: number;
}

export class CardService {
  readCard(cardPath: string): core.CardLike | null {
    const parsed = parseCardFile(cardPath);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as core.CardLike;
  }

  summarizeCard(cardPath: string): CardSummary | null {
    const card = this.readCard(cardPath);
    if (!card) {
      return null;
    }

    const lorebookEntries = core.getAllLorebookEntries(card).length;
    const customScripts = core.getCustomScripts(card).length;

    return {
      path: cardPath,
      name: core.getCardName(card),
      lorebookEntries,
      customScripts,
    };
  }
}
