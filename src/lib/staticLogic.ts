export interface StaticMovement {
  id: string;
  name: string;
  multiplier: number;
  level: 1 | 2 | 3;
  category: 'handstand' | 'front_lever' | 'back_lever' | 'planche';
}

export const STATIC_MOVEMENTS: StaticMovement[] = [
  { id: 'wall_handstand', name: 'Wall Handstand', multiplier: 1, level: 1, category: 'handstand' },
  { id: 'tuck_back_lever', name: 'Tuck Back Lever', multiplier: 2, level: 1, category: 'back_lever' },
  { id: 'tuck_front_lever', name: 'Tuck Front Lever', multiplier: 3, level: 1, category: 'front_lever' },
  { id: 'straddle_back_lever', name: 'Straddle Back Lever', multiplier: 5, level: 1, category: 'back_lever' },
  { id: 'tuck_planche', name: 'Tuck Planche', multiplier: 7, level: 2, category: 'planche' },
  { id: 'full_back_lever', name: 'Full Back Lever', multiplier: 10, level: 2, category: 'back_lever' },
  { id: 'freestanding_handstand', name: 'Freestanding Handstand', multiplier: 12, level: 2, category: 'handstand' },
  { id: 'straddle_front_lever', name: 'Straddle Front Lever', multiplier: 15, level: 2, category: 'front_lever' },
  { id: 'full_front_lever', name: 'Full Front Lever', multiplier: 20, level: 3, category: 'front_lever' },
  { id: 'straddle_planche', name: 'Straddle Planche', multiplier: 25, level: 3, category: 'planche' },
  { id: 'one_arm_handstand', name: 'One Arm Handstand', multiplier: 35, level: 3, category: 'handstand' },
  { id: 'full_planche', name: 'Full Planche', multiplier: 50, level: 3, category: 'planche' },
];

export const STATIC_LEVELS = {
  1: { name: 'STONE', subtitle: 'The Foundation' },
  2: { name: 'IRON', subtitle: 'The Control' },
  3: { name: 'TITAN', subtitle: 'The Mastery' },
};

export const STATIC_CATEGORIES = {
  handstand: { name: 'Handstand', emoji: '🤲' },
  front_lever: { name: 'Front Lever', emoji: '📐' },
  back_lever: { name: 'Back Lever', emoji: '🔄' },
  planche: { name: 'Planche', emoji: '💎' },
};

export function calculatePoints(movementId: string, seconds: number): number {
  const movement = STATIC_MOVEMENTS.find(m => m.id === movementId);
  if (!movement) return 0;
  return seconds * movement.multiplier;
}

export function getLevelMovements(level: 1 | 2 | 3): StaticMovement[] {
  return STATIC_MOVEMENTS.filter(m => m.level === level);
}

export function getCategoryMovements(category: string): StaticMovement[] {
  return STATIC_MOVEMENTS.filter(m => m.category === category);
}

export function isStaticWorldUnlocked(strengthTier: number): boolean {
  return strengthTier >= 4;
}
