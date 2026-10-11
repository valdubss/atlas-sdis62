"use client";

import { useEffect } from "react";
import { installClientErrorListeners } from "@/lib/client-errors";

/** Monté une fois dans la mise en page racine : remonte les erreurs non rattrapées au journal. */
export function ErrorReporter() {
  useEffect(() => installClientErrorListeners(), []);
  return null;
}
