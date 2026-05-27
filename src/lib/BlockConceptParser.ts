export interface ConceptMetadata {
  timing_system?: 'amrap' | 'fortime' | 'straight_set' | 'tabata';
  time_cap_min?: string | number;
  structure?: 'single' | 'superset' | 'circuit' | 'ladder';
  rounds?: string | number;
  ladder_start?: string | number;
  ladder_sub?: string | number;
  ladder_direction?: 'down' | 'up';
  tabata_work_seconds?: string | number;
  tabata_rest_seconds?: string | number;
  tabata_rounds?: string | number;
  is_weighted?: boolean;
  rest_after_round?: string | number;
  is_tier_trial?: boolean;
  focus_tag?: 'PULL' | 'PUSH' | 'LEGS' | 'FULL_BODY' | 'CORE' | 'NONE';
  
  // Legacy support for older blocks
  type?: 'single' | 'superset' | 'circuit' | 'amrap' | 'fortime';
  timer_seconds?: string | number;
}

export interface ParsedConcept {
  metadata: ConceptMetadata;
  cleanNotes: string;
}

export class BlockConceptParser {
  static parse(rawString: string | null | undefined): ParsedConcept {
    if (!rawString) return { metadata: {}, cleanNotes: '' };

    const conceptMatch = rawString.match(/^\[CONCEPT:(.*?)\](.*)$/s);
    if (!conceptMatch) {
      return { metadata: {}, cleanNotes: rawString.trim() };
    }

    try {
      const metadata = JSON.parse(conceptMatch[1]);
      return {
        metadata,
        cleanNotes: conceptMatch[2] ? conceptMatch[2].trim() : ''
      };
    } catch (e) {
      console.error('Failed to parse concept metadata', e);
      return { metadata: {}, cleanNotes: rawString.replace(/^\[CONCEPT:.*?\]/, '').trim() };
    }
  }

  static getSubtitle(metadata: ConceptMetadata, exerciseNames: string[]): string {
    const names = exerciseNames.length > 0 ? exerciseNames.join(', ') : 'NO EXERCISES';
    
    // Normalize legacy to new structure
    const timing = metadata.timing_system || (metadata.type === 'amrap' || metadata.type === 'fortime' ? metadata.type : 'straight_set');
    const struct = metadata.structure || (metadata.type && metadata.type !== 'amrap' && metadata.type !== 'fortime' ? metadata.type : 'single');
    const timeCap = metadata.time_cap_min || metadata.timer_seconds;

    let prefix = '';

    if (timing === 'amrap') {
      prefix = `AMRAP (${timeCap || 10} MIN)`;
    } else if (timing === 'fortime') {
      prefix = `FOR TIME (${timeCap ? timeCap + ' MIN CAP' : 'NO CAP'})`;
    } else if (timing === 'tabata') {
      const w = metadata.tabata_work_seconds || 20;
      const r = metadata.tabata_rest_seconds || 10;
      const rounds = metadata.tabata_rounds || 8;
      prefix = `TABATA (${rounds}×${w}s WORK / ${r}s REST)`;
    } else {
      // straight_set
      if (struct === 'ladder') {
        prefix = 'LADDER';
      } else {
        if ((struct === 'superset' || struct === 'circuit') && metadata.rounds) {
          prefix = `${metadata.rounds} ROUNDS ${struct.toUpperCase()}`;
        } else {
          prefix = struct.toUpperCase();
        }
      }
    }

    // Add ladder details if applicable
    if (struct === 'ladder' && metadata.rounds && metadata.ladder_start) {
      const r = parseInt(String(metadata.rounds), 10);
      const start = parseInt(String(metadata.ladder_start), 10);
      const sub = parseInt(String(metadata.ladder_sub || 0), 10);
      
      const isUp = metadata.ladder_direction === 'up';
      const sequence = [];
      for (let i = 0; i < r; i++) {
        const val = isUp ? start + (sub * i) : Math.max(0, start - (sub * i));
        sequence.push(val);
      }
      
      prefix += ` • ${r} ROUNDS: ${sequence.join(', ')} REPS`;
    }

    if (metadata.is_weighted) {
      prefix += ` • WEIGHTED`;
    }

    return `${prefix} • ${names}`;
  }

  static getLadderSequence(metadata: ConceptMetadata): string {
    if (metadata.structure !== 'ladder' || !metadata.rounds || !metadata.ladder_start) return '';
    const r = parseInt(String(metadata.rounds), 10);
    const start = parseInt(String(metadata.ladder_start), 10);
    const step = parseInt(String(metadata.ladder_sub || 0), 10);
    const isUp = metadata.ladder_direction === 'up';
    
    const sequence = [];
    for (let i = 0; i < r; i++) {
      const val = isUp
        ? start + (step * i)
        : Math.max(0, start - (step * i));
      sequence.push(val);
    }
    return sequence.join(', ') + ' REPS';
  }

  static stringify(metadata: ConceptMetadata, cleanNotes: string): string {
    return `[CONCEPT:${JSON.stringify(metadata)}] ${cleanNotes}`.trim();
  }
}
