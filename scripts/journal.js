/**
 * SSV Silver Gull — Ship's Journal (Foundry wiring)
 *
 * Injects six custom panels into TheRipper93's Simple Quest journal window:
 *   Quests · Lore · Timeline · Map · My Journal · Party Journal
 * The "Politics" tab (the politics module's renamed "achievements" slot) is left alone.
 *
 * All content + rendering lives in ./render.js (Foundry-agnostic, sets globalThis.SSVJ);
 * this file only wires Foundry state (settings, users, dialogs) into the ctx the
 * renderers expect, and binds each panel to its Simple Quest tab by the tab's visible label.
 *
 * Built for Foundry v14, alongside the classic-Application Simple Quest.
 */
import "./render.js";

const MODULE_ID = "ssv-silver-gull-journal";
const SET_INV = "inventory";      // world  {materialId:number}
const SET_QUEST = "questState";   // world  {status:{}, obj:{}}
const SET_MAP = "playerMap";      // world  {userId:charId}
const SET_LOG = "partyLog";       // world  [string]
const SET_SCRATCH = "scratchpad"; // client string (per user)

const SSVJ = () => globalThis.SSVJ;

/* -------------------------------------------------------------------------- */
/*  State helpers                                                             */
/* -------------------------------------------------------------------------- */
function seedInv() {
  const inv = {};
  for (const m of SSVJ().MATERIALS) inv[m.id] = m.seed || 0;
  return inv;
}
function getInv() {
  const stored = game.settings.get(MODULE_ID, SET_INV) || {};
  const inv = seedInv();
  for (const k of Object.keys(inv)) if (typeof stored[k] === "number") inv[k] = stored[k];
  return inv;
}
function getQuest() {
  const s = game.settings.get(MODULE_ID, SET_QUEST) || {};
  return { status: { ...(s.status || {}) }, obj: { ...(s.obj || {}) } };
}
const getMapping = () => ({ ...(game.settings.get(MODULE_ID, SET_MAP) || {}) });
const getLog = () => (game.settings.get(MODULE_ID, SET_LOG) || []).slice();

async function setWorld(key, val) {
  if (!game.user.isGM) return ui.notifications?.warn("Only the GM can change that.");
  await game.settings.set(MODULE_ID, key, val);
  refreshOpen();
}

/* -------------------------------------------------------------------------- */
/*  ctx passed to the renderers                                              */
/* -------------------------------------------------------------------------- */
function buildCtx() {
  const inv = getInv();
  const quest = getQuest();
  return {
    isGM: game.user.isGM,
    inv, quest,
    mapping: getMapping(),
    users: game.users.map((u) => ({ id: u.id, name: u.name, isGM: u.isGM })),
    myCharId: getMapping()[game.user.id] || null,
    scratchpad: game.settings.get(MODULE_ID, SET_SCRATCH) || "",
    partyLog: getLog(),

    adjustInv: async (id, d) => { const v = { ...getInv() }; v[id] = Math.max(0, Number(v[id] || 0) + Number(d)); await setWorld(SET_INV, v); },
    setInv: async (id, val) => { const v = { ...getInv() }; v[id] = Math.max(0, Number(val) || 0); await setWorld(SET_INV, v); },
    setQuestStatus: async (qid, status) => { const q = getQuest(); q.status[qid] = status; await setWorld(SET_QUEST, q); },
    toggleObjective: async (qid, idx) => {
      const q = getQuest(); const arr = Array.isArray(q.obj[qid]) ? q.obj[qid].slice() : [];
      arr[idx] = !arr[idx]; q.obj[qid] = arr; await setWorld(SET_QUEST, q);
    },
    saveMapping: async (m) => setWorld(SET_MAP, m),
    addPartyLog: async (t) => { const l = getLog(); l.push(t); await setWorld(SET_LOG, l); },
    saveScratchpad: async (t) => { await game.settings.set(MODULE_ID, SET_SCRATCH, String(t || "")); },
    openAssign: () => assignDialog(),
    promptNumber: (title, val) => promptValue(title, val, "number"),
    promptText: (title, val) => promptValue(title, val, "text"),
    notify: (m) => ui.notifications?.info(m)
  };
}

/* -------------------------------------------------------------------------- */
/*  Dialogs (DialogV2 with classic fallback)                                 */
/* -------------------------------------------------------------------------- */
async function promptValue(title, value, type) {
  const content = `<div style="padding:4px 2px;"><input name="v" type="${type}" ${type === "number" ? 'step="1"' : ""} value="${SSVJ().esc(value ?? "")}" style="width:100%"/></div>`;
  const read = (form) => { const raw = form.elements.v.value; return type === "number" ? Number(raw) : raw; };
  const D2 = foundry.applications?.api?.DialogV2;
  if (D2) return D2.prompt({ window: { title }, content, ok: { label: "OK", callback: (e, b) => read(b.form) } }).catch(() => null);
  return new Promise((res) => new Dialog({
    title, content,
    buttons: { ok: { label: "OK", callback: (h) => res(read(h[0].querySelector("form") || h[0])) }, cancel: { label: "Cancel", callback: () => res(null) } },
    default: "ok"
  }).render(true));
}

async function assignDialog() {
  if (!game.user.isGM) return;
  const map = getMapping();
  const players = game.users.filter((u) => !u.isGM);
  const chars = SSVJ().CHARACTERS;
  const opts = (cid) => `<option value="">— unassigned —</option>` +
    chars.map((c) => `<option value="${c.id}" ${cid === c.id ? "selected" : ""}>${SSVJ().esc(c.name)}</option>`).join("");
  const content = `<div style="display:flex;flex-direction:column;gap:8px;padding:4px 2px;">
    <p style="margin:0 0 4px;">Assign each player to a crew member. Each player's hidden "My Journal" dossier shows only their character.</p>
    ${players.map((u) => `<label style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <span>${SSVJ().esc(u.name)}</span>
      <select name="u_${u.id}" style="flex:0 0 60%">${opts(map[u.id])}</select></label>`).join("") || "<i>No non-GM players exist yet.</i>"}
  </div>`;
  const read = (form) => { const m = {}; for (const u of players) { const v = form.elements[`u_${u.id}`]?.value; if (v) m[u.id] = v; } return m; };
  const D2 = foundry.applications?.api?.DialogV2;
  let result = null;
  if (D2) result = await D2.prompt({ window: { title: "Assign players → characters" }, content, ok: { label: "Save", callback: (e, b) => read(b.form) } }).catch(() => null);
  else result = await new Promise((res) => new Dialog({ title: "Assign players → characters", content,
    buttons: { ok: { label: "Save", callback: (h) => res(read(h[0].querySelector("form") || h[0])) }, cancel: { label: "Cancel", callback: () => res(null) } }, default: "ok" }).render(true));
  if (result) await setWorld(SET_MAP, result);
}

/* -------------------------------------------------------------------------- */
/*  Tab injection — bind each panel to its Simple Quest tab by label         */
/* -------------------------------------------------------------------------- */
function rootOf(app, html) {
  return html?.[0] || html || app?.element?.[0] || app?.element || null;
}
function bindPanels(root) {
  const links = Array.from(root.querySelectorAll("a.item[data-tab]"));
  if (!links.length) return;
  const norm = (s) => String(s || "").trim().toLowerCase();
  const used = new Set();
  const ctx = buildCtx();

  const findLink = (labels) => {
    // exact match first
    for (const l of links) if (!used.has(l) && labels.includes(norm(l.textContent))) return l;
    // then contains
    for (const l of links) if (!used.has(l) && labels.some((lab) => norm(l.textContent).includes(lab))) return l;
    return null;
  };

  for (const panel of SSVJ().PANELS) {
    const link = findLink(panel.labels);
    if (!link) continue;
    used.add(link);
    const tab = link.getAttribute("data-tab");
    const bodyEl = root.querySelector(`.tab[data-tab="${tab}"]`);
    if (!bodyEl) continue;
    try { panel.render(ctx, bodyEl); } catch (e) { console.error(`${MODULE_ID} | render failed for ${panel.key}`, e); }
  }
}
function currentRoot() {
  const sq = ui.simpleQuest;
  return sq?.rendered ? rootOf(sq, sq.element) : null;
}
function refreshOpen() {
  const root = currentRoot();
  if (root) bindPanels(root);
}

/* -------------------------------------------------------------------------- */
/*  Debug helper                                                             */
/* -------------------------------------------------------------------------- */
function logTabs() {
  const root = currentRoot();
  if (!root) return console.warn(`${MODULE_ID} | Simple Quest window is not open (press J).`);
  const rows = Array.from(root.querySelectorAll("a.item[data-tab]")).map((l) => ({ label: l.textContent.trim(), dataTab: l.getAttribute("data-tab") }));
  console.table(rows);
  return rows;
}

/* -------------------------------------------------------------------------- */
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SET_INV, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SET_QUEST, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SET_MAP, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SET_LOG, { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(MODULE_ID, SET_SCRATCH, { scope: "client", config: false, type: String, default: "" });
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  const api = { refresh: refreshOpen, logTabs, buildCtx, MODULE_ID };
  if (mod) mod.api = api;
  globalThis.SilverGullJournal = api;
  if (ui.simpleQuest?.rendered) refreshOpen();
});

Hooks.on("renderSimpleQuest", (app, html) => {
  const root = rootOf(app, html);
  if (root) bindPanels(root);
});
