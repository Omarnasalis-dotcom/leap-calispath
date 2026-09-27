// Code-level backstop for system-prompt.ts §5's safety rules (audit
// 2026-09-25, H5 #4). Those rules — no meal plans or calorie/macro targets,
// no diagnosing, no medication advice — were prompt-only: a model
// regression or a cheaper-model swap could reintroduce them with nothing to
// catch it. Same philosophy as actionClaimGuard.ts, but log-and-flag only:
// a flagged reply is still sent unchanged and saved for human review. Never
// blocks, because a false positive on a sensitive topic (e.g. an honest
// "see a physio") must not change what the athlete sees.
//
// Patterns are deliberately narrow (concrete numbers, named conditions and
// drugs) so general guidance like "eat enough protein across the day" —
// which §5 explicitly allows — doesn't trip them.
export type SafetyFlag = "meal_plan" | "calorie_or_macro_target" | "diagnosis" | "medication";

const PATTERNS: Array<{ flag: SafetyFlag; re: RegExp }> = [
  // Meal plans: an explicit plan, or a per-meal breakdown.
  { flag: "meal_plan", re: /\bmeal\s*(prep\s*)?plan\b/i },
  { flag: "meal_plan", re: /\b(breakfast|lunch|dinner)\s*:\s*\S/i },
  { flag: "meal_plan", re: /(خطة|جدول)\s*(أكل|اكل|وجبات)|نظام\s*غذائي/ },

  // Concrete calorie / macro numbers.
  { flag: "calorie_or_macro_target", re: /\b\d{3,4}\s*(k?cal|calories)\b/i },
  { flag: "calorie_or_macro_target", re: /\b\d{2,3}\s*(g|grams?)\s+(of\s+)?(protein|carbs?|carbohydrates?|fats?)\b/i },
  { flag: "calorie_or_macro_target", re: /\bcalori(c|e)\s+(deficit|surplus)\s+of\s+\d/i },
  { flag: "calorie_or_macro_target", re: /\d{3,4}\s*سعر/ },
  { flag: "calorie_or_macro_target", re: /\d{2,3}\s*(جرام|جم)\s*(بروتين|كارب|كربوهيدرات|دهون)/ },

  // Naming a condition as the athlete's diagnosis.
  {
    flag: "diagnosis",
    re: /\b(you\s+(probably|likely|might|may)?\s*have|sounds\s+like(\s+you\s+have)?|that'?s\s+(probably|likely)|it'?s\s+(probably|likely))\s+(an?\s+)?(tendinitis|tendonitis|tendinopathy|(torn|partial)\s+\w+|tear|sprain|strain|impingement|fracture|hernia|bursitis|dislocation|labral)\b/i,
  },
  { flag: "diagnosis", re: /(عندك|غالبا\s*عندك)\s*(التهاب\s*أوتار|تمزق|كسر|انزلاق|فتق)/ },

  // Medication and dosages.
  { flag: "medication", re: /\b(ibuprofen|naproxen|diclofenac|paracetamol|acetaminophen|aspirin|voltaren|advil|panadol)\b/i },
  { flag: "medication", re: /\b\d{2,4}\s*mg\b/i },
  { flag: "medication", re: /(مسكن|بروفين|فولتارين|بنادول|كتافلام)/ },
];

export function detectSafetyFlags(text: string): SafetyFlag[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const flags = new Set<SafetyFlag>();
  for (const { flag, re } of PATTERNS) {
    if (re.test(trimmed)) flags.add(flag);
  }
  return [...flags];
}
