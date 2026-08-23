/**
 * SSV Silver Gull — Ship's Journal (Foundry wiring + GitHub sync), v2
 *
 * Injects six data-driven panels into the Simple Quest journal (Quests/Lore/Timeline/Map/
 * My Journal/Party Journal); leaves Politics alone. All content is data-driven from a shared
 * content.json that is two-way synced with GitHub:
 *   - PULL (public, no token): conditional GET of the raw content.json (If-None-Match → 304 skip).
 *   - PUSH (GM + token): PUT via the GitHub contents API using a GM-only token.
 * Foundry world-settings mirror the live content so connected clients stay in sync in-session.
 *
 * Built for Foundry v12–v14 (works with the classic-Application Simple Quest).
 *
 * Live code: the bundled render.js (imported below) is the offline fallback, but on every load we
 * fetch the latest render.js from GitHub and run it — so panel/UI updates reach everyone on a normal
 * page reload (no hard refresh, no re-install). Only changes to THIS file need a module update.
 */
import "./render.js";

const MODULE_ID = "ssv-silver-gull-journal";
const OWNER = "Solly240", REPO = "ssv-silver-gull-journal", BRANCH = "main", FILE = "content.json";
const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE}`;
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
const RENDER_API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/scripts/render.js`;

const SET_CACHE = "contentCache";   // world  — the live shared content (synced among clients)
const SET_ETAG = "contentEtag";     // world  — raw ETag for conditional pulls
const SET_SHA = "contentSha";       // world  — blob sha for pushes
const SET_TOKEN = "ghToken";        // client — GM's personal GitHub token (never shared)
const SET_SCRATCH = "scratchpad";   // client — per-user private notes
const SET_STATUS = "syncStatus";    // world  — last-sync status string
const SET_STATE = "worldState";     // world  — LIVE GM state (assignments, inventory, quest progress,
                                    //          turret built, party notes) — NEVER pulled/deployed, so
                                    //          it survives content updates. Overlaid on the content.

const SSVJ = () => globalThis.SSVJ;
let CONTENT = null;                  // in-memory live content
let pushTimer = null;

/* -------------------------------------------------------------------------- */
/*  content load / cache                                                      */
/* -------------------------------------------------------------------------- */
function assetUrl(p) { return p && /^https?:/i.test(p) ? p : `modules/${MODULE_ID}/${p}`; }
const b64 = (str) => btoa(unescape(encodeURIComponent(str)));

async function loadBundled() {
  try { const r = await fetch(assetUrl(FILE), { cache: "no-store" }); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}
function getCache() { const c = game.settings.get(MODULE_ID, SET_CACHE); return c && Object.keys(c).length ? c : null; }

async function saveContent(push = true) {
  if (game.user.isGM) await game.settings.set(MODULE_ID, SET_CACHE, CONTENT);
  refreshOpen();
  if (push && game.user.isGM && getToken()) schedulePush();
}

/* -------------------------------------------------------------------------- */
/*  sync — pull                                                               */
/* -------------------------------------------------------------------------- */
async function pull({ manual = false } = {}) {
  try {
    const etag = game.settings.get(MODULE_ID, SET_ETAG) || "";
    const headers = etag && !manual ? { "If-None-Match": etag } : {};
    const res = await fetch(RAW_URL, { headers, cache: "no-store" });
    if (res.status === 304) { if (manual) note("Already up to date."); return "unchanged"; }
    if (!res.ok) { if (manual) warn(`Pull failed (${res.status}).`); return "error"; }
    const text = await res.text();
    const data = JSON.parse(text);
    CONTENT = data;
    if (game.user.isGM) {
      await game.settings.set(MODULE_ID, SET_CACHE, CONTENT);
      await game.settings.set(MODULE_ID, SET_ETAG, res.headers.get("etag") || "");
      await setStatus(`Pulled from GitHub · ${stamp()}`);
    }
    refreshOpen();
    if (manual) note("Pulled latest content from GitHub.");
    return "updated";
  } catch (e) { console.error(`${MODULE_ID} | pull`, e); if (manual) warn("Pull error — see console."); return "error"; }
}

/* -------------------------------------------------------------------------- */
/*  sync — push (GM + token)                                                  */
/* -------------------------------------------------------------------------- */
function getToken() { return (game.settings.get(MODULE_ID, SET_TOKEN) || "").trim(); }
function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(() => push(), 3000); }

async function getRemoteSha(token) {
  const r = await fetch(`${API_URL}?ref=${BRANCH}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
  if (r.status === 404) return null;          // file may not exist yet
  if (!r.ok) throw new Error(`sha ${r.status}`);
  const j = await r.json(); return j.sha;
}

async function push({ manual = false, retry = true } = {}) {
  if (!game.user.isGM) return warn("Only the GM can push.");
  const token = getToken();
  if (!token) return warn("Set a GitHub token in the Ship's Journal sync settings first.");
  try {
    const sha = await getRemoteSha(token).catch(() => game.settings.get(MODULE_ID, SET_SHA) || undefined);
    const body = {
      message: `Ship's Journal content update (${stamp()})`,
      content: b64(JSON.stringify(CONTENT, null, 2)),
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    const r = await fetch(API_URL, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) {
      if (retry) { await pull({ manual: false }); return warn("Remote changed — pulled latest. Review, then Push again."); }
      return warn("Push conflict — pull first.");
    }
    if (!r.ok) { const t = await r.text().catch(() => ""); console.error(`${MODULE_ID} | push`, r.status, t); return warn(`Push failed (${r.status}). Check the token's permissions.`); }
    const j = await r.json();
    if (j.content?.sha) await game.settings.set(MODULE_ID, SET_SHA, j.content.sha);
    await game.settings.set(MODULE_ID, SET_ETAG, "");   // force next pull to re-fetch
    await setStatus(`Pushed to GitHub · ${stamp()}`);
    note("Pushed content to GitHub.");
  } catch (e) { console.error(`${MODULE_ID} | push`, e); warn("Push error — see console."); }
}

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */
const note = (m) => ui.notifications?.info(`Ship's Journal: ${m}`);
const warn = (m) => ui.notifications?.warn(`Ship's Journal: ${m}`);
const stamp = () => new Date().toLocaleString();
async function setStatus(s) { if (game.user.isGM) await game.settings.set(MODULE_ID, SET_STATUS, s); }

/* Fetch the latest render.js from GitHub and run it (self-contained IIFE that sets globalThis.SSVJ),
   so UI updates land on a normal reload. Falls back silently to the bundled render.js on any failure. */
async function loadLatestRender() {
  try {
    // Bounded: an unreachable or throttled GitHub used to be able to hang here indefinitely.
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 3000);
    let res;
    try {
      res = await fetch(`${RENDER_API}?ref=${BRANCH}&t=${Date.now()}`, { headers: { Accept: "application/vnd.github.raw" }, cache: "no-store", signal: ac.signal });
    } finally { clearTimeout(to); }
    if (!res.ok) return;
    const src = await res.text();
    if (!src || !src.includes("globalThis.SSVJ")) return;
    document.getElementById("ssvj-styles")?.remove();   // let the new render.js re-inject its CSS
    (0, eval)(src);
    globalThis.SSVJ?.ensureStyles?.();
  } catch (e) { console.warn(`${MODULE_ID} | live render fetch failed; using bundled render.js`, e); }
}

/* -------------------------------------------------------------------------- */
/*  Live world state (Foundry-local; survives content updates)                */
/* -------------------------------------------------------------------------- */
function getState() {
  const d = game.settings.get(MODULE_ID, SET_STATE) || {};
  return {
    playerMap: d.playerMap || {}, inventory: d.inventory || {}, questStatus: d.questStatus || {},
    questObjDone: d.questObjDone || {}, questObjs: d.questObjs || {}, addedObjectives: d.addedObjectives || {},
    turretBuilt: d.turretBuilt || {}, partyNotes: d.partyNotes || [], addedQuests: d.addedQuests || [],
    questReveal: d.questReveal || {},   // qid -> true = a hidden quest revealed to players
    removedQuests: d.removedQuests || []  // qids deleted by the GM
  };
}
async function saveState(mut) {
  if (!game.user.isGM) return warn("Only the GM can change that.");
  const s = getState(); mut(s); await game.settings.set(MODULE_ID, SET_STATE, s); refreshOpen();
}
// Effective content = authored CONTENT with the GM's live state overlaid.
/* Quest mutators live at module scope so they can be exported. The Settlements module
 * drives these when a player accepts or completes a job from a quest-giver; buildCtx()
 * hands the same functions to the renderers, so there is only ever one definition.
 * All of them go through saveState(), which is already GM-gated. */
const revealQuest = async (id) => saveState((s) => { s.questReveal[id] = true; });
const hideQuest = async (id) => saveState((s) => { delete s.questReveal[id]; });
const setQuestStatus = async (id, st) => saveState((s) => { s.questStatus[id] = st; });

function mergedContent() {
  const s = getState();
  // Only `quests` (and their objectives) and `turrets` are mutated below; `playerMap`,
  // `inventory` and `partyNotes` are replaced with fresh objects/arrays outright. The
  // remaining branches — partyLog, map, characters, lore, timeline — are read-only for
  // the renderers, so a deepClone of the whole ~140KB content on every ctx build was
  // copying far more than this function ever touches.
  const src = CONTENT || {};
  const c = { ...src };
  c.quests = (src.quests || []).map((q) => ({ ...q, objectives: (q.objectives || []).map((o) => ({ ...o })) }));
  c.turrets = (src.turrets || []).map((t) => ({ ...t }));
  c.playerMap = { ...(src.playerMap || {}), ...s.playerMap };
  c.inventory = { ...(src.inventory || {}), ...s.inventory };
  (c.quests || []).forEach((q) => {
    if (s.questStatus[q.id]) q.status = s.questStatus[q.id];
    let objs = s.questObjs[q.id] ? s.questObjs[q.id].slice() : (q.objectives || []).concat(s.addedObjectives[q.id] || []);
    const done = s.questObjDone[q.id];
    if (done) objs = objs.map((o, i) => (done[i] !== undefined ? { ...o, done: done[i] } : o));
    q.objectives = objs;
    q.hidden = !!(q.hidden && !s.questReveal[q.id]);   // revealed hidden quests become visible
  });
  (c.turrets || []).forEach((t) => { if (s.turretBuilt[t.id] !== undefined) t.built = s.turretBuilt[t.id]; });
  c.partyNotes = (c.partyNotes || []).concat(s.partyNotes || []);
  if (s.addedQuests.length) c.quests = (c.quests || []).concat(s.addedQuests);
  if (s.removedQuests.length) c.quests = (c.quests || []).filter((q) => !s.removedQuests.includes(q.id));
  c.galaxyRevealed = (c.quests || []).some((q) => q.revealsGalaxy && q.status === "complete");
  return c;
}

/* -------------------------------------------------------------------------- */
/*  ctx for the renderers                                                     */
/* -------------------------------------------------------------------------- */
function buildCtx() {
  const data = mergedContent();
  const q = (id) => (data.quests || []).find((x) => x.id === id);
  return {
    data,
    isGM: game.user.isGM,
    assetUrl,
    users: game.users.map((u) => ({ id: u.id, name: u.name, isGM: u.isGM })),
    myCharId: (data.playerMap || {})[game.user.id] || null,
    scratchpad: game.settings.get(MODULE_ID, SET_SCRATCH) || "",
    saveScratchpad: async (t) => game.settings.set(MODULE_ID, SET_SCRATCH, String(t || "")),

    adjustInv: async (id, d) => saveState((s) => { s.inventory[id] = Math.max(0, Number(data.inventory[id] || 0) + Number(d)); }),
    setInv: async (id, v) => saveState((s) => { s.inventory[id] = Math.max(0, Number(v) || 0); }),
    setQuestStatus,
    toggleObjective: async (id, i) => saveState((s) => { const qq = q(id); const arr = s.questObjDone[id] ? s.questObjDone[id].slice() : (qq ? qq.objectives.map((o) => !!o.done) : []); arr[i] = !arr[i]; s.questObjDone[id] = arr; }),
    addObjective: async (id, r) => saveState((s) => { const o = { title: r.title, detail: r.detail || "", done: false }; if (s.questObjs[id]) s.questObjs[id].push(o); else (s.addedObjectives[id] = s.addedObjectives[id] || []).push(o); }),
    editObjective: async (id, i, r) => saveState((s) => { const qq = q(id); if (!s.questObjs[id]) s.questObjs[id] = qq.objectives.map((o) => ({ ...o })); if (s.questObjs[id][i]) { s.questObjs[id][i].title = r.title; s.questObjs[id][i].detail = r.detail; } }),
    removeObjective: async (id, i) => saveState((s) => { const qq = q(id); if (!s.questObjs[id]) s.questObjs[id] = qq.objectives.map((o) => ({ ...o })); s.questObjs[id].splice(i, 1); }),
    toggleTurretBuilt: async (tid) => saveState((s) => { const t = (data.turrets || []).find((x) => x.id === tid); s.turretBuilt[tid] = !(t && t.built); }),
    addQuest: async (name) => saveState((s) => { s.addedQuests.push({ id: "q" + Date.now(), ico: "•", name, status: "active", description: "", objectives: [] }); }),
    saveMapping: async (m) => saveState((s) => { s.playerMap = m; }),
    addPartyNote: async (t) => saveState((s) => { s.partyNotes.push(t); }),
    revealQuest,
    hideQuest,
    deleteQuest: async (id) => saveState((s) => { const i = s.addedQuests.findIndex((q) => q.id === id); if (i >= 0) s.addedQuests.splice(i, 1); else if (!s.removedQuests.includes(id)) s.removedQuests.push(id); }),
    openTab: (labels) => openTabByLabel(labels),
    gotoMap: (nodeId, locId) => {
      const nodes = (CONTENT.map && CONTENT.map.nodes) || {};
      const path = []; let cur = nodeId; let guard = 0;
      while (cur && guard++ < 20) { path.unshift(cur); cur = nodes[cur]?.parent; }
      const S = SSVJ(); if (path.length) S._mapPath = path; S._mapSel = locId || null;
      refreshOpen();
      openTabByLabel(["map", "maps", "star map"]);
    },
    gotoScene: (name) => {
      const sc = game.scenes?.getName?.(name);
      if (!sc) return warn(`Scene "${name}" isn't set up yet — create it in Foundry with that exact name.`);
      if (game.user.isGM) sc.activate?.() ?? sc.view?.(); else sc.view?.();
    },

    openAssign: () => assignDialog(),
    promptNumber: (title, val) => promptValue(title, val, "number"),
    promptText: (title, val) => promptValue(title, val, "text"),
    promptObjective: (title, def) => promptObjective(title, def),
    confirm: (title, msg) => confirmDialog(title, msg)
  };
}

/* -------------------------------------------------------------------------- */
/*  dialogs                                                                   */
/* -------------------------------------------------------------------------- */
const D2 = () => foundry.applications?.api?.DialogV2;
async function confirmDialog(title, content) {
  const d = D2(); if (d) return d.confirm({ window: { title }, content: `<p>${content}</p>` });
  return Dialog.confirm({ title, content: `<p>${content}</p>` });
}
async function promptValue(title, value, type) {
  const content = `<div style="padding:4px 2px;"><input name="v" type="${type}" ${type === "number" ? 'step="1"' : ""} value="${SSVJ().esc(value ?? "")}" style="width:100%"/></div>`;
  const read = (form) => { const raw = form.elements.v.value; return type === "number" ? Number(raw) : raw; };
  const d = D2();
  if (d) return d.prompt({ window: { title }, content, ok: { label: "OK", callback: (e, b) => read(b.form) } }).catch(() => null);
  return new Promise((res) => new Dialog({ title, content, buttons: { ok: { label: "OK", callback: (h) => res(read(h[0].querySelector("form") || h[0])) }, cancel: { label: "Cancel", callback: () => res(null) } }, default: "ok" }).render(true));
}
async function promptObjective(title, def) {
  def = def || {};
  const content = `<div style="display:flex;flex-direction:column;gap:6px;padding:4px 2px;">
    <label>Task<input name="title" type="text" value="${SSVJ().esc(def.title || "")}"/></label>
    <label>Detail<textarea name="detail" rows="3">${SSVJ().esc(def.detail || "")}</textarea></label></div>`;
  const read = (f) => ({ title: f.elements.title.value, detail: f.elements.detail.value });
  const d = D2();
  if (d) return d.prompt({ window: { title }, content, ok: { label: "Save", callback: (e, b) => read(b.form) } }).catch(() => null);
  return new Promise((res) => new Dialog({ title, content, buttons: { ok: { label: "Save", callback: (h) => res(read(h[0].querySelector("form") || h[0])) }, cancel: { label: "Cancel", callback: () => res(null) } }, default: "ok" }).render(true));
}
async function assignDialog() {
  if (!game.user.isGM) return;
  const map = { ...(getState().playerMap || {}) };
  const players = game.users.filter((u) => !u.isGM);
  const chars = CONTENT.characters;
  const opts = (cid) => `<option value="">— unassigned —</option>` + chars.map((c) => `<option value="${c.id}" ${cid === c.id ? "selected" : ""}>${SSVJ().esc(c.name)}</option>`).join("");
  const content = `<div style="display:flex;flex-direction:column;gap:8px;padding:4px 2px;">
    <p style="margin:0 0 4px;">Assign each player to a crew member. Their hidden "My Journal" dossier shows only their character.</p>
    ${players.map((u) => `<label style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><span>${SSVJ().esc(u.name)}</span><select name="u_${u.id}" style="flex:0 0 60%">${opts(map[u.id])}</select></label>`).join("") || "<i>No non-GM players exist yet.</i>"}</div>`;
  const read = (f) => { const m = {}; for (const u of players) { const v = f.elements[`u_${u.id}`]?.value; if (v) m[u.id] = v; } return m; };
  const d = D2(); let result = null;
  if (d) result = await d.prompt({ window: { title: "Assign players → characters" }, content, ok: { label: "Save", callback: (e, b) => read(b.form) } }).catch(() => null);
  else result = await new Promise((res) => new Dialog({ title: "Assign players → characters", content, buttons: { ok: { label: "Save", callback: (h) => res(read(h[0].querySelector("form") || h[0])) }, cancel: { label: "Cancel", callback: () => res(null) } }, default: "ok" }).render(true));
  if (result) await saveState((s) => { s.playerMap = result; });
}

/* -------------------------------------------------------------------------- */
/*  sync settings menu (GM): token + Pull/Push + status                       */
/* -------------------------------------------------------------------------- */
function openSyncMenu() {
  const token = getToken();
  const status = game.settings.get(MODULE_ID, SET_STATUS) || "never";
  const content = `<div style="display:flex;flex-direction:column;gap:10px;">
    <p style="margin:0;">Two-way sync with GitHub (<b>${OWNER}/${REPO}</b>). Pull is public; Push needs your token.</p>
    <label>GitHub token (stored only in this browser)
      <input name="tok" type="password" value="${SSVJ().esc(token)}" placeholder="github_pat_…" style="width:100%"/></label>
    <p style="font-size:.85em;color:#888;margin:0;">Use a fine-grained token with <b>Contents: Read and write</b> on the <b>${REPO}</b> repo only. Never shared with players or committed.</p>
    <div style="font-size:.9em;">Last sync: <b>${SSVJ().esc(status)}</b></div>
  </div>`;
  const d = D2();
  const doSave = (form) => { const v = form.elements.tok.value.trim(); game.settings.set(MODULE_ID, SET_TOKEN, v); };
  if (d) {
    d.wait({
      window: { title: "Ship's Journal — GitHub Sync" }, content,
      buttons: [
        { action: "pull", label: "⟲ Pull now", callback: (e, b) => { doSave(b.form); pull({ manual: true }); return "pull"; } },
        { action: "push", label: "⭱ Push now", callback: (e, b) => { doSave(b.form); push({ manual: true }); return "push"; } },
        { action: "save", label: "Save token", default: true, callback: (e, b) => { doSave(b.form); note("Token saved."); return "save"; } }
      ]
    }).catch(() => {});
  } else {
    new Dialog({
      title: "Ship's Journal — GitHub Sync", content,
      buttons: {
        pull: { label: "Pull now", callback: (h) => { doSave((h[0].querySelector("form") || h[0])); pull({ manual: true }); } },
        push: { label: "Push now", callback: (h) => { doSave((h[0].querySelector("form") || h[0])); push({ manual: true }); } },
        save: { label: "Save token", callback: (h) => { doSave((h[0].querySelector("form") || h[0])); note("Token saved."); } }
      }, default: "save"
    }).render(true);
  }
}
// A tiny FormApplication shell so registerMenu has something to open.
class SyncMenu extends FormApplication {
  render() { openSyncMenu(); return this; }
  async _updateObject() {}
}

/* -------------------------------------------------------------------------- */
/*  tab injection                                                             */
/* -------------------------------------------------------------------------- */
function rootOf(app, html) { return html?.[0] || html || app?.element?.[0] || app?.element || null; }
let _bindRev = 0;   // bumped per bind cycle; marks which panels are up to date
function bindPanels(root) {
  if (!CONTENT) return;
  const links = Array.from(root.querySelectorAll("a.item[data-tab]"));
  if (!links.length) return;
  const norm = (s) => String(s || "").trim().toLowerCase();
  const used = new Set();
  const ctx = buildCtx();
  const findLink = (labels) => {
    for (const l of links) if (!used.has(l) && labels.includes(norm(l.textContent))) return l;
    for (const l of links) if (!used.has(l) && labels.some((lab) => norm(l.textContent).includes(lab))) return l;
    return null;
  };
  // Collect the panel/link/body triples first, then render lazily. Rendering all six
  // eagerly meant every state change (every +/- on a material counter) rebuilt five
  // hidden tabs, including re-decoding the full-size star map nobody was looking at.
  const found = [];
  for (const panel of SSVJ().PANELS) {
    const link = findLink(panel.labels); if (!link) continue;
    used.add(link);
    const tab = link.getAttribute("data-tab");
    const body = root.querySelector(`.tab[data-tab="${tab}"]`);
    if (!body) continue;
    found.push({ panel, link, body });
  }

  _bindRev++;
  const rev = String(_bindRev);
  const drawOne = (panel, body, c) => {
    try { panel.render(c, body); body.dataset.ssvjRev = rev; }
    catch (e) { console.error(`${MODULE_ID} | render ${panel.key}`, e); }
  };
  const isShowing = ({ link, body }) =>
    body.classList.contains("active") || link.classList.contains("active") || body.offsetParent !== null;

  // If we can't tell which tab is showing (unfamiliar markup), fall back to the old
  // eager behaviour rather than leaving tabs blank.
  const anyActive = found.some(isShowing);

  for (const entry of found) {
    const { panel, link, body } = entry;
    if (!anyActive || isShowing(entry)) { drawOne(panel, body, ctx); continue; }

    delete body.dataset.ssvjRev;                       // stale until this tab is opened
    if (link.dataset.ssvjWired !== "1") {
      link.dataset.ssvjWired = "1";
      link.addEventListener("click", () => {
        // Simple Quest flips .active in its own handler, so defer a tick.
        setTimeout(() => {
          if (body.dataset.ssvjRev === String(_bindRev)) return;   // already current
          try { panel.render(buildCtx(), body); body.dataset.ssvjRev = String(_bindRev); }
          catch (e) { console.error(`${MODULE_ID} | render ${panel.key}`, e); }
        }, 0);
      });
    }
  }
}
function currentRoot() { const sq = ui.simpleQuest; return sq?.rendered ? rootOf(sq, sq.element) : null; }
function refreshOpen() { const r = currentRoot(); if (r) bindPanels(r); }
function openTabByLabel(labels) {
  const r = currentRoot(); if (!r) return;
  const norm = (s) => String(s || "").trim().toLowerCase();
  const link = Array.from(r.querySelectorAll("a.item[data-tab]")).find((a) => labels.includes(norm(a.textContent)));
  if (link) link.click();
}

function logTabs() {
  const r = currentRoot();
  if (!r) return console.warn(`${MODULE_ID} | open the journal (J) first.`);
  const rows = Array.from(r.querySelectorAll("a.item[data-tab]")).map((l) => ({ label: l.textContent.trim(), dataTab: l.getAttribute("data-tab") }));
  console.table(rows); return rows;
}

/* -------------------------------------------------------------------------- */
/*  ESC-to-close for the journal                                              */
/* -------------------------------------------------------------------------- */
// Escape or J closes the journal when it's open; we run in the capture phase and stop the event so
// Foundry never sees it (no game menu on Escape, no re-open on J). When the journal is closed we do
// nothing, so Escape/J behave normally (J still opens it via Simple Quest).
function onKey(e) {
  const sq = ui.simpleQuest; if (!sq?.rendered) return;
  const k = e.key;
  const isEsc = k === "Escape", isJ = (k === "j" || k === "J") && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (!isEsc && !isJ) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;  // don't hijack typing
  if (isEsc && document.querySelector(".dialog, dialog[open], .window-app.dialog")) return;          // let dialogs handle Escape
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  try { sq.close(); } catch (err) {}
}

/* -------------------------------------------------------------------------- */
/*  hooks                                                                     */
/* -------------------------------------------------------------------------- */
Hooks.once("init", () => {
  const reg = (key, scope, type, def) => game.settings.register(MODULE_ID, key, { scope, config: false, type, default: def });
  reg(SET_CACHE, "world", Object, {});
  reg(SET_ETAG, "world", String, "");
  reg(SET_SHA, "world", String, "");
  reg(SET_STATUS, "world", String, "never");
  reg(SET_STATE, "world", Object, {});
  reg(SET_TOKEN, "client", String, "");
  reg(SET_SCRATCH, "client", String, "");
  game.settings.registerMenu(MODULE_ID, "syncMenu", {
    name: "GitHub Sync (token · Pull · Push)",
    label: "Open Sync Settings",
    hint: "Set your GitHub token and Pull/Push the shared journal content.",
    icon: "fas fa-cloud", type: SyncMenu, restricted: true
  });
});

Hooks.once("ready", async () => {
  CONTENT = getCache() || (await loadBundled()) || {};
  // Not awaited: the bundled render.js is already imported above, so the UI is usable
  // immediately. This upgrade lands asynchronously and refreshes any open panel then.
  loadLatestRender().then(() => { try { refreshOpen(); } catch (e) {} });
  const mod = game.modules.get(MODULE_ID);
  const api = {
    pull, push, refresh: refreshOpen, logTabs, openSync: openSyncMenu,
    get content() { return CONTENT; },
    // Quest control for sibling modules (Settlements' quest-givers). getQuests returns the
    // merged view — `content` is the raw authored file with no live state overlaid, so it
    // reports revealed quests as still hidden and completed ones as still active.
    getQuests: () => mergedContent().quests || [],
    getQuest: (id) => (mergedContent().quests || []).find((q) => q.id === id) || null,
    revealQuest, hideQuest, setQuestStatus,
  };
  if (mod) mod.api = api;
  globalThis.SilverGullJournal = api;
  window.addEventListener("keydown", onKey, true);
  if (ui.simpleQuest?.rendered) bindPanels(currentRoot());
  // Check GitHub for a newer version (skips if unchanged).
  pull({ manual: false });
});

Hooks.on("renderSimpleQuest", (app, html) => { const r = rootOf(app, html); if (r) bindPanels(r); });
