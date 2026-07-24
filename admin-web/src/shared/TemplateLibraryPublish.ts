// Workout Templates Library — publish validation.
// Verbatim mirror of src/lib/TemplateLibraryPublish.ts — keep in sync
// manually. Runs client-side first for fast inline feedback, then the
// authoritative publish_library_template RPC re-checks the parts that
// matter for data integrity (tier range bounds, goal presence, duplicate
// coverage) before actually flipping status to 'published'.

import { supabase } from '@/lib/supabase';
import { BlockConceptParser } from './BlockConceptParser';
import type { TierRange } from './templateLibrary';

export interface PublishValidationResult {
  valid: boolean;
  error?: string;
}

export async function validateForPublish(templateId: string): Promise<PublishValidationResult> {
  const { data: template, error: templateError } = await supabase
    .from('program_templates')
    .select('id, matching_criteria')
    .eq('id', templateId)
    .single();
  if (templateError || !template) {
    return { valid: false, error: 'Template not found.' };
  }

  const criteria = template.matching_criteria as { goal?: string; tier_range?: TierRange } | null;

  if (!criteria || !criteria.tier_range) {
    return { valid: false, error: 'Set a tier range before publishing' };
  }
  const { min, max } = criteria.tier_range;
  if (min > max) {
    return { valid: false, error: "Tier range minimum can't exceed maximum" };
  }
  if (min < 0 || max > 9) {
    return { valid: false, error: 'Tier range must be within 0–9' };
  }
  if (!criteria.goal) {
    return { valid: false, error: 'Set a goal before publishing' };
  }

  const { data: blocks, error: blocksError } = await supabase
    .from('program_blocks')
    .select('id, notes')
    .eq('template_id', templateId);
  if (blocksError) {
    return { valid: false, error: 'Failed to load blocks for validation.' };
  }
  if (!blocks || blocks.length === 0) {
    return { valid: false, error: 'Template has no blocks' };
  }

  for (const block of blocks) {
    const { metadata } = BlockConceptParser.parse(block.notes);
    if (!metadata.timing_system || !metadata.structure) {
      return { valid: false, error: 'Every block needs a timing system and structure' };
    }
  }

  // block_exercises.exercise_id is a NOT NULL FK in this schema — every row
  // is guaranteed resolved at write time (see buildLibraryTemplateBlocksPayload's
  // filter), so an "unresolved exercise" state described in the spec can't
  // actually occur here and isn't checked.

  const { data: duplicate, error: duplicateError } = await supabase
    .from('program_templates')
    .select('id')
    .eq('is_library_template', true)
    .eq('status', 'published')
    .neq('id', templateId)
    .contains('matching_criteria', { goal: criteria.goal, tier_range: criteria.tier_range })
    .limit(1)
    .maybeSingle();
  if (duplicateError) {
    return { valid: false, error: 'Failed to check for duplicate published templates.' };
  }
  if (duplicate) {
    return { valid: false, error: 'Another published template already covers this exact tier range and goal' };
  }

  return { valid: true };
}

export async function publishLibraryTemplate(templateId: string): Promise<PublishValidationResult> {
  const preCheck = await validateForPublish(templateId);
  if (!preCheck.valid) {
    return preCheck;
  }

  const { data, error } = await supabase.rpc('publish_library_template', { p_template_id: templateId });
  if (error) {
    return { valid: false, error: error.message };
  }
  if (!data?.success) {
    return { valid: false, error: data?.error || 'Failed to publish template.' };
  }
  return { valid: true };
}
