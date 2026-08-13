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
 */
import "./render.js";

const MODULE_ID = "ssv-silver-gull-journal";
const OWNER = "Solly240", REPO = "ssv-silver-gull-journal", BRANCH = "main", FILE = "content.json";
const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE}`;
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

const SET_CACHE = "contentCache";   // world  — the live shared content (synced among clients)
const SET_ETAG = "contentEtag";     // world  — raw ETag for conditional pulls
const SET_SHA = "contentSha";       // world  — blob sha for pushes
const SET_TOKEN = "ghToken";        // client — GM's personal GitHub token (never shared)
const SET_SCRATCH = "scratchpad";   // client — per-user private notes
const SET_STATUS = "syncStatus";    // world  — last-sync status string

const SSVJ = () => globalThis.SSVJ;
let CONTENT = null;                  // in-memory live content
let pushTimer = null;

/* -------------------------------------------------------------------------- */
/*  content load / cache                                                      */
/* -------------------------------------------------------------------------- */
function assetUrl(p) { return `modules/${MODULE_ID}/${p}`; }
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

/* -------------------------------------------------------------------------- */
/*  ctx for the renderers                                                     */
/* -------------------------------------------------------------------------- */
function buildCtx() {
  const q = (id) => CONTENT.quests.find((x) => x.id === id);
  return {
    data: CONTENT,
    isGM: game.user.isGM,
    assetUrl,
    users: game.users.map((u) => ({ id: u.id, name: u.name, isGM: u.isGM })),
    myCharId: (CONTENT.playerMap || {})[game.user.id] || null,
    scratchpad: game.settings.get(MODULE_ID, SET_SCRATCH) || "",
    saveScratchpad: async (t) => game.settings.set(MODULE_ID, SET_SCRATCH, String(t || "")),

    adjustInv: async (id, d) => { CONTENT.inventory[id] = Math.max(0, Number(CONTENT.inventory[id] || 0) + Number(d)); await saveContent(); },
    setInv: async (id, v) => { CONTENT.inventory[id] = Math.max(0, Number(v) || 0); await saveContent(); },
    setQuestStatus: async (id, s) => { const x = q(id); if (x) x.status = s; await saveContent(); },
    toggleObjective: async (id, i) => { const o = q(id)?.objectives?.[i]; if (o) o.done = !o.done; await saveContent(); },
    addObjective: async (id, r) => { q(id)?.objectives?.push({ title: r.title, detail: r.detail || "", done: false }); await saveContent(); },
    editObjective: async (id, i, r) => { const o = q(id)?.objectives?.[i]; if (o) { o.title = r.title; o.detail = r.detail; } await saveContent(); },
    removeObjective: async (id, i) => { q(id)?.objectives?.splice(i, 1); await saveContent(); },
    toggleTurretBuilt: async (tid) => { const t = CONTENT.turrets.find((x) => x.id === tid); if (t) t.built = !t.built; await saveContent(); },
    addQuest: async (name) => { CONTENT.quests.push({ id: "q" + Date.now(), ico: "•", name, status: "active", description: "", objectives: [] }); await saveContent(); },
    saveMapping: async (m) => { CONTENT.playerMap = m; await saveContent(); },
    addPartyNote: async (t) => { (CONTENT.partyNotes = CONTENT.partyNotes || []).push(t); await saveContent(); },

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
  const map = { ...(CONTENT.playerMap || {}) };
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
  if (result) { CONTENT.playerMap = result; await saveContent(); }
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
  for (const panel of SSVJ().PANELS) {
    const link = findLink(panel.labels); if (!link) continue;
    used.add(link);
    const tab = link.getAttribute("data-tab");
    const body = root.querySelector(`.tab[data-tab="${tab}"]`);
    if (!body) continue;
    try { panel.render(ctx, body); } catch (e) { console.error(`${MODULE_ID} | render ${panel.key}`, e); }
  }
}
function currentRoot() { const sq = ui.simpleQuest; return sq?.rendered ? rootOf(sq, sq.element) : null; }
function refreshOpen() { const r = currentRoot(); if (r) bindPanels(r); }

function logTabs() {
  const r = currentRoot();
  if (!r) return console.warn(`${MODULE_ID} | open the journal (J) first.`);
  const rows = Array.from(r.querySelectorAll("a.item[data-tab]")).map((l) => ({ label: l.textContent.trim(), dataTab: l.getAttribute("data-tab") }));
  console.table(rows); return rows;
}

/* -------------------------------------------------------------------------- */
/*  ESC-to-close for the journal                                              */
/* -------------------------------------------------------------------------- */
function onEscape(e) {
  if (e.key !== "Escape") return;
  const sq = ui.simpleQuest; if (!sq?.rendered) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
  if (document.querySelector(".dialog, dialog[open]")) return;   // let dialogs handle their own Escape
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
  const mod = game.modules.get(MODULE_ID);
  const api = { pull, push, refresh: refreshOpen, logTabs, openSync: openSyncMenu, get content() { return CONTENT; } };
  if (mod) mod.api = api;
  globalThis.SilverGullJournal = api;
  window.addEventListener("keydown", onEscape, true);
  if (ui.simpleQuest?.rendered) bindPanels(currentRoot());
  // Check GitHub for a newer version (skips if unchanged).
  pull({ manual: false });
});

Hooks.on("renderSimpleQuest", (app, html) => { const r = rootOf(app, html); if (r) bindPanels(r); });
