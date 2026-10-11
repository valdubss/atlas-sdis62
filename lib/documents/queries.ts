import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DocumentItem } from "./types";

const SELECT = "id, title, category, description, kind, file_key, file_name, file_size, sort_order, published, updated_at";

/** Documents visibles par l'agent (publiés ; les éditeurs voient aussi les brouillons), par catégorie puis ordre. */
export async function fetchDocuments(): Promise<DocumentItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select(SELECT).is("deleted_at", null).order("category").order("sort_order").order("title");
  return (data ?? []) as DocumentItem[];
}

export async function fetchDocument(id: string): Promise<DocumentItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select(SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as DocumentItem | null) ?? null;
}
