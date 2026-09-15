import { describe, expect, it } from "vitest";
import { angstrom, droneVerdict, trend, windCardinal } from "@/lib/carte/drone";

const calm = { wind10: 10, gust10: 18, wind80: 14, wind120: 16, visibility: 20_000, precipitation: 0, cloudCover: 30, isDay: true };

describe("carte : vue télépilote et indices", () => {
  it("donne un vol favorable par temps calme et refuse au vent, à la pluie ou sans visibilité", () => {
    expect(droneVerdict(calm)).toMatchObject({ level: "go", reasons: [] });
    expect(droneVerdict({ ...calm, wind10: 45 }).level).toBe("nogo");
    expect(droneVerdict({ ...calm, wind120: 44 }).level).toBe("nogo");
    expect(droneVerdict({ ...calm, gust10: 40 }).level).toBe("caution");
    expect(droneVerdict({ ...calm, precipitation: 1.2 }).reasons).toContain("pluie");
    expect(droneVerdict({ ...calm, visibility: 800 }).level).toBe("nogo");
    expect(droneVerdict({ ...calm, isDay: false }).level).toBe("caution");
  });

  it("calcule l'indice d'Angström", () => {
    expect(angstrom(30, 20)).toMatchObject({ index: 0.7, level: "très élevé" });
    expect(angstrom(24, 40)).toMatchObject({ level: "élevé" });
    expect(angstrom(15, 80)).toMatchObject({ level: "faible" });
  });

  it("donne la direction du vent et la tendance d'une hauteur d'eau", () => {
    expect(windCardinal(0)).toBe("N");
    expect(windCardinal(225)).toBe("SO");
    expect(windCardinal(359)).toBe("N");
    expect(trend(1.2, 1.0)).toBe("hausse");
    expect(trend(1.0, 1.2)).toBe("baisse");
    expect(trend(1.01, 1.0)).toBe("stable");
    expect(trend(null, 1)).toBe("inconnue");
  });
});

import { tempColor, weatherWord, windArrow } from "@/lib/carte/meteo-layers";

describe("carte : couche météo", () => {
  it("oriente la flèche du vent vers sa destination", () => {
    expect(windArrow(0)).toBe("↓");
    expect(windArrow(270)).toBe("→");
    expect(windArrow(225)).toBe("↗");
  });
  it("nomme les conditions et colore la température", () => {
    expect(weatherWord(0, 0)).toBe("clair");
    expect(weatherWord(3, 0)).toBe("couvert");
    expect(weatherWord(61, 1)).toBe("pluie");
    expect(weatherWord(95, 2)).toBe("orage");
    expect(tempColor(-10)).toBe("#5b7bd6");
    expect(tempColor(40)).toBe("#e4213a");
    expect(tempColor(16)).toMatch(/^rgb\(/);
  });
});
