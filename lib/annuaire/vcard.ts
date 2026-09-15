/** Fiche de contact au format vCard 3.0 (centre ou service), sans donnée personnelle. */

export type VCardInput = {
  name: string;
  org?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  url?: string | null;
  note?: string | null;
};

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Plie les lignes à 75 octets (RFC 6350), continuation par espace. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let chunk = "";
  for (const ch of line) {
    if (Buffer.byteLength(chunk + ch, "utf8") > (out.length === 0 ? 75 : 74)) {
      out.push(chunk);
      chunk = ch;
    } else chunk += ch;
  }
  out.push(chunk);
  return out.join("\r\n ");
}

export function buildVCard(input: VCardInput): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeText(input.name)}`, `N:${escapeText(input.name)};;;;`];
  if (input.org) lines.push(`ORG:${escapeText(input.org)}`);
  if (input.phone) lines.push(`TEL;TYPE=WORK,VOICE:${input.phone.replace(/[^\d+]/g, "")}`);
  if (input.email) lines.push(`EMAIL;TYPE=WORK:${input.email}`);
  if (input.address || input.city) lines.push(`ADR;TYPE=WORK:;;${escapeText(input.address ?? "")};${escapeText(input.city ?? "")};;${escapeText(input.postal_code ?? "")};France`);
  if (input.url) lines.push(`URL:${input.url}`);
  if (input.note) lines.push(`NOTE:${escapeText(input.note)}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Nom de fichier sûr : « cis-arras.vcf ». */
export function vcardFilename(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "contact"}.vcf`;
}
