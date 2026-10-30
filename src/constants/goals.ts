import { t } from '../i18n';

// Goal and equipment options the AI Coach setup asks about (CoachSetup).
// Stored on profiles.goals / profiles.available_equipment and read by the
// ai-coach get_user_context tool.
export const GOALS = [
  { id: 'learn_skills', label: t('goals.learn_skills'), icon: 'school-outline' },
  { id: 'master_basics', label: t('goals.master_basics'), icon: 'checkbox-marked-circle-outline' },
  { id: 'weight_loss', label: t('goals.weight_loss'), icon: 'fire' },
  { id: 'strength', label: t('goals.strength'), icon: 'arm-flex-outline' },
  { id: 'strength_trial', label: t('goals.strength_trial'), icon: 'stairs-up' },
  { id: 'compete', label: t('goals.compete'), icon: 'trophy-outline' },
  { id: 'muscle', label: t('goals.muscle'), icon: 'weight-lifter' },
  { id: 'other', label: t('goals.other'), icon: 'dots-horizontal-circle-outline' },
] as const;

export const EQUIPMENT = [
  { id: 'free_weights', label: t('equipment.free_weights') },
  { id: 'weight_belt', label: t('equipment.weight_belt') },
  { id: 'resistance_bands', label: t('equipment.resistance_bands') },
  { id: 'rings', label: t('equipment.rings') },
  { id: 'pull_up_bar', label: t('equipment.pull_up_bar') },
  { id: 'dip_bar', label: t('equipment.dip_bar') },
  { id: 'low_parallettes', label: t('equipment.low_parallettes') },
] as const;
