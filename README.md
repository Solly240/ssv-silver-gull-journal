# SSV Silver Gull — Ship's Journal

A homebrew Foundry VTT module that fills out the campaign's **Simple Quest** journal (press **J**)
with six custom panels. Companion to the [Politics & Standing](../../politics/ssv-silver-gull-politics/)
module — it leaves the **Politics** tab completely alone.

## What it does

Injects a custom panel into each Simple Quest tab, matched by the tab's visible label:

| Tab | Panel |
|---|---|
| **Quests** | Quest board — 2 completed quests + active quests. The **Rebuild Turrets** quest shows one progress bar per research material (Ceruleum Ferrocrystal, Polymorphic Polymer, Quantum Relays, Hyper-Dense Refined Thermite), filled live from the ship inventory, plus a per-turret "ready?" readout. Hull-breach and cloaking quests are objective checklists. |
| **Lore** | Party-known lore compendium (premise, the two galaxies, the UGC, the three powers, Ancients & rifts, terms & materials) with a section rail. |
| **Timeline** | In-fiction chronology, deep past → Session 4 → now. |
| **Map** | Zoomable star map: **galaxy → sector → body**. Click to drill in; unscanned contacts render **"No info on ___ yet" in red**. |
| **My Journal** | Each player's **hidden** character dossier — the secrets only they know — rendered per-user, plus their own writable scratchpad. |
| **Party Journal** | The crew's shared log, open leads, and a party-known who's-who of the crew. |

## GM controls (only the GM sees these)

- **Quests tab:** `+ / − / set…` steppers edit the ship inventory (drives the turret bars everywhere); toggle objectives done; mark quests complete/active.
- **My Journal tab:** **Assign players…** maps each Foundry user to a crew member, so each player's dossier shows only their character. (Use this to pin down which of Justin / Jayden plays Kael vs. Gerthorlemue.)
- **Party Journal tab:** **+ entry** adds a shared log line.

## Files

- `module.json` — manifest.
- `scripts/render.js` — all content + the six renderers (Foundry-agnostic; also powers `../preview.html`).
- `scripts/journal.js` — Foundry wiring: settings, dialogs, and tab injection via the `renderSimpleQuest` hook.
- `lang/en.json` — strings.

## Install / update on the live server

Same flow as the Politics module (Foundry v14):

1. In Foundry **Setup → Add-on Modules → Install Module**, paste the manifest URL:
   `https://github.com/Solly240/ssv-silver-gull-journal/releases/latest/download/module.json`
2. Enable **SSV Silver Gull — Ship's Journal** in the SSV world.
3. Press **J** — the six tabs are now filled. Politics is unchanged.

To ship an update: edit the files here, bump `module.json` `version`, `git push`, cut a new
`gh release`, then use **Update** in Foundry's Add-on Modules.

## If a tab doesn't bind

The module finds each tab by its visible label. If your labels differ, open the journal and run in
the browser console:

```js
game.modules.get("ssv-silver-gull-journal").api.logTabs()
```

That prints every tab's label and `data-tab`. Adjust the `labels` arrays in `render.js` → `S.PANELS`
to match, bump the version, and re-release.

## A note on privacy

"My Journal" renders each player only their own dossier, so in normal play no one sees another
player's secrets. This is **UI-level** hiding: the dossier text ships inside the module file that all
clients download, so a player who digs into the raw module source could read it. For a home table
that's the sensible bar; if you ever want hard, server-enforced secrecy, move the secrets into native
Foundry journal entries with per-player ownership instead.
