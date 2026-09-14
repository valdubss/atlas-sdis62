"use client";

import { useState } from "react";
import { Bookmark, MessageCircle, Share } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { PostSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { ReactionBar } from "@/components/feed/ReactionBar";
import { IconButton } from "@/components/feed/IconButton";
import { StoryRing } from "@/components/feed/StoryRing";
import { PostCard } from "@/components/feed/PostCard";
import { Logo } from "@/components/brand/Logo";
import type { FeedPost } from "@/lib/feed/types";
import type { ReactionKind } from "@/lib/config";

const samplePost: FeedPost = {
  id: "sample",
  type: "text",
  slug: "exemple",
  title: "Exercice feux de forêt à Hesdin",
  excerpt: null,
  body:
    "Trente sapeurs-pompiers des centres d'Hesdin, Montreuil et Berck ont participé ce matin à un exercice grandeur nature de lutte contre les feux de forêt. Objectif : coordonner les moyens terrestres et le drone de reconnaissance sur un secteur boisé difficile d'accès.\n\nBravo à toutes les équipes engagées.",
  tags: [],
  status: "published",
  published_at: new Date(Date.now() - 3600_000 * 2).toISOString(),
  scheduled_at: null,
  pinned_at: null,
  comments_enabled: true,
  author_display: "service_com",
  category: null,
  center: null,
  author: { name: "Service Communication", avatar_key: null },
  cover: null,
  media: [],
  poll: null,
  reaction_counts: { clap: 12, fire: 4, heart: 31, muscle: 2 },
  comment_count: 6,
  my_reaction: "heart",
  is_bookmarked: true,
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function DevUi() {
  const [sheet, setSheet] = useState(false);
  const [mine, setMine] = useState<ReactionKind | null>("heart");
  const toast = useToast();

  return (
    <div className="mx-auto max-w-[960px] space-y-12 pb-24">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Composants</h1>
        <p className="text-[15px] text-text-2">Chaque composant dans ses états, sur le fond de page.</p>
      </div>

      <Block title="Couleurs">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["bg-0", "bg-bg-0 ring-1 ring-glass-edge"],
            ["bg-1", "bg-bg-1"],
            ["bg-2", "bg-bg-2"],
            ["red", "bg-red"],
            ["red-fill", "bg-red-fill"],
            ["red-soft", "bg-red-soft"],
            ["navy", "bg-navy"],
            ["navy-link", "bg-navy-link"],
          ].map(([name, cls]) => (
            <div key={name} className="space-y-1.5">
              <div className={`h-14 rounded-[10px] ${cls}`} />
              <p className="text-[13px] text-text-2">{name}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1 rounded-[16px] bg-bg-1 p-4">
          <p className="text-[15px] text-text-1">text-1 · texte principal</p>
          <p className="text-[15px] text-text-2">text-2 · texte secondaire</p>
          <p className="text-[13px] text-text-3">text-3 · méta-données</p>
          <p className="text-[13px] text-text-4">text-4 · placeholder</p>
          <p className="text-[15px] text-red-text">red-text · compte actif</p>
          <p className="text-[15px] text-navy-link">navy-link · lien secondaire</p>
        </div>
      </Block>

      <Block title="Typographie">
        <div className="space-y-2 rounded-[16px] bg-bg-1 p-4">
          <p className="text-[34px] font-semibold tracking-[-0.02em] leading-[1.15]">Grand titre 34</p>
          <p className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.15]">Titre 28</p>
          <p className="text-[22px] font-semibold tracking-[-0.02em] leading-[1.15]">Titre 22</p>
          <p className="text-[17px] font-semibold tracking-[-0.02em] leading-[1.15]">Titre 17</p>
          <p className="text-[15px]">Corps 15, hauteur de ligne 1,45. Inter avec cv11, ss01, ss03.</p>
          <p className="text-[13px] font-medium text-text-2">Libellé 13 / 500</p>
          <Logo height={28} />
        </div>
      </Block>

      <Block title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Principal</Button>
          <Button loading>Principal</Button>
          <Button disabled>Principal</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="tertiary">Tertiaire</Button>
          <Button variant="danger">Supprimer</Button>
        </div>
      </Block>

      <Block title="Champs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresse e-mail" name="demo-email" placeholder="prenom.nom@sdis62.fr" />
          <Field label="Avec erreur" name="demo-error" defaultValue="valeur" error="Message d'erreur." />
          <Field label="Avec aide" name="demo-hint" hint="Texte d'aide en text-3." />
          <SelectField label="Sélection" name="demo-select">
            <option>Option A</option>
            <option>Option B</option>
          </SelectField>
          <TextareaField label="Zone de texte" name="demo-textarea" rows={3} placeholder="Placeholder" />
          <div className="hairline rounded-[16px] bg-bg-1 [&>*]:px-4">
            <div className="py-1">
              <CheckboxField label="Interrupteur activé" name="demo-on" defaultChecked hint="Avec un texte d'aide" />
            </div>
            <div className="py-1">
              <CheckboxField label="Interrupteur désactivé" name="demo-off" />
            </div>
          </div>
        </div>
      </Block>

      <Block title="Étiquettes, avatars, icônes">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Brouillon</Badge>
          <Badge tone="navy">Programmée</Badge>
          <Badge tone="success">Publiée</Badge>
          <Badge tone="red">Épinglé</Badge>
          <Avatar name="Valentin Dubois" size="sm" />
          <Avatar name="Valentin Dubois" />
          <Avatar name="Service Communication" official size="lg" />
          <IconButton label="Commentaires" icon={MessageCircle} count={6} />
          <IconButton label="Favori" icon={Bookmark} active />
          <IconButton label="Partager" icon={Share} />
        </div>
      </Block>

      <Block title="Réactions">
        <div className="rounded-[16px] bg-bg-1 px-4 py-2">
          <ReactionBar counts={{ clap: 12, fire: 4, heart: 31, muscle: 2 }} mine={mine} onSelect={(k) => setMine((m) => (m === k ? null : k))} />
        </div>
      </Block>

      <Block title="Anneaux de story">
        <div className="flex gap-2">
          <StoryRing label="Feux Arras" seen={false} />
          <StoryRing label="JSP Calais" seen />
          <StoryRing label="Cérémonie" seen={false} />
        </div>
      </Block>

      <Block title="Carte de post">
        <div className="mx-auto max-w-[390px]">
          <PostCard post={samplePost} preview />
        </div>
      </Block>

      <Block title="Sheet et toast">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Ouvrir une sheet
          </Button>
          <Button variant="secondary" onClick={() => toast("Lien copié")}>
            Afficher un toast
          </Button>
        </div>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Commentaires">
          <div className="px-5 pb-8 text-[15px] text-text-2">Contenu de la sheet. Fermeture au swipe, à la touche Échap ou en touchant le voile.</div>
        </Sheet>
      </Block>

      <Block title="Squelettes et état vide">
        <div className="mx-auto max-w-[390px]">
          <PostSkeleton />
        </div>
        <Skeleton className="h-11 w-64" />
        <div className="rounded-[16px] bg-bg-1">
          <EmptyState title="Aucun favori" description="Touchez le marque-page d'une publication pour la retrouver ici." />
        </div>
      </Block>
    </div>
  );
}
