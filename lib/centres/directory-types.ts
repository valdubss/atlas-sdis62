import type { CenterType } from "@/lib/supabase/database.types";

/** Formes partagées client / serveur de l'annuaire (aucune donnée personnelle au-delà de l'opt-in). */
export type DirectoryCenter = {
  id: string;
  slug: string;
  name: string;
  type: CenterType;
  grouping_id: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
};

export type DirectoryService = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  contact_reasons: string[];
  phone: string | null;
  email: string | null;
  address: string | null;
  grouping_id: string | null;
};

export type DirectoryData = {
  generated_at: string;
  groupings: { id: string; name: string; sort_order: number }[];
  centers: DirectoryCenter[];
  services: DirectoryService[];
};

export type DirectoryPerson = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  work_phone: string | null;
  avatar_key: string | null;
  center: { name: string; slug: string } | null;
  service: { name: string; slug: string } | null;
};

export type SearchResult = {
  centers: (Pick<DirectoryCenter, "id" | "slug" | "name" | "type" | "city" | "phone" | "lat" | "lng"> & { grouping: string | null })[];
  services: Pick<DirectoryService, "id" | "slug" | "name" | "short_description" | "phone">[];
  people: DirectoryPerson[];
};

export type PersonCard = { id: string; first_name: string; last_name: string; avatar_key: string | null; job_title: string | null; work_phone?: string | null };

export type CenterDetails = {
  center: DirectoryCenter & { presentation: string | null; displayed_headcount: number | null; grouping: { name: string } | null };
  chief: PersonCard | null;
  referents: PersonCard[];
  people: PersonCard[];
};

export type ServiceDetails = {
  service: DirectoryService & { mission: string | null };
  manager: PersonCard | null;
  people: PersonCard[];
};
