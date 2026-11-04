// Equipment heads-up for a built day (2026-11-04, owner). Seen live: an
// athlete with rings and low parallettes (no bar, no band) got Band Apart in
// the warm-up, bar pull-ups and inverted rows. Owner rule: the coach keeps
// room to choose (a park bar, a band they mentioned), so this never changes
// or rejects anything: it only notes what looks like a mismatch, in the
// tool result's warnings. Kept pure so it is testable from Jest.

import { needsBand, type LevelBand } from "./blockHelpers.ts";

export interface EquipmentFlags {
  band: boolean;
  rings: boolean;
  pullBar: boolean;
  dipBar: boolean;
}

// brief.equipment is written by the model, so it is free text: setup ids
// (pull_up_bar, dip_bar, resistance_bands, low_parallettes) or plain words
// ("bar", "rings", "bands").
export function equipmentFlags(equipment: unknown): EquipmentFlags {
  const items = Array.isArray(equipment) ? equipment.filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase()) : [];
  // "full setup" / "everything" / a gym counts as all of it (§11).
  if (items.some((e) => /^(full|all|everything|gym)\b/.test(e.trim()))) {
    return { band: true, rings: true, pullBar: true, dipBar: true };
  }
  return {
    band: items.some((e) => /band/.test(e)),
    rings: items.some((e) => /ring/.test(e)),
    pullBar: items.some((e) => /bar/.test(e) && !/dip|parallel|barbell/.test(e)),
    dipBar: items.some((e) => /dip/.test(e) || /parallel.?bar/.test(e)),
  };
}

// The ring version of a bar exercise, as a suggestion. Ring Dips is an
// advanced entry, so a beginner is pointed at bench dips.
export function ringVersion(name: string, levelBand: LevelBand): string | null {
  const key = name.trim().toLowerCase();
  if (key === "pull ups (normal grip)") return "Ring Pull ups";
  if (key === "inverted row") return "Ring Row";
  if (key === "dips") return levelBand === "beginner" ? "Triceps box dips" : "Ring Dips";
  return null;
}

type DayBlock = { block_name?: string; exercises?: Array<{ name?: string }> };

// One note per exercise that seems to need equipment the brief doesn't
// list. Nothing is changed: the coach decides.
export function equipmentNotes(blocks: DayBlock[], flags: EquipmentFlags, levelBand: LevelBand): string[] {
  const notes: string[] = [];
  for (const block of blocks) {
    for (const ex of block.exercises ?? []) {
      if (typeof ex.name !== "string") continue;
      const where = `${block.block_name ?? "Block"}: "${ex.name}"`;
      const key = ex.name.trim().toLowerCase();
      const needsBar = (key === "pull ups (normal grip)" || key === "inverted row") && !flags.pullBar;
      const needsDipBar = key === "dips" && !flags.dipBar;
      if (needsBar || needsDipBar) {
        const ring = flags.rings ? ringVersion(ex.name, levelBand) : null;
        notes.push(`${where} usually needs a ${needsBar ? "bar" : "dip bar"}, which isn't in their equipment.${ring ? ` "${ring}" is the version for their rings.` : ""} Keep it if they have access to one.`);
      } else if (!flags.band && needsBand(ex.name)) {
        notes.push(`${where} needs a band, which isn't in their equipment. Keep it only if they have one.`);
      }
    }
  }
  return notes;
}
