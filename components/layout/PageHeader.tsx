"use client";

import { TopBar, LargeTitle } from "./TopBar";

/**
 * En-tête d'écran : barre haute en verre (titre réduit au scroll) + grand titre.
 * `right` est rendu à droite du grand titre (ex. loupe).
 */
export function PageHeader({ title, right, barRight }: { title: string; right?: React.ReactNode; barRight?: React.ReactNode }) {
  return (
    <>
      <TopBar title={title} right={barRight} />
      <LargeTitle right={right}>{title}</LargeTitle>
    </>
  );
}
