import { describe, expect, it } from "vitest";
import { addDays, dayKey, groupByDay, moveToDay, startOfWeek, visibleDays, type CalendarItem } from "@/lib/studio/calendar";
import { contrastRatio, relativeLuminance, textZone, whiteTextContrast } from "@/lib/media/contrast";

describe("calendrier éditorial", () => {
  it("commence la semaine le lundi et affiche 7 jours", () => {
    const wed = new Date(2026, 8, 16, 15, 30); // mercredi 16 septembre 2026
    const start = startOfWeek(wed);
    expect(start.getDay()).toBe(1);
    expect(dayKey(start)).toBe("2026-09-14");
    const days = visibleDays("week", wed);
    expect(days).toHaveLength(7);
    expect(dayKey(days[6])).toBe("2026-09-20");
  });

  it("affiche des semaines complètes en vue mois", () => {
    const days = visibleDays("month", new Date(2026, 8, 1));
    expect(days.length % 7).toBe(0);
    expect(days[0].getDay()).toBe(1);
    expect(days.some((d) => dayKey(d) === "2026-09-30")).toBe(true);
  });

  it("regroupe par jour et isole les brouillons sans date", () => {
    const items: CalendarItem[] = [
      { kind: "post", id: "1", title: "A", type: "photo", status: "draft", at: null, href: "" },
      { kind: "post", id: "2", title: "B", type: "photo", status: "scheduled", at: "2026-09-16T10:00:00.000Z", href: "" },
      { kind: "event", id: "3", title: "C", type: "event", status: "published", at: "2026-09-16T08:00:00.000Z", href: "" },
    ];
    const { byDay, undated } = groupByDay(items);
    expect(undated.map((i) => i.id)).toEqual(["1"]);
    const list = byDay.get(dayKey(new Date("2026-09-16T10:00:00.000Z")))!;
    expect(list.map((i) => i.id)).toEqual(["3", "2"]);
  });

  it("déplace en gardant l'heure, 9 h pour un élément sans date", () => {
    const target = new Date(2026, 8, 20);
    const moved = moveToDay("2026-09-16T14:30:00.000Z", target);
    const src = new Date("2026-09-16T14:30:00.000Z");
    expect(moved.getHours()).toBe(src.getHours());
    expect(moved.getMinutes()).toBe(30);
    expect(dayKey(moved)).toBe("2026-09-20");
    expect(moveToDay(null, target).getHours()).toBe(9);
    expect(dayKey(addDays(target, 2))).toBe("2026-09-22");
  });
});

describe("contraste des stories", () => {
  it("calcule le rapport blanc / noir à 21 et blanc / blanc à 1", () => {
    expect(contrastRatio(1, relativeLuminance(0, 0, 0))).toBeCloseTo(21, 0);
    expect(contrastRatio(1, relativeLuminance(255, 255, 255))).toBeCloseTo(1, 5);
  });

  it("mesure la zone du texte seulement", () => {
    const w = 10;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    // Haut clair, bas sombre
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = y < h / 2 ? 240 : 10;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    expect(whiteTextContrast(data, w, h, "top")).toBeLessThan(2);
    expect(whiteTextContrast(data, w, h, "bottom")).toBeGreaterThan(10);
    expect(textZone("middle")).toEqual({ from: 0.4, to: 0.6 });
  });
});
