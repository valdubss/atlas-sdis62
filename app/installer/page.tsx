import type { Metadata } from "next";
import { InstallGuide } from "@/components/pwa/InstallGuide";
import { installQrSvg, installUrl } from "@/lib/pwa/install-url";

export const metadata: Metadata = { title: "Installer" };
export const dynamic = "force-dynamic";

/**
 * Page publique « Installer MySDIS », à diffuser par lien ou QR code. Elle reconnaît le
 * téléphone : Android installe en un toucher (invite Chrome), iPhone affiche les trois gestes
 * de Safari (Apple n'autorise aucun site à s'ajouter seul à l'écran d'accueil), un
 * ordinateur affiche le QR code à scanner et une affiche imprimable.
 */
export default async function InstallerPage() {
  const url = await installUrl();
  const qrSvg = await installQrSvg(url);
  return <InstallGuide url={url} qrSvg={qrSvg} />;
}
