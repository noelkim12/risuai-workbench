import { RECIPE as editEntity } from './edit-entity';
import { RECIPE as howDoesXWork } from './how-does-x-work';
import { RECIPE as addNewEntry } from './add-new-entry';
import { RECIPE as explainArtifact } from './explain-artifact';
import { RECIPE as reviewUnknownArtifact } from './review-unknown-artifact';
import { RECIPE as writeNarrative } from './write-narrative';
import { RECIPE as manageCompanions } from './manage-companions';

export interface RecipeFile {
  filename: string;
  content: string;
}

export function getAllRecipes(): RecipeFile[] {
  return [
    { filename: 'edit-entity.md', content: editEntity },
    { filename: 'how-does-x-work.md', content: howDoesXWork },
    { filename: 'add-new-entry.md', content: addNewEntry },
    { filename: 'explain-artifact.md', content: explainArtifact },
    { filename: 'review-unknown-artifact.md', content: reviewUnknownArtifact },
    { filename: 'write-narrative.md', content: writeNarrative },
    { filename: 'manage-companions.md', content: manageCompanions },
  ];
}
