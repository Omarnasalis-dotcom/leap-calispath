import { readFileSync } from "fs";
import { join } from "path";
import { AUTO_OPENER_TEXT, isAutoOpener } from "../chatOpener";

describe("the app's automatic opener", () => {
  const opener = { role: "user", content: AUTO_OPENER_TEXT };

  it("matches what the app really sends", () => {
    const screen = readFileSync(join(__dirname, "../../../../../src/screens/CoachScreen.tsx"), "utf8");
    expect(screen).toContain(`content: '${AUTO_OPENER_TEXT}'`);
  });

  it("is recognised only alone at the start of a chat", () => {
    expect(isAutoOpener([opener])).toBe(true);
    expect(isAutoOpener([{ role: "assistant", content: "Hey." }, opener])).toBe(false);
    expect(isAutoOpener([opener, { role: "assistant", content: "Hey." }, opener])).toBe(false);
    expect(isAutoOpener([])).toBe(false);
  });

  it("can't be matched by a real message", () => {
    expect(isAutoOpener([{ role: "user", content: `${AUTO_OPENER_TEXT} ` }])).toBe(false);
    expect(isAutoOpener([{ role: "user", content: "Build me a program" }])).toBe(false);
    expect(isAutoOpener([{ role: "assistant", content: AUTO_OPENER_TEXT }])).toBe(false);
    expect(isAutoOpener([{ role: "user", content: [{ type: "text", text: AUTO_OPENER_TEXT }] }])).toBe(false);
  });
});
