// The app's own confirmations ("**PULL DAY** added.") reach the model as
// app notes, never as its own words (2026-11-04, TestFlight: the model
// copied one for Day 2 without building it). Rendered from the real app
// strings so the patterns can't drift from them.
import en from "../../../../../src/i18n/locales/en";
import ar from "../../../../../src/i18n/locales/ar";
import { appNoteFor, neutralizeAppNotes } from "../appNotes";

const render = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k]));

describe("appNoteFor", () => {
  for (const [lang, strings] of [["en", en.coach], ["ar", ar.coach]] as const) {
    it(`recognises every ${lang} app confirmation`, () => {
      const cases: Array<[string, string]> = [
        [render(strings.dayAdded, { name: "PULL DAY" }), '"PULL DAY" was added'],
        [render(strings.dayAdded, { name: render(strings.weekName, { week: 7 }) }), `"${render(strings.weekName, { week: 7 })}" was added`],
        [render(strings.dayUpdated, { name: "PUSH DAY" }), '"PUSH DAY" was replaced'],
        [render(strings.programLive, { name: "Intermediate C" }), '"Intermediate C" is now their active program'],
        [render(strings.weekDeleted, { week: 3 }), "week 3 was deleted"],
        [strings.programEnded, "their program was ended"],
      ];
      for (const [text, fact] of cases) {
        const note = appNoteFor(text);
        expect(note).toContain("[App note, not written by you:");
        expect(note).toContain(fact);
      }
    });
  }

  it("leaves the coach's own words alone", () => {
    expect(appNoteFor("Day 1 is ready: muscle-up work first. Tap to add it.")).toBeNull();
    expect(appNoteFor("**PUSH DAY** added. Last one left, Legs.")).toBeNull();
    expect(appNoteFor("I added a core block to **PULL DAY**.")).toBeNull();
  });
});

describe("neutralizeAppNotes", () => {
  it("rewrites only assistant messages, keeping the turn order", () => {
    const messages = [
      { role: "assistant", content: "Day 1 is ready. Tap to add it." },
      { role: "assistant", content: "**PULL DAY** added." },
      { role: "user", content: "**PULL DAY** added." },
      { role: "user", content: "Day 2 now" },
    ];
    const out = neutralizeAppNotes(messages);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(messages[0]);
    expect(out[1].content).toContain('"PULL DAY" was added');
    expect(out[2]).toBe(messages[2]);
    expect(out[3]).toBe(messages[3]);
  });
});
