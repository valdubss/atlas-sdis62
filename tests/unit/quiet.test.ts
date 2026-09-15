import { describe, expect, it } from "vitest";
import { groupDeferred, isQuiet, localClock, nextQuietEnd, parseClock, zonedToUtc } from "@/lib/notifications/quiet";

describe("plage de silence", () => {
  const start = parseClock("21:00", { h: 21, m: 0 });
  const end = parseClock("07:00", { h: 7, m: 0 });

  it("lit une heure « HH:MM » et retombe sur la valeur par défaut sinon", () => {
    expect(parseClock("22:30", start)).toEqual({ h: 22, m: 30 });
    expect(parseClock("bidon", start)).toEqual(start);
    expect(parseClock("25:00", start)).toEqual(start);
  });

  it("détecte la plage à cheval sur minuit, en heure de Paris (été : UTC+2)", () => {
    expect(isQuiet(new Date("2026-07-10T20:30:00Z"), start, end)).toBe(true); // 22 h 30 à Paris
    expect(isQuiet(new Date("2026-07-10T03:00:00Z"), start, end)).toBe(true); // 5 h
    expect(isQuiet(new Date("2026-07-10T06:00:00Z"), start, end)).toBe(false); // 8 h
    expect(isQuiet(new Date("2026-07-10T18:00:00Z"), start, end)).toBe(false); // 20 h
  });

  it("gère une plage dans la journée et une plage nulle", () => {
    expect(isQuiet(new Date("2026-01-10T12:30:00Z"), { h: 12, m: 0 }, { h: 14, m: 0 })).toBe(true); // 13 h 30 Paris (hiver)
    expect(isQuiet(new Date("2026-01-10T15:00:00Z"), { h: 12, m: 0 }, { h: 14, m: 0 })).toBe(false);
    expect(isQuiet(new Date("2026-01-10T15:00:00Z"), { h: 9, m: 0 }, { h: 9, m: 0 })).toBe(false);
  });

  it("calcule la fin de plage suivante (hiver : UTC+1)", () => {
    const at = new Date("2026-01-10T22:00:00Z"); // 23 h Paris
    const endAt = nextQuietEnd(at, end);
    expect(endAt.toISOString()).toBe("2026-01-11T06:00:00.000Z"); // 7 h Paris
    expect(localClock(endAt)).toMatchObject({ h: 7, m: 0 });
    const early = new Date("2026-01-11T04:00:00Z"); // 5 h Paris, même nuit
    expect(nextQuietEnd(early, end).toISOString()).toBe("2026-01-11T06:00:00.000Z");
  });

  it("convertit une heure locale en UTC pendant l'été", () => {
    expect(zonedToUtc(2026, 7, 1, 7, 0).toISOString()).toBe("2026-07-01T05:00:00.000Z");
  });

  it("regroupe plusieurs pushs différées en une seule", () => {
    expect(groupDeferred([])).toBeNull();
    expect(groupDeferred([{ title: "A", body: "b", url: "/post/a" }])).toEqual({ title: "A", body: "b", url: "/post/a" });
    const g = groupDeferred([
      { title: "A", body: "", url: "/a" },
      { title: "B", body: "", url: "/b" },
      { title: "C", body: "", url: "/c" },
      { title: "D", body: "", url: "/d" },
    ]);
    expect(g).toEqual({ title: "4 nouveautés cette nuit", body: "A · B · C", url: "/notifications" });
  });
});
