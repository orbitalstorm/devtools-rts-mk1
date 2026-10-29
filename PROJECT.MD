# PROJET : DEVTOOLS-RTS-MK1 — PORTAIL DEVTOOLS & ÉDITEUR DE CARTES TACTIQUES (VERSION v1.0.0)

## 0. PITCH INITIAL & PARAMÈTRES D'AMORÇAGE VALIDÉS

- **Nom du projet (Dépôt GitHub) :** `devtools-rts-mk1` (`https://github.com/orbitalstorm/devtools-rts-mk1`)
- **Nom DNS de production :** `devtools-rts-mk1.orbital8.cloud` (`https://devtools-rts-mk1.orbital8.cloud`)
- **Version initiale :** `v1.0.0`
- **Isolation stricte :** Cet outil de développement est 100 % isolé du jeu joueur (`rts-mk1.orbital8.cloud`) et destiné à accueillir l'Éditeur de Cartes Tactiques (Map Studio) ainsi que les futurs outils de développement de l'écosystème `RTS-MK1`.

---

## 1. RÈGLES D'INGÉNIERIE GLOBALES (NON NÉGOCIABLES)

- **Framework :** Next.js (App Router) avec React 19.
- **Langage :** TypeScript en mode `strict: true` obligatoire (interdiction de `any`, validation systématique par `zod`).
- **Style :** Tailwind CSS uniquement. Interdiction stricte de créer des fichiers `.css` séparés (hors `src/app/globals.css`) et interdiction absolue d'utiliser la propriété `style` inline sur les composants React/DOM.
- **Pipeline Visuel Partagé :** Rendu Canvas 2D haute performance utilisant l'atlas hybride vectoriel/bitmap (`OffscreenCanvas` -> `ImageBitmap`) et le rendu organique multi-couches du moteur `RTS-MK1`.
- **Persistance Partagée :** Stockage SQLite partagé (`/app/data/rts-mk1.sqlite` via le volume Docker `default_rts_mk1_data`) et fichiers `.rtsmap.json` dans `/app/data/custom-maps/`.
