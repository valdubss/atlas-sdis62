import type { Metadata } from "next";
import { DevUi } from "@/components/studio/DevUi";

export const metadata: Metadata = { title: "Composants" };

/** /studio/dev-ui : chaque composant dans tous ses états sur --bg-0 (éditeurs uniquement). */
export default function DevUiPage() {
  return <DevUi />;
}
