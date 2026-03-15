import * as core from 'risu-workbench-core';
import { CardService } from './card-service';

export interface CardAnalysisSummary {
  cardName: string;
  lorebookEntryCount: number;
  regexScriptCount: number;
  linkedPairs: number;
}

export class AnalysisService {
  constructor(private readonly cardService: CardService) {}

  analyzeCard(cardPath: string): CardAnalysisSummary | null {
    const card = this.cardService.readCard(cardPath);
    if (!card) {
      return null;
    }

    const lorebookEntries = core.collectLorebookCBSFromCard(card);
    const regexScripts = core.collectRegexCBSFromCard(card);
    const correlation = core.buildLorebookRegexCorrelation(lorebookEntries, regexScripts);

    return {
      cardName: core.getCardName(card),
      lorebookEntryCount: lorebookEntries.length,
      regexScriptCount: regexScripts.length,
      linkedPairs: correlation.sharedVars.length,
    };
  }
}
