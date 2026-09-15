import { describe, expect, it } from "vitest";
import { bubblePositions, canDeleteOwn, conversationPreview, groupDirectory, mediaGrid, mentionQuery, mosaicLayout, normalizeWaveform, parseMentions, pushGroupKey, totalUnread } from "@/lib/messages/helpers";

const msg = (id: string, author: string | null, minutes: number, type: "text" | "system" = "text") => ({
  id,
  type,
  author: author ? { id: author, first_name: "A", last_name: "B", avatar_key: null, role: "reader" } : null,
  created_at: new Date(Date.UTC(2026, 8, 15, 10, minutes)).toISOString(),
});

describe("messagerie", () => {
  it("regroupe les bulles consécutives d'un même auteur (moins de 5 min)", () => {
    const pos = bubblePositions([msg("1", "u1", 0), msg("2", "u1", 2), msg("3", "u1", 4), msg("4", "u2", 5), msg("5", "u1", 20), msg("6", null, 21, "system"), msg("7", "u1", 22)]);
    expect(pos).toEqual({ "1": "first", "2": "middle", "3": "last", "4": "single", "5": "single", "6": "single", "7": "single" });
  });

  it("compte les non-lus hors conversations coupées ou archivées", () => {
    const now = Date.now();
    expect(
      totalUnread(
        [
          { unread: 3, muted_until: null, archived_at: null },
          { unread: 2, muted_until: new Date(now + 60_000).toISOString(), archived_at: null },
          { unread: 4, muted_until: new Date(now - 60_000).toISOString(), archived_at: null },
          { unread: 1, muted_until: null, archived_at: "2026-01-01" },
        ],
        now,
      ),
    ).toBe(7);
  });

  it("regroupe les pushs par conversation et tranche de 10 minutes", () => {
    const a = pushGroupKey("c1", new Date("2026-09-15T10:03:00Z"));
    const b = pushGroupKey("c1", new Date("2026-09-15T10:08:00Z"));
    const c = pushGroupKey("c1", new Date("2026-09-15T10:12:00Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("choisit la mosaïque et la grille de médias", () => {
    expect([1, 2, 3, 4, 9].map(mosaicLayout)).toEqual(["one", "two", "three", "four", "four"]);
    const many = Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, kind: "image" as const, mime: "image/jpeg" }));
    expect(mediaGrid(many)).toMatchObject({ extra: 3, cols: 2 });
    expect(mediaGrid(many).shown).toHaveLength(4);
    expect(mediaGrid(many.slice(0, 1))).toMatchObject({ extra: 0, cols: 1 });
  });

  it("reconnaît les mentions @Prénom Nom, @Prénom et @tous", () => {
    const people = [
      { id: "1", first_name: "Léa", last_name: "Martin" },
      { id: "2", first_name: "Léo", last_name: "Durand" },
    ];
    expect(parseMentions("Bonjour @Léa Martin et @Léo, on fait le point", people)).toEqual({ mentions: ["1", "2"], mentionAll: false });
    expect(parseMentions("@tous rendez-vous 9 h", people)).toEqual({ mentions: [], mentionAll: true });
    expect(parseMentions("mail@sdis62.fr", people).mentions).toEqual([]);
    expect(mentionQuery("Salut @Lé", 9)).toBe("Lé");
    expect(mentionQuery("Salut Léa", 9)).toBeNull();
  });

  it("normalise une forme d'onde sur 64 barres", () => {
    const wave = normalizeWaveform(new Float32Array(6400).map((_, i) => Math.sin(i / 10)));
    expect(wave).toHaveLength(64);
    expect(Math.max(...wave)).toBe(1);
    expect(Math.min(...wave)).toBeGreaterThanOrEqual(0.08);
    expect(normalizeWaveform([])).toHaveLength(64);
  });

  it("aperçu de conversation et fenêtre de suppression", () => {
    expect(conversationPreview({ type: "group", last_message: { type: "voice", body: "", author: "Léa Martin", created_at: "" } })).toBe("Léa : 🎤 Message vocal");
    expect(conversationPreview({ type: "group", last_message: null })).toBe("Groupe créé");
    expect(canDeleteOwn(new Date(Date.now() - 5 * 60_000).toISOString())).toBe(true);
    expect(canDeleteOwn(new Date(Date.now() - 20 * 60_000).toISOString())).toBe(false);
  });

  it("classe l'annuaire en service communication, référents par groupement, autres", () => {
    const groups = groupDirectory([
      { id: "1", first_name: "A", last_name: "A", avatar_key: null, role: "editor", center: null, grouping: null, is_referent: false },
      { id: "2", first_name: "B", last_name: "B", avatar_key: null, role: "referent", center: "Calais", grouping: "Littoral", is_referent: true },
      { id: "3", first_name: "C", last_name: "C", avatar_key: null, role: "reader", center: "Arras", grouping: "Artois", is_referent: false },
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Service communication", "Référents · Littoral", "Autres personnels"]);
  });
});
