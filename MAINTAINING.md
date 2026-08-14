# Ship's Journal — Maintainer's Guide

Everything needed to understand, edit, and safely extend the **SSV Silver Gull — Ship's Journal**
Foundry VTT module. If you're a new assistant picking this up: **read this file first**, then skim
`scripts/render.js` and `scripts/journal.js`. Current version: **2.6.0**.

---

## 1. What it is

A homebrew Foundry v12–v14 module that injects six custom panels into TheRipper93's **Simple Quest**
journal (opened with **J**), matched to tabs by their visible label:

**Quests · Lore · Timeline · Map · My Journal · Party Journal** (the **Politics** tab is owned by a
*separate* module, `ssv-silver-gull-politics`, and is left untouched).

- Public GitHub repo: **`Solly240/ssv-silver-gull-journal`** (this folder is a clone; `.git` here).
- Live VTT: `https://vtt.framecore.org/` (world "SSV SILVER GULL"). GM user "GM Banana" has **no
  password**; the setup/admin password is in the repo root `.env` (`VTT_PASSWORD`).
- Politics module lives at `../../politics/`. Don't touch it.

---

## 2. Files

| File | Role |
|---|---|
| `module.json` | Manifest. Bump `version` on every release. Only lists `scripts/journal.js` as the esmodule. |
| `scripts/journal.js` | **Foundry wiring**: settings, hooks, tab injection, the GitHub sync engine, dialogs, the content⇄state merge, the ctx the renderers consume, keyboard (Esc/J). Changing this file needs a module **Update + hard refresh**. |
| `scripts/render.js` | **All UI + all rendering.** Foundry-agnostic IIFE that sets `globalThis.SSVJ`. Pure functions `render*(ctx, body)`. **This is loaded live from GitHub each session** (see §6), so changes here reach players on a *normal reload*. |
| `content.json` | **All authored content** (the single source of truth I deploy). See §4. |
| `assets/` | `shattered-expanse-sector-chart.png`, `current-galaxy-current.png`, `current-galaxy-named.png`, and `turrets/*.png` (6 canon turret images). |
| `lang/en.json` | Minimal strings. |
| `README.md` | User-facing feature/install summary. |
| `MAINTAINING.md` | This file. |
| `../preview.html` | **Standalone browser preview** of all six panels (no VTT). See §7 — this is how you verify changes. |

Galaxy-map source art lives in the KB at `../../../maps/` (`current-galaxy-*.png`,
`current-galaxy-regions.json`, `overlay-*.html`) — see §9.

---

## 3. THE most important rule: content vs. state

There are **two** stores. Keep them separate or you'll wipe the GM's data.

- **Authored content** → `content.json` (on GitHub). I write it; every client pulls it. Deploying a
  new `content.json` **overwrites** it for everyone.
- **Live GM/world state** → a Foundry **world setting `worldState`** (never pulled, never deployed,
  never in `content.json`). It is *overlaid* on the content at render time by `mergedContent()` in
  `journal.js`.

`worldState` holds: `playerMap` (player→character assignments), `inventory` (research materials),
`questStatus`, `questObjDone`, `questObjs` (edited objective lists), `addedObjectives`, `addedQuests`,
`turretBuilt`, `partyNotes`, `questReveal` (revealed hidden quests). Player scratchpads are a separate
per-user **client** setting (`scratchpad`).

> ⚠️ **Never put live/GM-editable state into `content.json`** — the next deploy clobbers it. This was a
> real bug (assignments reset on every update); the fix was moving that state to `worldState`.
> `content.json` still has a leftover top-level `playerMap: {}` — it's an unused default; the real one
> is in `worldState`.

---

## 4. content.json schema

Top-level keys: `version, updated, materials, inventory, turrets, quests, lore, timeline, characters,
partyLog, whoswho, leads, map, playerMap(unused), questCategories`.

**Escaping rule (avoid the `&amp;` bug):** most fields are rendered as **plain text** and HTML-escaped
by `render.js` (`esc()`), so write literal characters — `&`, `'`, `"` — NOT HTML entities. The **only**
raw-HTML fields (rendered via `innerHTML`, so they DO use entities like `&amp;`, `<b>`, `<p>`) are:
- `lore[].body`
- `partyLog[].full`
Everywhere else (all titles, quest text, objectives, timeline, characters, whoswho, leads, party
beats) use plain `&`.

### quests[]
```
{ "id","ico","name",
  "status": "active" | "complete",
  "category": "main" | "exploration" | "repair" | "side"   // must match a questCategories id
  "description": "...",
  "objectives": [ { "title","detail","done": false } ],
  // optional:
  "hidden": true,                 // GM-only until revealed (revealQuest → worldState.questReveal)
  "location": "Vorrn-7 Moon",     // shown as 📍 + in detail
  "handIn": "Halberd's Rest",     // shown in detail ("—" hides it)
  "reward": "...",                // shown as 🎁 + in detail (gold)
  "giver": "Wrenn Sallow",        // shown in detail
  "note": "Hostile faction",      // red warning box in detail
  "revealsGalaxy": true,          // when this quest is complete, the Map swaps to the all-named chart
  "kind": "turrets",              // special: renders per-turret cards + material bars (only the turrets quest)
  "collapsed": true               // turrets quest: start the inline turret group collapsed
}
```
Completed quests keep `objectives[].done: true`. `questCategories` = ordered `[{id,label}]`; sections
render in that order, then an "Other" bucket, then GM-only "Possible Quests", then "Completed".

### materials[] / inventory / turrets[]
`materials`: `[{id,name,req,seed}]` (req = total needed across all 6 turrets; seed = starting on-hand).
`inventory`: `{materialId: number}` defaults (live values live in `worldState.inventory`).
`turrets`: `[{id,name,role,cost:{materialId:qty},built:false,img}]`. The turrets quest's objectives each
carry `"turret": "<turretId>"` to bind an objective to a turret card. `img` uses a raw GitHub URL so it
loads without a reinstall.

### lore[] / timeline[] / characters[] / partyLog[] / whoswho[] / leads[]
- `lore`: `[{id,title,body(HTML)}]` — left-rail sections.
- `timeline`: `[{date,tag,title,body,learned,era?,now?}]` — chronological; `era`/`now` change the dot color.
- `characters`: `[{id,name,role,color,party:[...], secret:{dossier:[],goals:[],abilities:[],hooks:[]}}]`.
  `party` = what everyone sees; `secret.*` = the per-player hidden dossier (My Journal).
- `partyLog`: `[{session,date,title,beats:[...], full(HTML)}]`. `beats` = short summary; `full` = the
  full clickable recap (HTML, built from `../../../campaign/sessions/*.md` via a markdown→HTML pass).
- `whoswho`: `[{name,role,color,text}]`. `leads`: `[string]`.

### map (nested drill tree)
```
"map": {
  "start": "erevos",
  "nodes": {
    "erevos": { "name","kind":"galaxy","image":"assets/current-galaxy-current.png",
                "imageNamed":"assets/current-galaxy-named.png",
                "locations":[ {id,name,x,y,hasData,info?,child?} ] },
    "expanse": { "name","kind":"sector","parent":"erevos",
                 "image":"assets/shattered-expanse-sector-chart.png","locations":[ ...59... ] }
  }
}
```
- `x`,`y` are **normalized 0–1** of the node's image (image is shown at `width:100%`, so % positioning
  aligns). Locations are transparent clickable hotspots overlaid on the image's baked-in dots.
- A location with `child: "<nodeId>"` **drills** into that sub-map (e.g., Shattered Expanse → sector
  chart). `hasData:true` + `info` shows an info popup; `hasData:false` shows the red *"ASTRA has no info
  on this region yet."* popup.
- The Map auto-shows `imageNamed` once any quest with `revealsGalaxy:true` is complete.

---

## 5. render.js (the UI)

Sets `globalThis.SSVJ` with: `esc`, `au(ctx,p)` (asset-URL http passthrough), `ensureStyles()`
(injects one `<style id="ssvj-styles">`), `PANELS` (label→renderer map used by journal.js to bind
tabs), and the renderers: `renderQuests, renderLore, renderTimeline, renderMap, renderMyJournal,
renderParty`. Transient UI state (which quest is open, section collapse, map path, etc.) lives in
`S._*` module vars so it survives re-renders.

**ctx contract** (built by `journal.js buildCtx()`): `{ data (merged content), isGM, assetUrl, users,
myCharId, scratchpad, saveScratchpad, adjustInv, setInv, setQuestStatus, toggleObjective, addObjective,
editObjective, removeObjective, toggleTurretBuilt, addQuest, saveMapping, addPartyNote, revealQuest,
hideQuest, openAssign, promptNumber, promptText, promptObjective, confirm }`. All mutators write to
`worldState` (GM-only) and re-render; they do **not** push to GitHub.

Styling is one injected stylesheet scoped under `.ssvj`. `ensureStyles()` no-ops if the style tag
already exists — so when hot-swapping render.js you must `document.getElementById('ssvj-styles')?.remove()`
first (journal.js does this).

---

## 6. journal.js (wiring + sync) & how updates reach players

- **Tab injection:** `Hooks.on("renderSimpleQuest")` → `bindPanels()` finds each tab by visible label
  (`a.item[data-tab]` text), renders the panel into `.tab[data-tab=…]`. If a tab ever fails to bind,
  run `game.modules.get("ssv-silver-gull-journal").api.logTabs()` and adjust the `labels` in
  `render.js` → `S.PANELS`.
- **Pull (content):** on load + manual, conditional GET of the raw `content.json` (`If-None-Match` →
  304 skip). Caches to a world setting. Players pull too.
- **Push (content):** GM-only, via the GitHub contents API using a **personal token** in a GM-only
  client setting (Game Settings → Ship's Journal → **Open Sync Settings** → paste token, Pull/Push).
  Token = fine-grained PAT, **Contents: Read/Write** on this repo only. Never shared/committed.
- **Live code:** on load, `loadLatestRender()` fetches the newest `render.js` from GitHub and `eval`s
  it (bundled render.js is the offline fallback). **This is why UI/content updates reach everyone on a
  *normal reload* — no hard refresh.** Only changes to **`journal.js`** need a module Update + a
  one-time hard refresh (browsers cache the esmodule).
- **Keyboard:** capture-phase `keydown`; when the journal is open, **Esc** or **J** closes it and the
  event is stopped so Foundry's game menu doesn't open / J doesn't reopen it. When closed, keys behave
  normally (J opens via Simple Quest).

---

## 7. Verifying changes (do this before every deploy)

Use the standalone preview — it loads the exact `render.js` + `content.json`:
```bash
python3 -m http.server 8792 --directory "vtt/journal"
# open http://localhost:8792/preview.html   (file:// won't work — needs a server)
```
Switch **View as** to a player to test hidden per-player My Journal + hidden quests. GM edits in the
preview are in-memory only. Always `python3 -c "import json;json.load(open('content.json'))"` and
`node --check scripts/render.js && node --check scripts/journal.js` first.

---

## 8. Deploying a release

```bash
cd vtt/journal/ssv-silver-gull-journal
# bump version
python3 -c "import json;m=json.load(open('module.json'));m['version']='X.Y.Z';json.dump(m,open('module.json','w'),indent=2)"
# the VTT auto-pushed content.json in old versions → merge keeping OUR content, then push
git fetch -q origin && git merge -q -X ours origin/main -m "sync" || true
git add -A && git commit -m "vX.Y.Z — …"   # end with the Co-Authored-By line
git push origin main
# release (delete+recreate if re-cutting the same tag so it points at the right commit)
rm -f module.zip && zip -qr module.zip module.json content.json scripts lang assets README.md -x '*.git*'
gh release create vX.Y.Z module.json module.zip --title "…" --notes "…"
```
- **Content-only tweak?** You often don't need a release at all — edit `content.json`, push to `main`;
  clients pull it. Or the GM edits in Foundry (writes to worldState). Bump `content.json.version`/`updated`
  if you want.
- **render.js change?** Push to `main`; clients get it on their next normal reload (live code).
- **journal.js or new assets in the zip?** Cut a release; GM does Setup → Add-on Modules → **Update** +
  one hard refresh.
- The manifest install URL is `…/releases/latest/download/module.json`.

---

## 9. Recipes (common edits)

- **Add a quest:** append to `content.json.quests` with a valid `category`; add `hidden:true` for a
  GM-only "possible" quest. For rewards/locations use `location/handIn/reward/giver/note`. To make a
  reward reveal the galaxy map, set `revealsGalaxy:true`.
- **Reveal a hidden quest in play:** GM clicks "reveal to players" on the quest card (writes
  `worldState.questReveal`). No content edit needed.
- **Add a quest category/section:** add `{id,label}` to `content.json.questCategories` (order = render
  order) and set matching `category` on quests.
- **Add a lore section / timeline entry / lead / who's-who:** append to the relevant array (remember
  the escaping rule — plain `&` except `lore[].body`).
- **Add a map hotspot:** add `{id,name,x,y,hasData,info?,child?}` to the right node's `locations`
  (x,y normalized to that node's image). To find coordinates, overlay a pixel grid on the image with
  PIL and read the dot centers (that's how the 59 sector hotspots were aligned).
- **Swap the galaxy chart to the all-named one manually:** it auto-swaps when a `revealsGalaxy` quest
  completes; to force it, you could add a flag — simplest is to complete "The Cartographer's Price".
- **Regenerate galaxy art:** see `../../../maps/` — AI background via OpenAI `gpt-image-1` (key in root
  `.env`; see the `image-generation` memory), labels overlaid by `overlay-*.html` rendered to PNG with
  `Google Chrome --headless --screenshot`. Region names/positions in `current-galaxy-regions.json`.
- **Turret images:** extracted from `../../../source/pdfs/ASTRA_Intel_File.pdf` pages 5–6 with
  `pdftoppm` + PIL crop → `assets/turrets/*.png`, referenced by raw GitHub URL in `content.json.turrets[].img`.

---

## 10. Gotchas (things that have bitten us)

- **`raw.githubusercontent.com` is CDN-cached** (minutes). To fetch the *latest* file immediately (e.g.
  hot-loading render.js onto the live VTT), use the **GitHub API** with `Accept: application/vnd.github.raw`,
  not the raw URL.
- **Hot-loading render.js on the live VTT** (no reinstall): fetch it (API, as above) → `(0,eval)(src)`
  → `document.getElementById('ssvj-styles')?.remove(); SSVJ.ensureStyles()` → `api.refresh()`.
  `journal.js` can't be hot-swapped (imports + registers hooks).
- **VTT auto-push conflicts:** older installed versions auto-pushed `content.json`, diverging `main`.
  Always `git fetch && git merge -X ours origin/main` before pushing. v2.4.0+ no longer auto-pushes.
- **The `&amp;` double-encode bug:** see §4 escaping rule.
- **Escape opening Foundry's game menu / J reopening:** handled by the capture-phase keydown in
  journal.js (§6) — keep the `stopImmediatePropagation`.
- **Foundry image CSP:** external images loaded fine on this host (raw GitHub URLs work). If a stricter
  host blocks them, switch the turret/galaxy `img`/`image` fields back to local `assets/...` paths
  (which require the assets to ship in the installed module).

---

## 11. Version history (short)

- **v1.0.0** injected six panels (content hard-coded in render.js).
- **v2.0.0** data-driven `content.json` + two-way GitHub sync (token) + per-player hidden My Journal + ESC-to-close.
- **v2.1.0** galaxy-view Map (nested nodes; Shattered Expanse drills to the sector chart).
- **v2.2.0** per-turret tasks with own bars + canon turret art; clickable full session recaps; sector hotspots realigned.
- **v2.3.0** live code (fetch latest render.js from GitHub each load).
- **v2.4.0** content⇄state split (`worldState`) — assignments/progress persist across updates.
- **v2.5.0** quest category sections; J closes journal; Escape no longer opens the game menu.
- **v2.6.0** collapsible sections; hidden GM-only "possible" quests + reveal; 12 location/reward side
  quests; galaxy-map reward; `&`-encoding fix; galaxy named ("The Erevos Reach") in lore.
- **v2.7.0** Vorrn-7 arc: map node `vorrn7` (moon image + 3 landing `locations` with `scene` names) that
  the sector's `vorrn-7` location drills into; **two-column map** (map left, detail right); **clickable
  quest `location`** via `mapTarget:{node,loc}` → `ctx.gotoMap` (opens Map tab, highlights); **scene
  buttons** → `ctx.gotoScene(name)` activates a Foundry scene by name; **GM delete quest** →
  `ctx.deleteQuest` + `worldState.removedQuests`; quests reworked Vorrn-7-local + expanded detail.
  Landing-site battlemaps are NOT shipped — owner uses premade maps (Seafoot/Czepeku/etc.) and creates
  Foundry scenes named exactly "Vorrn-7 — Frostwatch Landing" / "… Kettle Hollow" / "… The Long Silence".

Related memory files: `journal-module-deployment`, `politics-module-deployment`, `vtt-access-notes`,
`image-generation` (in the project memory dir).
