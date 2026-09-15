import { describe, expect, it } from "vitest";
import { clampRel, inMaskedZone, normalizePollOptions, pollPercentages, relFromPointer, snapToVisible, validatePoll } from "@/lib/stories/overlay";

describe("superpositions de story", () => {
  it("borne les positions relatives entre 0 et 1", () => {
    expect(clampRel(-0.2)).toBe(0);
    expect(clampRel(1.7)).toBe(1);
    expect(clampRel(0.33333)).toBe(0.333);
    expect(clampRel(Number.NaN)).toBe(0);
  });

  it("convertit un pointeur en position relative dans le cadre", () => {
    const rect = { left: 100, top: 50, width: 200, height: 400 };
    expect(relFromPointer(rect, 200, 250)).toEqual({ x: 0.5, y: 0.5 });
    expect(relFromPointer(rect, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(relFromPointer({ ...rect, width: 0 }, 150, 250)).toEqual({ x: 0, y: 0.5 });
  });

  it("repère les zones masquées par l'interface et y ramène", () => {
    expect(inMaskedZone(0.05)).toBe(true);
    expect(inMaskedZone(0.5)).toBe(false);
    expect(inMaskedZone(0.9)).toBe(true);
    expect(snapToVisible(0.02)).toBe(0.14);
    expect(snapToVisible(0.95)).toBe(0.78);
  });

  it("valide un sondage : question, deux réponses distinctes, quatre au plus", () => {
    expect(validatePoll("", ["a", "b"])).toMatch(/question/);
    expect(validatePoll("Q ?", ["Oui", " oui "])).toMatch(/Deux réponses/);
    expect(validatePoll("Q ?", ["Oui", "Non"])).toBeNull();
    expect(normalizePollOptions(["A", "", "B", "C", "D", "E"])).toEqual(["A", "B", "C", "D"]);
    expect(validatePoll("x".repeat(81), ["Oui", "Non"])).toMatch(/80/);
  });

  it("calcule des pourcentages entiers dont la somme fait 100", () => {
    expect(pollPercentages([0, 0])).toEqual([0, 0]);
    expect(pollPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(pollPercentages([3, 1])).toEqual([75, 25]);
  });
});
