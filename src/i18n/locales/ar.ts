import type { Translations } from './en';

// Modern Standard Arabic. Kept in English on purpose: tier names (Helot …
// Eternity) and training terms such as AMRAP, Tabata and 1RM.
const ar: Translations = {
  common: {
    ok: 'حسنًا',
    cancel: 'إلغاء',
    close: 'إغلاق',
  },
  settings: {
    title: 'الإعدادات',
    language: 'اللغة',
    languageName: 'العربية',
    chooseLanguage: 'اختر اللغة',
    restartTitle: 'يلزم إعادة التشغيل',
    restartMessage: 'سيُعاد تشغيل التطبيق لتغيير اللغة.',
    restart: 'إعادة التشغيل',
  },
  tiers: {
    level0: 'المستوى التمهيدي',
    level1: 'المستوى الأول',
    level2: 'المستوى الثاني',
    level3: 'المستوى الثالث',
    level4: 'المستوى الرابع',
    level5: 'المستوى الخامس',
    level6: 'المستوى السادس',
    level7: 'المستوى السابع',
    level8: 'المستوى الثامن',
    level9: 'المستوى التاسع',
  },
};

export default ar;
