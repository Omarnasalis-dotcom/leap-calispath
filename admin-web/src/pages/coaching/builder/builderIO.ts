import { supabase } from '@/lib/supabase';
import { fetchAllRows, fetchByIds } from '@/lib/fetchAll';
import { BlockConceptParser } from '@/shared/BlockConceptParser';
import { clientKey, type BuilderBlock, type BuilderDay, type BuilderWeeks } from './types';

// Load + save logic mirrors src/hooks/coaching/useProgramBuilder.ts
// (loadExistingTemplate / handleSaveTemplate) exactly, so templates built
// on either platform round-trip losslessly through the same
// save_program_template RPC and the same "<Day> | <Block>" +
// "[CONCEPT:{...}] notes" encoding.

type BlockRow = { id: string; name: string | null; notes: string | null; order_index: number | null; week_number: number | null };

/** Every block and exercise row of a template. Paged: a long program has
 * more than 1,000 exercises, and a save of a partly loaded program deletes
 * the rows it didn't load. */
async function fetchTemplateRows(templateId: string): Promise<{ blocks: BlockRow[]; exercises: Array<Record<string, unknown>> }> {
  const blocks = await fetchAllRows<BlockRow>(
    (from, to) =>
      supabase
        .from('program_blocks')
        .select('id, name, notes, order_index, week_number')
        .eq('template_id', templateId)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
  );

  const exercises = await fetchByIds<Record<string, unknown>>(blocks.map((b) => b.id), (chunk, from, to) =>
    supabase
        .from('block_exercises')
        .select('id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index, exercise_library(name)')
        .in('block_id', chunk)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );
  return { blocks, exercises };
}

/** What the program looked like, as one string: changes when any block or
 * exercise is added, removed or edited (by the athlete, the AI Coach, a
 * review or another admin). Compared right before a save so the save never
 * overwrites changes made after the editor loaded. */
function fingerprintOf(rows: { blocks: BlockRow[]; exercises: Array<Record<string, unknown>> }): string {
  const blocks = rows.blocks
    .map((b) => [b.id, b.name, b.notes, b.week_number, b.order_index].join('\u0001'))
    .sort();
  const exercises = rows.exercises
    .map((e) =>
      [e.id, e.block_id, e.exercise_id, e.sets, e.reps, e.rest_seconds, e.hold_seconds, e.is_weighted, e.notes, e.order_index].join('\u0001'),
    )
    .sort();
  return `${blocks.join('\u0002')}\u0003${exercises.join('\u0002')}`;
}

export async function fetchTemplateFingerprint(templateId: string): Promise<string> {
  return fingerprintOf(await fetchTemplateRows(templateId));
}

export async function loadTemplateWeeks(templateId: string): Promise<{
  name: string;
  description: string;
  weeks: BuilderWeeks;
  fingerprint: string;
}> {
  const { data: template, error: templateErr } = await supabase
    .from('program_templates')
    .select('name, description')
    .eq('id', templateId)
    .single();
  if (templateErr) throw new Error(templateErr.message);

  const rows = await fetchTemplateRows(templateId);
  const { blocks } = rows;
  const exByBlock = new Map<string, BuilderBlock['exercises']>();
  for (const raw of rows.exercises) {
    const blockId = raw.block_id as string;
    const list = exByBlock.get(blockId) ?? [];
    list.push({
      id: clientKey(),
      exercise_id: raw.exercise_id as string,
      exercise_name: (raw.exercise_library as { name?: string } | null)?.name,
      sets: raw.sets as number | null,
      reps: raw.reps as number | null,
      rest_seconds: raw.rest_seconds as number | null,
      hold_seconds: raw.hold_seconds as number | null,
      is_weighted: Boolean(raw.is_weighted),
      notes: (raw.notes as string | null) ?? '',
    });
    exByBlock.set(blockId, list);
  }

  // Group blocks by week_number → day name (parsed from "<Day> | <Block>").
  const weekDayMaps = new Map<number, Map<string, BuilderDay>>();
  const weekDayOrder = new Map<number, string[]>();

  for (const b of blocks) {
    const weekNum = b.week_number ?? 1;
    const raw = b.name ?? '';
    let dayName = raw;
    let blockName = 'Workout Routine';
    const sep = raw.indexOf(' | ');
    if (sep !== -1) {
      dayName = raw.slice(0, sep).trim();
      blockName = raw.slice(sep + 3).trim();
    }

    const { metadata, cleanNotes } = BlockConceptParser.parse(b.notes);

    const block: BuilderBlock = {
      id: clientKey(),
      db_id: b.id,
      name: blockName,
      notes: cleanNotes,
      metadata,
      exercises: exByBlock.get(b.id) ?? [],
    };

    if (!weekDayMaps.has(weekNum)) {
      weekDayMaps.set(weekNum, new Map());
      weekDayOrder.set(weekNum, []);
    }
    const dayKey = dayName.toUpperCase();
    const dayMap = weekDayMaps.get(weekNum)!;
    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, { id: clientKey(), name: dayName, focus_tag: metadata.focus_tag, blocks: [] });
      weekDayOrder.get(weekNum)!.push(dayKey);
    }
    dayMap.get(dayKey)!.blocks.push(block);
  }

  const weeks: BuilderWeeks = {};
  for (const [weekNum, order] of weekDayOrder.entries()) {
    weeks[weekNum] = order.map((k) => weekDayMaps.get(weekNum)!.get(k)!);
  }
  if (Object.keys(weeks).length === 0) weeks[1] = [];

  return { name: template.name, description: template.description ?? '', weeks, fingerprint: fingerprintOf(rows) };
}

/** Thrown when the program changed since the editor loaded it. */
export class StaleProgramError extends Error {
  constructor() {
    super(
      'This program changed after you opened it (the athlete, the AI Coach or another admin edited it). Nothing was saved. Reload to see the latest version, or save anyway to replace it with yours.',
    );
    this.name = 'StaleProgramError';
  }
}

export interface SaveResult {
  templateId: string;
  undeletableCount: number;
}

export async function saveTemplateWeeks(params: {
  templateId: string | null;
  name: string;
  description: string;
  weeks: BuilderWeeks;
  /** From loadTemplateWeeks; omit for a new template or "Save anyway". */
  expectedFingerprint?: string;
}): Promise<SaveResult> {
  const name = params.name.trim();
  if (!name) throw new Error('Program template name is required.');

  // Drop untouched placeholder days (synthesized empty grid columns, or a
  // day whose only block is still the untouched "Workout Routine" default
  // with no exercises added) before validating — the fixed 7-day grid means
  // most weeks legitimately have unused days, and those shouldn't trip the
  // "day must have at least one block" check below. This must happen only
  // here at save time, not on every live grid edit — filtering eagerly on
  // every onChange would erase a block the instant it's added, before the
  // coach has a chance to fill in its exercises.
  const weeks: BuilderWeeks = {};
  for (const [wNum, days] of Object.entries(params.weeks)) {
    weeks[Number(wNum)] = days.filter(
      (d) =>
        d.blocks.some((b) => b.exercises.length > 0 || b.name.trim() !== 'Workout Routine') ||
        d.blocks.length > 1,
    );
  }

  const weekNums = Object.keys(weeks)
    .map(Number)
    .filter((w) => (weeks[w] ?? []).reduce((sum, d) => sum + d.blocks.length, 0) > 0);

  if (weekNums.length === 0) {
    throw new Error('At least one valid week with workout blocks must be added.');
  }

  for (const w of weekNums) {
    for (const d of weeks[w]) {
      if (d.blocks.length === 0) {
        throw new Error(
          `Week ${w} — day "${d.name.toUpperCase()}" must have at least one workout block. Add a block or delete the day.`,
        );
      }
      for (const block of d.blocks) {
        const emptyIdx = block.exercises.findIndex((ex) => !ex.exercise_id);
        if (emptyIdx !== -1) {
          throw new Error(
            `Week ${w} — "${d.name.toUpperCase()}" → "${block.name.trim() || 'Workout Routine'}", row ${emptyIdx + 1}: no exercise selected. Pick one or remove the row before saving.`,
          );
        }
      }
    }
  }

  const blocksPayload: Array<Record<string, unknown>> = [];
  let blockIdx = 0;
  for (const w of weekNums) {
    for (const d of weeks[w]) {
      for (const block of d.blocks) {
        const combinedName = `${d.name.trim()} | ${block.name.trim() || 'Workout Routine'}`;
        const metadata = { ...block.metadata };
        if (d.focus_tag) metadata.focus_tag = d.focus_tag;
        else delete metadata.focus_tag;
        const serializedNotes = BlockConceptParser.stringify(metadata, block.notes);

        blocksPayload.push({
          db_id: block.db_id,
          name: combinedName,
          notes: serializedNotes,
          order_index: blockIdx,
          week_number: w,
          exercises: block.exercises.map((ex, exIdx) => ({
            exercise_id: ex.exercise_id,
            sets: ex.sets,
            reps: ex.reps,
            rest_seconds: ex.rest_seconds,
            hold_seconds: ex.hold_seconds,
            // Each exercise keeps its own flag (the AI Coach and reviews set
            // it per exercise); the block flag is only the fallback.
            is_weighted: ex.is_weighted ?? !!block.metadata.is_weighted,
            notes: ex.notes.trim(),
            order_index: exIdx,
          })),
        });
        blockIdx++;
      }
    }
  }

  // Checked last, right before writing, to keep the window small.
  if (params.templateId && params.expectedFingerprint !== undefined) {
    if ((await fetchTemplateFingerprint(params.templateId)) !== params.expectedFingerprint) {
      throw new StaleProgramError();
    }
  }

  const { data, error } = await supabase.rpc('save_program_template', {
    p_template_id: params.templateId,
    p_name: name,
    p_description: params.description.trim() || null,
    p_blocks: blocksPayload,
  });
  if (error) throw new Error(error.message);
  const result = data as { success: boolean; template_id?: string; error?: string; undeletable_block_ids?: string[] };
  if (!result?.success) {
    throw new Error(result?.error === 'NOT_FOUND' ? 'Template not found.' : 'Failed to save workout program.');
  }

  return {
    templateId: result.template_id!,
    undeletableCount: result.undeletable_block_ids?.length ?? 0,
  };
}
