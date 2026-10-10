"use client";

import { createContext, useContext } from "react";

type Role = { canEdit: boolean; isAdmin: boolean; canMessage: boolean; messagesUnread: number };

const RoleContext = createContext<Role>({ canEdit: false, isAdmin: false, canMessage: false, messagesUnread: 0 });

export function RoleProvider({ canEdit, isAdmin = false, canMessage = false, messagesUnread = 0, children }: { canEdit: boolean; isAdmin?: boolean; canMessage?: boolean; messagesUnread?: number; children: React.ReactNode }) {
  return <RoleContext.Provider value={{ canEdit, isAdmin, canMessage, messagesUnread }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
