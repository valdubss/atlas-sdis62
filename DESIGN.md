# DESIGN.md — ATLAS · interface premium, verre & sombre

> Remplace la section « Direction artistique » du brief fonctionnel.
> Statut : **proposition à valider avant tout code**. 14/09/2026.
> Logo `logo-sdis62.png` : **toujours absent du projet**. Les couleurs ci-dessous sont
> les cibles du brief ; `scripts/extract-colors.mjs` recalera `--red` et `--navy` dès
> que le fichier sera déposé dans `public/`.

Trois mots : **Sombre. Verre. Silence.** Chaque choix tient en une phrase ; ce qui ne
se justifie pas est retiré.

---

## 1. Tokens

### 1.1 Couleurs

| Token | Valeur | Justification |
|---|---|---|
| `--bg-0` | `#0A0A0C` | fond de page ; noir neutre froid, jamais `#000` hors stories |
| `--bg-1` | `#141417` | surfaces opaques : cartes, champs ; la différence de fond remplace l'ombre |
| `--bg-2` | `#1C1C21` | surfaces surélevées : menus, sheets ouvertes, boutons secondaires |
| `--glass` | `rgba(20,20,24,0.62)` | verre des surfaces qui survolent du contenu |
| `--glass-fallback` | `rgba(20,20,24,0.94)` | sans `backdrop-filter` |
| `--glass-edge` | `rgba(255,255,255,0.08)` | liseré 1 px en haut du verre |
| `--line` | `rgba(255,255,255,0.06)` | séparateurs, en retrait à gauche |
| `--text-1` | `#F5F5F7` | texte principal |
| `--text-2` | `rgba(245,245,247,0.60)` | texte secondaire, icônes au repos |
| `--text-3` | `rgba(245,245,247,0.50)` | **écart** : le brief dit 0.38, qui ne passe pas AA (3.3:1) ; 0.50 = 5.0:1 pour dates et méta lisibles |
| `--text-4` | `rgba(245,245,247,0.38)` | placeholders et états désactivés uniquement (non soumis à AA) |
| `--red` | `#E4213A` | action et attention : icônes, anneau de story, pastille ; un seul élément rouge au repos par écran |
| `--red-fill` | `#D71F36` | **écart** : fond du bouton principal, légèrement assombri pour que le texte blanc 15/600 passe AA (`#E4213A` = 4.2:1) |
| `--red-text` | `#FF3B52` | rouge en texte 13–15 px (compte d'une réaction active) : 5.3:1 sur `--bg-1` |
| `--red-soft` | `rgba(228,33,58,0.14)` | fond des états actifs (puce sélectionnée) |
| `--navy` | `#2E4A8C` | bleu du logo : filigrane « 62 » et éléments décoratifs seulement (2.3:1, illisible en texte) |
| `--navy-link` | `#6B8CD6` | **écart** : liens secondaires, 6.0:1 |
| `--success` | `#5DBE7A` | toasts uniquement |
| `--danger` | `#E4213A` | toasts uniquement (même rouge, jamais un second rouge) |

### 1.2 Matière « verre »

```css
.glass {
  background: var(--glass-fallback);
  border-top: 1px solid var(--glass-edge);
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.4) inset;
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass {
    background: var(--glass);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    backdrop-filter: blur(24px) saturate(160%);
  }
}
/* Verre jamais empilé : quand une sheet est ouverte, <html data-sheet-open> passe les barres en opaque. */
[data-sheet-open] .glass { background: var(--bg-2); backdrop-filter: none; -webkit-backdrop-filter: none; }
```

Règles : verre réservé aux barres, sheets, menus, toasts ; une carte posée sur le fond
est opaque `--bg-1` ; blur ≤ 32 px ; du contenu réel passe toujours derrière.

### 1.3 Typographie

- Une famille : **Inter** (`next/font`, auto-hébergée), `font-feature-settings: "cv11", "ss01", "ss03"`.
- Échelle 34 / 28 / 22 / 17 / 15 / 13 px. Titres 600, ligne 1.15, tracking `-0.02em`. Corps 400, ligne 1.45. Libellés 500.
- Jamais de capitales en libellé, jamais de mot isolé en couleur dans un titre.
- Barlow Condensed est retirée. Le « 62 » est le seul élément display, en `--navy` ou blanc 8 % en filigrane des écrans vides (**à valider**, voir §7).

### 1.4 Géométrie

| Élément | Rayon | Justification |
|---|---|---|
| champs, boutons | 10 px | petits, posés |
| cartes | 16 px | moyens, posés |
| sheets | 22 px | grands, flottants |
| médias plein cadre | 28 px | les plus grands, ce sont eux qui brillent |

Grille 4 px ; marges d'écran 20 px mobile / 32 px desktop ; lecture ≤ 680 px.
Ombres : aucune sur les surfaces opaques ; `0 12px 40px rgba(0,0,0,0.55)` sur les
surfaces flottantes. Séparateurs `--line` 1 px en retrait de 20 px à gauche.

### 1.5 Icônes et motion

- `lucide-react`, trait 1.75 px, 20 px, `--text-2` au repos, `--text-1` actif, jamais de fond.
- Réactions : icônes Lucide `ThumbsUp` (👏), `Flame` (🔥), `Heart` (❤️), `BicepsFlexed` (💪). Active = icône et compte en `--red`/`--red-text`.
- `framer-motion`, ressort `stiffness 380, damping 32`, 180–260 ms. Une seule orchestration : cascade du fil au premier chargement (8 px, 40 ms). Pression = `scale(0.97)` + `opacity 0.85` 120 ms. `prefers-reduced-motion` coupe tout.
- Haptique `navigator.vibrate(8)` sur réaction et vote.

---

## 2. Contrastes AA (calculés)

| Couple | Ratio | AA texte (≥ 4.5) | AA grand / non-texte (≥ 3) |
|---|---|---|---|
| text-1 / bg-0 | 18.2:1 | ✓ | ✓ |
| text-1 / bg-1 | 16.9:1 | ✓ | ✓ |
| text-1 / bg-2 | 15.6:1 | ✓ | ✓ |
| text-1 / verre (~#141418) | 16.9:1 | ✓ | ✓ |
| text-2 (60 %) / bg-0 | 6.8:1 | ✓ | ✓ |
| text-2 (60 %) / bg-1 | 6.6:1 | ✓ | ✓ |
| text-3 à 38 % (brief) / bg-1 | 3.4:1 | ✗ | ✓ |
| **text-3 à 50 % (proposé) / bg-1** | 4.9:1 | ✓ | ✓ |
| blanc / red `#E4213A` (bouton) | 4.2:1 | ✗ (15 px) | ✓ |
| **blanc / red-fill `#D71F36` (proposé)** | 4.7:1 | ✓ | ✓ |
| red `#E4213A` icône / bg-1 | 4.0:1 | — | ✓ |
| red-text `#FF3B52` / bg-1 | 5.3:1 | ✓ | ✓ |
| navy `#2E4A8C` / bg-0 | 2.3:1 | ✗ | ✗ → décoratif seulement |
| navy-link `#6B8CD6` / bg-0 | 6.0:1 | ✓ | ✓ |

---

## 3. Wireframes

### 3.1 Fil mobile (390 × 844)

```
┌──────────────────────────────────────┐
│ ▒▒▒▒▒▒▒▒▒▒▒ verre (au scroll) ▒▒▒▒▒▒ │  barre : titre réduit centré 17/600,
│           Actualités        [⌕]      │  apparaît quand le grand titre sort
├──────────────────────────────────────┤
│                                      │
│  Actualités                    ⌕     │  grand titre 34/600, tracking -0.02em
│                                      │
│  ◯   ◯   ◯   ◯   ◯                   │  anneaux story 64 px, 2 px red si non vue
│  Feux Arras JSP  …                   │  libellé 11/500 text-2
│                                      │
│ ╭──────────────────────────────────╮ │
│ │                                  │ │
│ │          PHOTO 28 px             │ │  object-fit cover, sans liseré
│ │                                  │ │
│ ╰──────────────────────────────────╯ │
│ ╭──────────────────────────────────╮ │
│ │ Service Communication   15/500   │ │  zone opaque --bg-1, rayon 16, sans bord
│ │ il y a 2 h              13 text-3│ │
│ │ Exercice feux de forêt à Hesdin… │ │  15/400, 4 lignes max, « plus » en text-2
│ │ 👍 12  🔥 4  ♥ 31  💪 2   ◌  ⊡  ↗ │ │  icônes Lucide 20 px, actif en red
│ ╰──────────────────────────────────╯ │
│              12 px de vide           │
│ ╭──────────────────────────────────╮ │
│ │ PHOTO / VIDÉO …                  │ │
│                                      │
├──────────────────────────────────────┤
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒ verre ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │  barre basse : 4 entrées, icône + 11 px,
│   ▤        ▦        ⊡        ◯       │  active en text-1 sans fond ni pastille,
│  Fil    Galerie   Favoris  Profil    │  se masque au scroll bas, revient au haut
└──────────────────────────────────────┘
```

Sheet commentaires (ouverte) : voile `rgba(0,0,0,.5)` + blur 4 px, panneau `--bg-2`
rayon 22 px avec poignée, la barre basse passe en opaque ; sur desktop, panneau centré 480 px.

### 3.2 Studio desktop (1440 × 900)

```
┌────────────┬───────────────────────────────────────────────┬──────────────────┐
│ --bg-1     │ --bg-0                                        │ --bg-0           │
│ 280 px     │                                               │                  │
│            │  Nouvelle publication            Brouillon    │  Aperçu agent    │
│ ATLAS      │                                               │  ╭────────────╮  │
│            │  Type    [Photos] [Vidéo] [Annonce] [Article] │  │ ▒ barre ▒  │  │
│ Tableau    │  ─────────────────────────────── --line       │  │            │  │
│ de bord    │  Photos                                       │  │  PHOTO     │  │
│ Publica-   │  ╭──────────────────────────────────────────╮ │  │            │  │
│ tions      │  │  Ajouter des photos                      │ │  │ ╭────────╮ │  │
│ Stories    │  │  Glissez ici · jusqu'à 20                │ │  │ │ texte  │ │  │
│ Modéra-    │  ╰──────────────────────────────────────────╯ │  │ ╰────────╯ │  │
│ tion       │  ┌────┐ ┌────┐ ┌────┐                        │  │ ▒ nav ▒    │  │
│ Paramètres │  │ 1  │ │ 2  │ │ 3  │  vignettes 10 px       │  ╰────────────╯  │
│            │  └────┘ └────┘ └────┘                        │  cadre téléphone │
│            │  ─────────────────────────────── --line       │  390 × 844 réduit│
│            │  Titre        [ champ --bg-1, 44 px, 10 px ]  │                  │
│            │  Légende      [ zone de texte              ]  │                  │
│            │  ─────────────────────────────── --line       │                  │
│ Valentin   │  Épingler ○   Commentaires ●   Programmer ○   │                  │
│ Dubois     │                                               │                  │
│ Admin      │  Enregistrer le brouillon    [ Publier ]      │  ← un seul rouge │
└────────────┴───────────────────────────────────────────────┴──────────────────┘
```

Listes du studio : rangées 52 px, séparateurs `--line` en retrait, pas de zébrage,
pas d'ombre ; densité plus forte que le mobile (13/15 px).

---

## 4. Références Apple

| Écran | Ce que j'emprunte |
|---|---|
| **Photos** | la photo est la seule lumière : coins 28 px, aucun liseré, transition shared-element vers la lightbox et fermeture au swipe vertical avec suivi du doigt |
| **App Store (Aujourd'hui)** | grand titre 34 px qui se réduit dans la barre en verre au scroll ; cartes « photo en haut, zone opaque en bas », 16 px, sans bord ni ombre, 12 px de vide entre elles |
| **Musique** | barres flottantes en verre au-dessus du contenu défilant ; bottom sheet 22 px avec poignée, fermable au swipe et au tap sur le voile ; la barre basse se masque au scroll |
| **Fitness** | fond sombre, une seule couleur d'accent qui signale l'action (l'anneau) : budget d'un rouge par écran, anneau de story 2 px ; compteurs en texte, pas en pastilles colorées |
| **Réglages** | listes groupées `--bg-1` sur `--bg-0`, rangées 44–52 px, séparateurs en retrait, hiérarchie texte-1 / texte-2 / texte-3, boutons tertiaires en texte seul |

---

## 5. Composants et ordre d'implémentation

1. **Tokens + matière** : `app/globals.css` (variables, `.glass`, fallback, règle « pas de verre empilé »), Inter seul, retrait de Barlow, des halos et des ombres colorées.
2. **Navigation** : `TopBar` (grand titre → titre réduit) et `BottomNav` (verre, masquage au scroll) avec `framer-motion`.
3. **Carte de post** : média 28 px puis zone opaque 16 px ; réactions Lucide ; 4 lignes + « plus ».
4. **Anneau de story** (composant prêt pour le lot d).
5. **Sheet** 22 px, voile flou, drag, desktop 480 px ; `data-sheet-open` sur `<html>`.
6. **Bouton** (principal / secondaire / tertiaire) et **Champ** (44 px, liseré en focus seulement).
7. **Toast** en verre, 44 px, 2,5 s, glisse du haut.
8. **Écran de connexion** « affiche » (photo assombrie 55 %, logo blanc, champ + bouton en verre).
9. **Studio** : panneau 280 px `--bg-1`, listes aérées, cadre téléphone.
10. `/dev/ui` : chaque composant dans tous ses états sur `--bg-0` (route réservée aux éditeurs, absente du build de production si `NODE_ENV=production` sans `NEXT_PUBLIC_DEV_UI=1`).
11. Captures Playwright 390×844 et 1440×900 après chaque lot, autocritique avant présentation.

Dépendances ajoutées : `lucide-react`, `framer-motion`, `@playwright/test` (captures).

---

## 6. Ce qui disparaît de l'implémentation actuelle

- Barlow Condensed et toutes les capitales de libellés ; le tracé ECG comme séparateur et loader (remplacé par des squelettes `--bg-1` à balayage lent).
- Les halos radiaux du fond, l'ombre rouge des boutons, les puces blanches pleines, l'anneau rouge derrière l'icône active de la barre basse.
- Les emojis de réactions (→ Lucide), les points médians dans les méta-données, la flèche « → » de « Lire l'article ».
- Le verre sur les cartes de post (→ opaque `--bg-1`).

---

## 7. Points à valider

1. **Nom et logo.** Le brief cite « Flash 62 » et un logo SDIS 62 blanc monochrome ; vous avez choisi ATLAS et retiré le 62. Proposition la plus discrète : mot-symbole **ATLAS** en Inter 600, blanc, sans signature, et **pas de filigrane « 62 »** tant que vous ne le demandez pas. Le logo PNG, s'il arrive, ne servira que sur l'écran de connexion.
2. **`--text-3` à 0.50 au lieu de 0.38** pour que dates et méta restent lisibles (AA). 0.38 reste pour les placeholders.
3. **Bouton principal en `#D71F36`** (rouge à peine assombri) pour que le texte blanc passe AA ; `#E4213A` conservé partout ailleurs.
4. **Liens secondaires en `#6B8CD6`** ; `#2E4A8C` réservé au décoratif.
5. **Écran de connexion** : il faut une photo d'intervention (paysage, ≥ 2000 px, libre de droits internes). En attendant : fond `--bg-0` uni.
6. **Réactions** : icônes Lucide ThumbsUp / Flame / Heart / BicepsFlexed pour 👏 🔥 ❤️ 💪.
