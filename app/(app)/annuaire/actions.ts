"use server";

import { fetchDirectoryCenter, fetchDirectoryService, searchDirectory } from "@/lib/centres/directory";
import type { CenterDetails, SearchResult, ServiceDetails } from "@/lib/centres/directory-types";

/** Recherche instantanée (centres, services, agents visibles). */
export async function search(q: string): Promise<SearchResult> {
  const s = (q ?? "").toString().trim().slice(0, 80);
  if (s.length < 2) return { centers: [], services: [], people: [] };
  return searchDirectory(s);
}

export async function getCenterDetails(slug: string): Promise<CenterDetails | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return fetchDirectoryCenter(slug);
}

export async function getServiceDetails(slug: string): Promise<ServiceDetails | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return fetchDirectoryService(slug);
}
