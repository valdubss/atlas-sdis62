/**
 * Lien d'itinéraire vers l'application de cartes du téléphone : Plans sur
 * iPhone, l'app par défaut sur Android (schéma geo:), OpenStreetMap ailleurs.
 * Aucun service Google.
 */
export function directionsUrl(lat: number, lng: number, label: string, userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  const q = `${lat},${lng}`;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return `https://maps.apple.com/?daddr=${q}&q=${encodeURIComponent(label)}`;
  if (/Android/i.test(userAgent)) return `geo:${q}?q=${q}(${encodeURIComponent(label)})`;
  return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}#map=16/${lat}/${lng}`;
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
