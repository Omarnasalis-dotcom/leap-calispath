import { athleteNoteFrom } from "../athleteNotes";

describe("athleteNoteFrom", () => {
  it("keeps the athlete's words and drops the app's [LOG] lines", () => {
    expect(athleteNoteFrom("[LOG] Weight Used: 5 KG\nBiceps curl left arm felt discomfort,")).toBe(
      "Biceps curl left arm felt discomfort,"
    );
    expect(athleteNoteFrom("Don't have rings so i did rear delt fly instead\nI hold hollow hold for 30 seconds")).toBe(
      "Don't have rings so i did rear delt fly instead\nI hold hollow hold for 30 seconds"
    );
  });

  it("returns null when only the app wrote anything", () => {
    expect(athleteNoteFrom("[LOG] Weight Used: 70 KG")).toBeNull();
    expect(athleteNoteFrom("[LOG] Completed: 6 + 5 Rounds/Reps\n[LOG] Weight Used: 10 KG")).toBeNull();
    expect(athleteNoteFrom("")).toBeNull();
    expect(athleteNoteFrom(null)).toBeNull();
  });

  it("reads a missed block's note from missed_detail", () => {
    expect(athleteNoteFrom("[STATUS:MISSED]", "معنديش وقت النهارده")).toBe("معنديش وقت النهارده");
    expect(athleteNoteFrom("[STATUS:MISSED]", null)).toBeNull();
  });

  it("caps a very long note", () => {
    const note = athleteNoteFrom("x".repeat(800));
    expect(note!.length).toBe(501);
    expect(note!.endsWith("…")).toBe(true);
  });
});
