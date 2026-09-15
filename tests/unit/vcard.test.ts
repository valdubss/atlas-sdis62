import { describe, expect, it } from "vitest";
import { buildVCard, vcardFilename } from "@/lib/annuaire/vcard";

describe("vCard", () => {
  it("produit une carte 3.0 avec téléphone, adresse et organisation", () => {
    const v = buildVCard({ name: "CIS Arras", org: "SDIS 62", phone: "03 21 15 27 18", email: "cis.arras@sdis62.fr", address: "2 rue Victor Leroy", postal_code: "62000", city: "Arras", url: "https://atlas-sdis62.vercel.app/centre/cis-arras" });
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:CIS Arras\r\n")).toBe(true);
    expect(v).toContain("TEL;TYPE=WORK,VOICE:0321152718");
    expect(v).toContain("ADR;TYPE=WORK:;;2 rue Victor Leroy;Arras;;62000;France");
    expect(v).toContain("ORG:SDIS 62");
    expect(v.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("échappe les virgules et points-virgules, plie les longues lignes", () => {
    const v = buildVCard({ name: "Service RH, paie; carrières", note: "x".repeat(200) });
    expect(v).toContain("FN:Service RH\\, paie\\; carrières");
    const noteLines = v.split("\r\n").filter((l) => l.startsWith("NOTE:") || l.startsWith(" "));
    expect(noteLines.length).toBeGreaterThan(1);
    expect(Math.max(...v.split("\r\n").map((l) => Buffer.byteLength(l, "utf8")))).toBeLessThanOrEqual(75);
  });

  it("nomme le fichier d'après le slug", () => {
    expect(vcardFilename("cis-arras")).toBe("cis-arras.vcf");
    expect(vcardFilename("../x y")).toBe("xy.vcf");
  });
});
