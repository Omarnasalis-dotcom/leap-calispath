// English strings. The source of truth for every key: ar.ts must match this
// shape (enforced by its type), so a missing Arabic string is a type error.
const en = {
  common: {
    ok: 'OK',
    cancel: 'Cancel',
    close: 'CLOSE',
  },
  settings: {
    title: 'SETTINGS',
    language: 'Language',
    languageName: 'English',
    chooseLanguage: 'Choose language',
    restartTitle: 'Restart needed',
    restartMessage: 'The app will restart to switch language.',
    restart: 'Restart',
  },
  // Tier names (Helot … Eternity) stay in English in every language; this is
  // the short description shown with them.
  tiers: {
    level0: 'Starter tier',
    level1: 'Tier 1',
    level2: 'Tier 2',
    level3: 'Tier 3',
    level4: 'Tier 4',
    level5: 'Tier 5',
    level6: 'Tier 6',
    level7: 'Tier 7',
    level8: 'Tier 8',
    level9: 'Tier 9',
  },
};

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Translations = Shape<typeof en>;

export default en;
