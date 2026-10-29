# DevTools RTS-MK1 (`v1.0.0`)

Portail d'outils de développement et **Éditeur de Cartes Tactiques (Map Studio)** pour **RTS-MK1**, déployé sur **`https://devtools-rts-mk1.orbital8.cloud`** et isolé du jeu joueur (`https://rts-mk1.orbital8.cloud`).

## Fonctionnalités Clés (`v1.0.0`)

1. **Configuration de Taille & Redimensionnement à Chaud**
   - Préréglages officiels : `72×72` (*Compacte 1×*), `144×144` (*Escarmouche 4×*), `160×160` (*Tactique ~5× — Défaut*), `192×192` (*Stratégique 7.1×*), `216×216` (*Continentale 9×*).
   - Dimensions personnalisées `Largeur × Hauteur` (`48×48` à `256×256` tuiles) avec conservation centrée ou Nord-Ouest du contenu peint.
2. **Outils de Peinture de Sols & Environnement (`TERRAIN_KIND`)**
   - Peinture des 5 strates géologiques : `Herbe (GRASS)`, `Terre (DIRT)`, `Pierre (STONE)`, `Falaise infranchissable (CLIFF)`, `Dalle de Béton Armé (CONCRETE_SLAB)`.
   - Formes et tailles de pinceau : `1×1` à `13×13`, `Cercle`, `Carré`, `Losange`, `Spray Organique`.
   - Outils géométriques : `Pinceau Continu`, `Ligne Droite (Bresenham)`, `Rectangle Plein`, `Pot de Peinture (Flood Fill)`, `Gomme sélective`, `Pipette d'inspection`.
   - **Peinture Symétrique Temps Réel** : `Aucune`, `Miroir Horizontal (E↔O)`, `Miroir Vertical (N↔S)`, `Rotation Centrale 180° (2J)`, `Quadrants 4 Joueurs (4J)`.
3. **Placement des Ressources & Végétation**
   - **Minerai Classique (`ORE`)** : pinceau avec richesse réglable (`100` à `1500 CR/tuile`) et **Tampon de Gisement Organique Multi-Lobes** (`Petit Filon`, `Filon Naturel`, `Grand Bassin Contesté`).
   - **Minerai d'Argent Rare `2×2` (`SILVER_ORE`)** : pose du rocher métallique `2×2` avec option de tablier rocheux (`STONE`) d'arrimage pour les Robots Constructeurs.
   - **Arbres Destructibles (`TREE_PINE`, `TREE_OAK`, `TREE_PALM`)** : pose unitaire ou en bosquet (`Spray`) avec échelle réglable (`0.75×` à `1.35×`).
4. **Points de Spawn des Factions & Entités Pré-placées**
   - Jusqu'à 4 points de spawn (`Slot 1..4`) configurables par faction (`GDI`, `NOD`, `ORDOS` ou `ANY / Libre au salon`) avec dalle `8×8` en béton, halo rocheux, dotation initiale et crédits de départ.
   - Placement de structures, tourelles de défense, murs et unités pré-déployés sur la carte.
5. **Audit `MAP_GENERATION_RULES`, Règle de Mesure & Sauvegarde SQLite / JSON**
   - Validation en temps réel des distances réglementaires (`>= 96t` entre bases, `20..34t` minerai naturel, `>= 28t` argent/falaises), règle de mesure de distance sur le canvas, historique `Undo / Redo`, sauvegarde serveur SQLite (`/api/maps`) et import/export `.rtsmap.json`.
