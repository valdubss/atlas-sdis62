"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Transition entre les pages de l'application (fil, centre, annuaire, messages, profil) :
 * la nouvelle page apparaît en fondu avec une légère montée, 180 ms ; instantané quand
 * « réduire les animations » est actif. Le gabarit est remonté à chaque navigation.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
