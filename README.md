# SSV Silver Gull — Ship's Journal

A homebrew Foundry VTT module that fills out the campaign's **Simple Quest** journal (press **J**)
with six custom, **data-driven** panels, kept in **two-way sync with GitHub**. Companion to the
[Politics & Standing](../../politics/ssv-silver-gull-politics/) module — it leaves the **Politics**
tab alone.

## The six panels

| Tab | Panel |
|---|---|
| **Quests** | Quest board. The list shows only each quest's **next task**; click a quest for the full **Description + Quest Log & Checklist** (each objective expands its own detail). **Rebuild Turrets** is a collapsible parent with the 4 material bars (fed live from the ship inventory) + 6 turret objectives. Completed quests (Ferrocrystal, Charge ASTRA, Get More Fuel) open full briefings. **Find Captain Talvos** and **Get Home** start with no objectives. |
| **Lore** | 16-section lore compendium with a section rail. |
| **Timeline** | 29 dated entries in chronological order (Standard Year 6874), each tagged with the session the party learned it. |
| **Map** | Opens to the **galaxy chart** ("The Erevos Reach"). All 56 region dots are clickable: **The Shattered Expanse** drills into the sector chart; every other region pops **"ASTRA has no info on this region yet."** Sector locations show their info, with **◀ Back** / breadcrumb to zoom out. Swap the galaxy image to the all-named version later via `map.nodes.erevos.image` in `content.json`. |
| **My Journal** | Each player's **hidden** dossier (secrets, goals, abilities, loose threads) — rendered per-user — plus a writable scratchpad. |
| **Party Journal** | Shared mission log (S1–S4), open leads, and a who's-who of the crew. |

## Data & sync

All content lives in **`content.json`** — the single source of truth. It is synced with GitHub:

- **Pull (automatic, no token):** on load the module conditionally fetches the raw `content.json`
  and **only updates if it changed** (an `If-None-Match`/304 check). Players pull too, read-only.
- **In-session:** GM edits save to a Foundry world setting, so connected clients see them live.
- **Push (GM + token):** the GM's edits are written back to GitHub via the contents API, using a
  **personal token stored only in the GM's browser** (never shared with players, never committed).
  There's a debounced auto-push plus manual **Pull now / Push now** buttons.

### GM one-time setup (token)

1. Create a GitHub **fine-grained personal access token** with **Contents: Read and write** on the
   `ssv-silver-gull-journal` repo only.
2. In Foundry: **Game Settings → Configure Settings → Ship's Journal → Open Sync Settings**, paste
   the token, and **Save token**. Use **Pull now / Push now** there any time.
3. Now: edit in Foundry → it pushes to GitHub; edit `content.json` on GitHub → it pulls into Foundry
   (a few minutes for the CDN, or hit **Pull now**). Last write wins on a simultaneous clash.

The token lives only in your browser (a client-scoped setting) and is never placed in `content.json`,
never pushed, and never sent to players.

## GM controls (only the GM sees these)

- **Quests:** open a quest → add / edit / remove objectives, tick them off, mark complete/active,
  edit ship inventory (`+ / − / set…`), mark turrets built, add a new quest.
- **My Journal:** **Assign players…** maps each Foundry user to a crew member.
- **Party Journal:** **+ note** adds a shared mission-log line.

## Files

- `content.json` — all content (the synced source of truth).
- `scripts/render.js` — the six renderers (Foundry-agnostic; also powers `../preview.html`).
- `scripts/journal.js` — Foundry wiring: sync engine, dialogs, settings menu, ESC-to-close, tab injection.
- `assets/shattered-expanse-sector-chart.png` — the Map background.
- `module.json`, `lang/en.json`.

## Install / update

Foundry v12–14: **Setup → Add-on Modules → Install Module**, paste the manifest:
`https://github.com/Solly240/ssv-silver-gull-journal/releases/latest/download/module.json`,
enable **SSV Silver Gull — Ship's Journal** in the SSV world, press **J**.

To ship a code/content update: edit here, bump `module.json` `version`, `git push`, cut a new
`gh release` (include `module.json` + a rebuilt `module.zip`), then **Update** in Foundry. (Routine
content tweaks don't need a release — just edit `content.json` on GitHub or in Foundry; sync handles it.)

## Troubleshooting

- **A tab doesn't bind** (labels differ): open the journal and run
  `game.modules.get("ssv-silver-gull-journal").api.logTabs()` — it prints each tab's label→`data-tab`;
  adjust the `labels` in `render.js` → `S.PANELS`.
- **Escape doesn't close** the window: the module adds an Escape-to-close handler; if focus is in a
  text field it blurs first.
- Console API: `game.modules.get("ssv-silver-gull-journal").api` → `{ pull, push, openSync, logTabs, refresh, content }`.

## Privacy note

"My Journal" hides each player's dossier from the others in normal play, but the dossier text ships
in the (public) `content.json` — UI-level secrecy, not server-enforced. For a home table that's the
sensible bar.
