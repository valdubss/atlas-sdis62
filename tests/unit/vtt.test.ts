import { describe, expect, it } from "vitest";
import { cuesFromSegments, formatTime, parseTime, parseVtt, serializeVtt } from "@/lib/video/vtt";

describe("vtt", () => {
  it("lit WebVTT et SRT, ignore les en-têtes et les balises", () => {
    const vtt = "WEBVTT\n\nNOTE test\n\n1\n00:00:01.000 --> 00:00:03.500 align:start\nBonjour <b>à tous</b>\n\n00:00:04,000 --> 00:00:06,000\nDeuxième ligne\nsur deux lignes\n";
    const cues = parseVtt(vtt);
    expect(cues).toEqual([
      { start: 1, end: 3.5, text: "Bonjour à tous" },
      { start: 4, end: 6, text: "Deuxième ligne\nsur deux lignes" },
    ]);
  });

  it("sérialise avec WEBVTT, numéros et temps hh:mm:ss.mmm", () => {
    const out = serializeVtt([{ start: 61.25, end: 63, text: "Manœuvre" }, { start: 0, end: 1, text: "" }]);
    expect(out.startsWith("WEBVTT\n\n")).toBe(true);
    expect(out).toContain("1\n00:01:01.250 --> 00:01:03.000\nManœuvre");
    expect(out).not.toContain("00:00:00.000 --> 00:00:01.000");
    expect(parseVtt(out)).toEqual([{ start: 61.25, end: 63, text: "Manœuvre" }]);
  });

  it("convertit les temps dans les deux sens", () => {
    expect(parseTime("00:01:02.500")).toBe(62.5);
    expect(parseTime("01:02.5")).toBe(62.5);
    expect(parseTime("bidon")).toBeNull();
    expect(formatTime(3725.004)).toBe("01:02:05.004");
  });

  it("découpe une transcription en lignes courtes", () => {
    const long = "mot ".repeat(60).trim();
    const cues = cuesFromSegments([{ start: 0, end: 12, text: long }]);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues.every((c) => c.text.length <= 84)).toBe(true);
    expect(cues[0].start).toBe(0);
    expect(cues[cues.length - 1].end).toBeCloseTo(12, 5);
  });
});
