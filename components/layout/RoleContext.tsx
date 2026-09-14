"use client";

import { createContext, useContext } from "react";

const RoleContext = createContext<{ canEdit: boolean }>({ canEdit: false });

export function RoleProvider({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  return <RoleContext.Provider value={{ canEdit }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
