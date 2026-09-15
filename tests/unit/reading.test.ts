import { describe, expect, it } from "vitest";
import { extractToc, readingProgress, readingTimeMinutes, slugifyHeading } from "@/lib/feed/reading";

describe("lecture", () => {
  it("estime le temps de lecture à 200 mots par minute, 1 min au moins", () => {
    expect(readingTimeMinutes("court")).toBe(1);
    expect(readingTimeMinutes(Array(450).fill("mot").join(" "))).toBe(2);
    expect(readingTimeMinutes("## Titre\n\n**gras** et [lien](https://x)")).toBe(1);
  });

  it("extrait le sommaire des titres de niveau 2 avec des identifiants stables et uniques", () => {
    const md = "# Titre\n\n## Départ à l'aube\ntexte\n### sous\n## Sur le terrain ##\n## Départ à l'aube\n";
    expect(extractToc(md)).toEqual([
      { id: "depart-a-l-aube", text: "Départ à l'aube" },
      { id: "sur-le-terrain", text: "Sur le terrain" },
      { id: "depart-a-l-aube-2", text: "Départ à l'aube" },
    ]);
    expect(slugifyHeading("Été 2026 : bilan")).toBe("ete-2026-bilan");
  });

  it("calcule la progression de lecture entre 0 et 1", () => {
    expect(readingProgress(1000, 3000, 800, 0)).toBe(0);
    expect(readingProgress(1000, 3000, 800, 2100)).toBeCloseTo(0.5, 5);
    expect(readingProgress(1000, 3000, 800, 9999)).toBe(1);
    expect(readingProgress(1000, 500, 800, 1000)).toBe(1); // plus court que l'écran
  });
});
