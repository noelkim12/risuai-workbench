export type HmrTargetKind = "character" | "module";

export type WizardSelection =
  | { readonly kind: "character"; readonly chaId: string; readonly label: string }
  | { readonly kind: "module"; readonly moduleId: string; readonly label: string };

const CHARACTER_TARGET_KINDS = ["character", "module"] as const;
const MODULE_TARGET_KINDS = ["module"] as const;

export function availableTargetKinds(projectKind: HmrTargetKind): readonly HmrTargetKind[] {
  return projectKind === "character" ? CHARACTER_TARGET_KINDS : MODULE_TARGET_KINDS;
}
