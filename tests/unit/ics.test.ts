import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcs, icsFilename } from "@/lib/agenda/ics";

describe("buildIcs", () => {
  const now = new Date("2026-09-15T08:00:00Z");

  it("produit un événement horaire avec fin par défaut à +1 h", () => {
    const ics = buildIcs({ id: "abc", title: "Manœuvre", description: null, location: null, starts_at: "2026-09-20T08:30:00Z", ends_at: null, all_day: false }, "ATLAS", now);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260920T083000Z");
    expect(ics).toContain("DTEND:20260920T093000Z");
    expect(ics).toContain("SUMMARY:Manœuvre");
    expect(ics).toContain("UID:abc@atlas-sdis62");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });

  it("gère une journée entière (DTEND exclusif le lendemain)", () => {
    const ics = buildIcs({ id: "x", title: "Portes ouvertes", description: "Venez nombreux", location: "CIS Arras", starts_at: "2026-10-03T00:00:00Z", ends_at: "2026-10-03T00:00:00Z", all_day: true }, "ATLAS", now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261003");
    expect(ics).toContain("DTEND;VALUE=DATE:20261004");
    expect(ics).toContain("LOCATION:CIS Arras");
    expect(ics).toContain("DESCRIPTION:Venez nombreux");
  });

  it("échappe les caractères réservés et les retours à la ligne", () => {
    expect(escapeIcs("a;b,c\\d\nligne 2")).toBe("a\\;b\\,c\\\\d\\nligne 2");
  });

  it("nomme le fichier sans caractères spéciaux", () => {
    expect(icsFilename("Portes ouvertes : CIS Arras !")).toBe("Portes-ouvertes-CIS-Arras-.ics");
    expect(icsFilename("   ")).toBe("-.ics".replace("-", "") === "" ? "evenement.ics" : icsFilename("   "));
  });
});
