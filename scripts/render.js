/**
 * SSV Silver Gull — Ship's Journal : shared renderers (v2, data-driven)
 *
 * Foundry-agnostic. Assigns `globalThis.SSVJ`. Loaded two ways:
 *   - journal.js (Foundry esmodule) does `import "./render.js"`, then feeds ctx.data
 *     (the fetched content.json) + Foundry state + sync mutators.
 *   - preview.html loads it as a classic <script> and feeds an in-memory ctx.
 *
 * No import/export, no Foundry globals — runs identically in both.
 * Every renderer: render(ctx, body). All CONTENT comes from ctx.data (content.json).
 *
 * ctx contract (host supplies):
 *   data        the content object (quests, lore, timeline, characters, partyLog, whoswho,
 *               leads, map, materials, turrets, inventory, playerMap, partyNotes?)
 *   isGM        boolean
 *   assetUrl(p) resolve an asset path ("assets/x.png") to a loadable URL
 *   users       [{id,name,isGM}]
 *   myCharId    charId | null
 *   scratchpad  string   ;  saveScratchpad(text)
 *   — mutators (change ctx.data + persist + sync + re-render): —
 *   adjustInv(id,d) setInv(id,v)
 *   setQuestStatus(qid,status) toggleObjective(qid,idx)
 *   addObjective(qid) editObjective(qid,idx) removeObjective(qid,idx)
 *   toggleTurretBuilt(turretId)
 *   saveMapping(map) openAssign()
 *   addPartyNote(text)
 *   promptText(title,val) promptNumber(title,val) promptObjective(title,def) confirm(title,msg)
 */
(function () {
  "use strict";
  const S = {};
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pctv = (h, r) => (r <= 0 ? 100 : clamp((h / r) * 100, 0, 100));
  S.esc = esc;

  /* ------------------------------------------------------------------ */
  S.ensureStyles = function () {
    if (typeof document === "undefined" || document.getElementById("ssvj-styles")) return;
    const st = document.createElement("style");
    st.id = "ssvj-styles";
    st.textContent = `
    .ssvj{--bg:#070b14;--panel:#0d1526;--panel2:#0a1120;--border:#20304d;--line:#16223a;
      --ink:#d8e6f6;--dim:#7f93b3;--teal:#3fe0c8;--teal2:#9ff2e6;--gold:#f2c14b;--red:#ff5470;
      --good:#57d38c;--blue:#62b6ff;--violet:#c9a0ff;
      font-family:'Courier New',ui-monospace,monospace;color:var(--ink);line-height:1.5;
      padding:16px 18px;box-sizing:border-box;}
    .ssvj *{box-sizing:border-box;}
    .ssvj h1.ssvj-title{margin:0 0 2px;font-size:22px;letter-spacing:1px;color:var(--teal);font-weight:700;text-transform:uppercase;}
    .ssvj .ssvj-sub{color:var(--dim);font-size:13px;margin:0 0 16px;}
    .ssvj .ssvj-card{border:1px solid var(--border);border-radius:9px;background:linear-gradient(160deg,rgba(63,224,200,.05),rgba(0,0,0,.25));padding:14px 16px;margin-bottom:12px;}
    .ssvj .q-head{display:flex;align-items:center;gap:10px;cursor:pointer;}
    .ssvj .q-ico{font-size:20px;flex:none;}
    .ssvj .q-name{font-weight:700;font-size:17px;color:#eaf6ff;flex:1;min-width:0;}
    .ssvj .pill{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:20px;white-space:nowrap;}
    .ssvj .pill.done{background:rgba(87,211,140,.16);color:var(--good);border:1px solid rgba(87,211,140,.4);}
    .ssvj .pill.active{background:rgba(242,193,75,.14);color:var(--gold);border:1px solid rgba(242,193,75,.4);}
    .ssvj .pill.open{background:rgba(98,182,255,.14);color:var(--blue);border:1px solid rgba(98,182,255,.4);}
    .ssvj .q-next{color:var(--dim);font-size:13px;margin:8px 0 0;}
    .ssvj .q-next b{color:var(--teal2);font-weight:700;}
    .ssvj .q-blurb{color:#b9cbe4;font-size:13.5px;margin:9px 0 4px;}
    .ssvj .chev{color:var(--dim);font-size:13px;transition:transform .15s;}
    .ssvj .link{color:var(--teal);cursor:pointer;font-size:13px;}
    .ssvj .link:hover{text-decoration:underline;}
    .ssvj .bar-row{margin:11px 0 4px;}
    .ssvj .bar-top{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;}
    .ssvj .bar-top .lbl{color:var(--teal2);font-weight:700;}
    .ssvj .bar-top .num{color:var(--dim);font-variant-numeric:tabular-nums;}
    .ssvj .bar{position:relative;height:12px;background:#08101f;border:1px solid var(--line);border-radius:7px;overflow:hidden;}
    .ssvj .bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:7px;display:block;}
    .ssvj .bar>i.full{background:linear-gradient(90deg,#2f9c86,var(--teal));}
    .ssvj .bar>i.part{background:linear-gradient(90deg,#8a6a1c,var(--gold));}
    .ssvj .bar>i.low{background:linear-gradient(90deg,#7a2740,var(--red));}
    .ssvj .step{font-family:inherit;background:#0b1424;border:1px solid var(--border);color:var(--ink);border-radius:6px;padding:2px 9px;font-size:14px;cursor:pointer;}
    .ssvj .step:hover{border-color:var(--teal);color:var(--teal);}
    .ssvj .btn{font-family:inherit;background:rgba(63,224,200,.12);border:1px solid var(--teal);color:var(--teal2);border-radius:6px;padding:5px 11px;font-size:12.5px;cursor:pointer;}
    .ssvj .btn:hover{background:rgba(63,224,200,.22);}
    .ssvj .btn.mini{padding:2px 8px;font-size:11.5px;}
    .ssvj .btn.warn{border-color:#7a2740;color:#ff9db0;background:rgba(255,84,112,.08);}
    .ssvj .gm-row{display:flex;gap:6px;align-items:center;margin-top:9px;flex-wrap:wrap;}
    .ssvj .gm-tag{font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--gold);text-transform:uppercase;}
    .ssvj .obj{display:flex;gap:9px;align-items:flex-start;padding:6px 0;font-size:13.5px;color:#c6d6ec;border-bottom:1px solid #10203622;}
    .ssvj .obj .box{flex:none;width:16px;height:16px;border:1px solid var(--border);border-radius:4px;margin-top:2px;display:grid;place-items:center;color:var(--good);font-size:12px;cursor:pointer;}
    .ssvj .obj.done .box{background:rgba(87,211,140,.16);border-color:rgba(87,211,140,.5);}
    .ssvj .obj.done .otitle{color:#7f93b3;text-decoration:line-through;}
    .ssvj .obj .otitle{cursor:pointer;font-weight:600;color:#dbe8f8;}
    .ssvj .obj .odetail{color:#93a7c4;font-size:12.5px;margin-top:3px;}
    .ssvj .obj .cost{color:var(--dim);font-size:12px;}
    .ssvj .t-ready{color:var(--good);font-weight:700;}
    .ssvj .t-built{color:var(--teal);font-weight:700;}
    .ssvj .t-wait{color:var(--red);}
    .ssvj .two-col{display:grid;grid-template-columns:200px 1fr;gap:14px;}
    .ssvj .rail{border:1px solid var(--border);border-radius:9px;background:var(--panel2);padding:6px;height:fit-content;}
    .ssvj .rail a{display:block;padding:8px 10px;border-radius:6px;color:#bcd0ea;font-size:13px;cursor:pointer;text-decoration:none;}
    .ssvj .rail a:hover{background:rgba(63,224,200,.08);color:var(--teal2);}
    .ssvj .rail a.sel{background:rgba(63,224,200,.14);color:var(--teal);font-weight:700;}
    .ssvj .doc h2{color:var(--teal);font-size:16px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px;}
    .ssvj .doc h3{color:var(--gold);font-size:13.5px;margin:14px 0 4px;text-transform:uppercase;letter-spacing:.4px;}
    .ssvj .doc p{font-size:13.5px;color:#c6d6ec;margin:6px 0;}
    .ssvj .doc ul{margin:6px 0 6px 2px;padding-left:18px;}
    .ssvj .doc li{font-size:13.5px;color:#c6d6ec;margin:4px 0;}
    .ssvj .doc b{color:var(--teal2);}
    .ssvj .tl{position:relative;margin-left:8px;padding-left:22px;border-left:2px solid var(--line);}
    .ssvj .tl-item{position:relative;margin-bottom:15px;}
    .ssvj .tl-item::before{content:'';position:absolute;left:-29px;top:3px;width:11px;height:11px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 3px rgba(63,224,200,.15);}
    .ssvj .tl-item.era::before{background:var(--violet);box-shadow:0 0 0 3px rgba(201,160,255,.15);}
    .ssvj .tl-item.now::before{background:var(--gold);box-shadow:0 0 0 3px rgba(242,193,75,.18);}
    .ssvj .tl-date{font-size:11px;font-weight:700;color:var(--teal2);letter-spacing:.03em;}
    .ssvj .tl-tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);border:1px solid rgba(242,193,75,.32);border-radius:20px;padding:1px 7px;margin-left:6px;}
    .ssvj .tl-title{font-weight:700;color:#eaf6ff;font-size:14.5px;margin-top:2px;}
    .ssvj .tl-body{font-size:13px;color:#b9cbe4;margin-top:2px;}
    .ssvj .crumbs{font-size:12.5px;color:var(--dim);margin-bottom:10px;}
    .ssvj .crumbs a{color:var(--teal);cursor:pointer;text-decoration:none;}
    .ssvj .crumbs a:hover{text-decoration:underline;}
    .ssvj .galgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}
    .ssvj .galbtn{border:1px solid var(--border);border-radius:10px;background:var(--panel2);padding:16px;cursor:pointer;text-align:left;color:inherit;font-family:inherit;border-left:4px solid var(--teal);}
    .ssvj .galbtn:hover{background:rgba(63,224,200,.08);}
    .ssvj .galbtn.soon{border-left-color:var(--red);opacity:.7;cursor:not-allowed;}
    .ssvj .galbtn .gn{font-weight:700;font-size:15px;color:#eaf6ff;}
    .ssvj .galbtn .gs{font-size:12px;color:var(--dim);margin-top:4px;}
    .ssvj .mapstage{position:relative;width:100%;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#05080f;line-height:0;}
    .ssvj .mapstage img{width:100%;display:block;}
    .ssvj .hot{position:absolute;width:22px;height:22px;transform:translate(-50%,-50%);border-radius:50%;border:1.5px solid transparent;background:transparent;cursor:pointer;padding:0;}
    .ssvj .hot:hover{border-color:var(--teal);background:rgba(63,224,200,.18);box-shadow:0 0 12px rgba(63,224,200,.5);}
    .ssvj .hot.nodata:hover{border-color:var(--red);background:rgba(255,84,112,.18);box-shadow:0 0 12px rgba(255,84,112,.4);}
    .ssvj .hot.sel{border-color:var(--gold);background:rgba(242,193,75,.2);}
    .ssvj .detail{border:1px solid var(--border);border-radius:9px;background:var(--panel2);padding:12px 14px;margin-top:12px;}
    .ssvj .detail.red{border-color:rgba(255,84,112,.5);background:rgba(255,84,112,.06);}
    .ssvj .noinfo{color:var(--red);font-weight:700;}
    .ssvj .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;color:var(--dim);margin-top:9px;}
    .ssvj .legend b{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;}
    .ssvj .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;}
    .ssvj .who{border:1px solid var(--border);border-radius:9px;background:var(--panel2);padding:12px 13px;border-top:3px solid var(--teal);}
    .ssvj .who .nm{font-weight:700;color:#eaf6ff;font-size:15px;}
    .ssvj .who .rl{font-size:11.5px;color:var(--dim);margin-bottom:6px;}
    .ssvj .who p{font-size:12.5px;color:#c0d2ea;margin:0;}
    .ssvj .dossier{border:1px solid var(--border);border-radius:10px;padding:16px;background:linear-gradient(160deg,rgba(63,224,200,.05),rgba(0,0,0,.3));}
    .ssvj .dossier .nm{font-size:20px;font-weight:700;}
    .ssvj .dossier .rl{color:var(--teal2);font-size:12.5px;margin-bottom:12px;}
    .ssvj .sec{border-radius:9px;padding:11px 13px;margin-top:11px;}
    .ssvj .sec .hd{font-weight:700;font-size:12px;letter-spacing:.11em;text-transform:uppercase;margin-bottom:5px;}
    .ssvj .sec ul{margin:0;padding-left:17px;}
    .ssvj .sec li{font-size:13px;margin:5px 0;color:#d0deee;}
    .ssvj .sec.secret{border:1px solid rgba(255,84,112,.4);background:rgba(255,84,112,.06);}
    .ssvj .sec.secret .hd{color:var(--red);}
    .ssvj .sec.goals{border:1px solid rgba(242,193,75,.32);background:rgba(242,193,75,.05);}
    .ssvj .sec.goals .hd{color:var(--gold);}
    .ssvj .sec.abil{border:1px solid rgba(98,182,255,.3);background:rgba(98,182,255,.05);}
    .ssvj .sec.abil .hd{color:var(--blue);}
    .ssvj .sec.hooks{border:1px solid var(--border);background:var(--panel2);}
    .ssvj .sec.hooks .hd{color:var(--teal);}
    .ssvj .sec.party{border:1px solid var(--border);background:var(--panel2);}
    .ssvj .sec.party .hd{color:var(--teal);}
    .ssvj select,.ssvj textarea,.ssvj input[type=text]{font-family:inherit;background:#0b1424;border:1px solid var(--border);color:var(--ink);border-radius:6px;padding:6px 8px;font-size:13px;}
    .ssvj textarea{width:100%;min-height:96px;resize:vertical;margin-top:6px;}
    .ssvj .muted{color:var(--dim);font-size:12.5px;}
    .ssvj .banner{border:1px solid var(--border);border-radius:8px;background:var(--panel2);padding:9px 12px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
    .ssvj .backbtn{display:inline-flex;align-items:center;gap:6px;color:var(--teal);cursor:pointer;font-size:13px;margin-bottom:10px;}
    .ssvj .backbtn:hover{text-decoration:underline;}
    .ssvj .inv-edit{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:11px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;background:var(--panel2);}
    .ssvj .inv-item{font-size:12px;color:var(--teal2);display:inline-flex;gap:5px;align-items:center;}
    .ssvj .inv-item b{color:var(--ink);min-width:14px;text-align:center;font-variant-numeric:tabular-nums;}
    .ssvj .turret-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px;}
    .ssvj .turret-card{border:1px solid var(--border);border-radius:9px;background:var(--panel2);padding:10px 12px;}
    .ssvj .turret-card.built{opacity:.7;border-color:rgba(87,211,140,.4);}
    .ssvj .turret-head{display:flex;gap:11px;align-items:flex-start;}
    .ssvj .turret-img{width:62px;height:66px;object-fit:contain;flex:none;border-radius:6px;background:#0a1120;border:1px solid var(--line);}
    .ssvj .turret-bars{margin-top:9px;}
    .ssvj .recap{font-size:13.5px;color:#c6d6ec;line-height:1.55;}
    .ssvj .recap h3{color:var(--teal);font-size:14px;margin:14px 0 5px;text-transform:uppercase;letter-spacing:.4px;}
    .ssvj .recap p{margin:7px 0;}
    .ssvj .recap ul{margin:6px 0 6px 2px;padding-left:18px;}
    .ssvj .recap li{margin:4px 0;}
    .ssvj .recap b{color:var(--teal2);}
    .ssvj .recap table.rtab{border-collapse:collapse;margin:8px 0;font-size:12.5px;width:100%;}
    .ssvj .recap table.rtab th,.ssvj .recap table.rtab td{border:1px solid var(--line);padding:4px 8px;text-align:left;}
    .ssvj .recap table.rtab th{color:var(--gold);background:var(--panel2);}
    .ssvj .sess{cursor:pointer;border:1px solid transparent;border-radius:8px;padding:8px 10px;margin-top:8px;transition:background .12s;}
    .ssvj .sess:hover{background:rgba(63,224,200,.06);border-color:var(--border);}
    .ssvj .sess .st{font-weight:700;color:var(--teal2);font-size:14px;display:flex;justify-content:space-between;gap:8px;align-items:center;}
    .ssvj .sess .st .go{color:var(--teal);font-size:12px;}
    `;
    document.head.appendChild(st);
  };

  function root(body, cls) {
    S.ensureStyles();
    body.innerHTML = `<div class="ssvj ssvj-${cls}"></div>`;
    return body.firstElementChild;
  }
  function barClass(h, r) { if (h >= r) return "full"; if (h > 0) return "part"; return "low"; }
  function matName(data, id) { const m = (data.materials || []).find((x) => x.id === id); return m ? m.name : id; }
  function matShort(data, id) { return matName(data, id).split(" ")[0]; }

  /* ================================================================== */
  /*  1. QUESTS                                                          */
  /* ================================================================== */
  S._questOpen = null;      // quest id in detail view
  S._objOpen = {};          // "qid:idx" -> bool (expanded detail)
  S._collapsed = {};        // qid -> bool (turret group)

  function turretReady(data, t) { return Object.entries(t.cost).every(([k, v]) => Number(data.inventory[k] || 0) >= v); }

  function questNextText(q) {
    if (q.status === "complete") return `<span class="pill done">Complete</span>`;
    if (!q.objectives || !q.objectives.length) return `<span class="q-next"><b>No objectives yet</b> — ASTRA will update this.</span>`;
    const next = q.objectives.find((o) => !o.done);
    if (!next) return `<span class="q-next">All objectives complete.</span>`;
    return `<span class="q-next">Next: <b>${esc(next.title)}</b></span>`;
  }

  S.renderQuests = function (ctx, body) {
    const el = root(body, "quests");
    const data = ctx.data;
    if (S._questOpen) { const q = data.quests.find((x) => x.id === S._questOpen); if (q) return questDetail(ctx, el, q); S._questOpen = null; }

    const card = (q) => {
      const pillCls = q.status === "complete" ? "done" : (q.objectives && q.objectives.length ? "active" : "open");
      const pillTxt = q.status === "complete" ? "Complete" : (q.objectives && q.objectives.length ? "In Progress" : "Long Arc");
      let extra = "";
      if (q.kind === "turrets") {
        const collapsed = S._collapsed[q.id] !== undefined ? S._collapsed[q.id] : (q.collapsed !== false);
        extra = `<div style="margin-top:8px;"><span class="link" data-collapse="${q.id}">${collapsed ? "▸ show" : "▾ hide"} the 6 turrets &amp; materials</span></div>`;
        if (!collapsed) extra += turretGroup(ctx, q);
      }
      return `<div class="ssvj-card">
        <div class="q-head" data-open="${q.id}"><span class="q-ico">${q.ico || "•"}</span><span class="q-name">${esc(q.name)}</span><span class="pill ${pillCls}">${pillTxt}</span></div>
        ${questNextText(q)}
        ${extra}
      </div>`;
    };

    const done = data.quests.filter((q) => q.status === "complete");
    const active = data.quests.filter((q) => q.status !== "complete");
    el.innerHTML = `
      <h1 class="ssvj-title">Ship's Quest Board</h1>
      <p class="ssvj-sub">Click any quest for the full briefing &amp; checklist. Turret bars fill from the ship's inventory.</p>
      ${active.map(card).join("")}
      <div class="muted" style="margin:14px 0 8px;text-transform:uppercase;letter-spacing:1px;color:#5f7a94;">Completed</div>
      ${done.map(card).join("")}
      ${ctx.isGM ? `<div class="gm-row"><span class="gm-tag">GM</span><button class="btn mini" data-addquest>+ new quest</button></div>` : ""}`;

    el.querySelectorAll("[data-open]").forEach((h) => h.onclick = () => { S._questOpen = h.dataset.open; S.renderQuests(ctx, body); });
    el.querySelectorAll("[data-collapse]").forEach((a) => a.onclick = (e) => { e.stopPropagation(); const id = a.dataset.collapse; const cur = S._collapsed[id] !== undefined ? S._collapsed[id] : true; S._collapsed[id] = !cur; S.renderQuests(ctx, body); });
    wireTurretGroup(ctx, el, body);
    const aq = el.querySelector("[data-addquest]"); if (aq) aq.onclick = async () => { const t = await ctx.promptText?.("New quest name", ""); if (t) ctx.addQuest?.(t); };
  };

  // Each turret is its own task with its OWN material progress bars (fed from the shared inventory).
  function turretGroup(ctx, q) {
    const data = ctx.data;
    const gmInv = ctx.isGM ? `<div class="inv-edit"><span class="gm-tag">Ship inventory (GM)</span>` +
      (data.materials || []).map((m) => `<span class="inv-item">${esc(matShort(data, m.id))}
        <button class="step" data-inv="${m.id}" data-d="-1">−</button><b data-invval="${m.id}">${Number(data.inventory[m.id] || 0)}</b>
        <button class="step" data-inv="${m.id}" data-d="1">+</button></span>`).join("") + `</div>` : "";
    const cards = q.objectives.map((o) => {
      const t = (data.turrets || []).find((x) => x.id === o.turret);
      if (!t) return "";
      const built = t.built, ready = turretReady(data, t);
      const bars = Object.entries(t.cost).map(([k, v]) => {
        const have = Number(data.inventory[k] || 0);
        return `<div class="bar-row"><div class="bar-top"><span class="lbl">${esc(matName(data, k))}</span><span class="num">${Math.min(have, v)} / ${v}</span></div>
          <div class="bar"><i class="${barClass(have, v)}" style="width:${pctv(have, v)}%"></i></div></div>`;
      }).join("");
      const state = built ? `<span class="t-built">✔ built</span>` : (ready ? `<span class="t-ready">ready to build</span>` : `<span class="t-wait">needs materials</span>`);
      return `<div class="turret-card ${built ? "built" : ""}">
        <div class="turret-head">
          ${t.img ? `<img class="turret-img" src="${ctx.assetUrl(t.img)}" alt=""/>` : ""}
          <div style="flex:1;min-width:0;"><div class="otitle">${esc(t.name)}</div><div class="odetail">${esc(o.detail || t.role || "")}</div>
            <div style="margin-top:4px;">${state}</div></div>
          ${ctx.isGM ? `<button class="btn mini" data-turret="${t.id}">${built ? "unbuild" : "mark built"}</button>` : ""}
        </div>
        ${built ? "" : `<div class="turret-bars">${bars}</div>`}
      </div>`;
    }).join("");
    return `<div style="margin-top:8px;">${gmInv}<div class="turret-grid">${cards}</div></div>`;
  }
  function wireTurretGroup(ctx, el, body) {
    el.querySelectorAll("[data-inv]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); ctx.adjustInv(b.dataset.inv, Number(b.dataset.d)); });
    el.querySelectorAll("[data-setinv]").forEach((b) => b.onclick = async (e) => {
      e.stopPropagation(); const id = b.dataset.setinv;
      const v = await ctx.promptNumber?.(`Set on-hand — ${matName(ctx.data, id)}`, Number(ctx.data.inventory[id] || 0));
      if (v != null) ctx.setInv(id, v);
    });
    el.querySelectorAll("[data-turret]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); if (b.dataset.turret) ctx.toggleTurretBuilt(b.dataset.turret); });
  }

  function questDetail(ctx, el, q) {
    const data = ctx.data;
    const isTurret = q.kind === "turrets";
    const objs = isTurret ? "" : (q.objectives && q.objectives.length
      ? q.objectives.map((o, i) => {
          const open = S._objOpen[`${q.id}:${i}`];
          return `<div class="obj ${o.done ? "done" : ""}">
            <span class="box" ${ctx.isGM ? `data-toggle="${i}"` : ""}>${o.done ? "✔" : ""}</span>
            <div style="flex:1;">
              <div class="otitle" data-expand="${i}">${esc(o.title)}</div>
              ${open ? `<div class="odetail">${esc(o.detail || "")}</div>` : ""}
              ${ctx.isGM ? `<div class="gm-row"><button class="btn mini" data-edit="${i}">edit</button><button class="btn mini warn" data-del="${i}">remove</button></div>` : ""}
            </div>
          </div>`;
        }).join("")
      : `<p class="muted">No objectives yet.${ctx.isGM ? " Use “+ add task” below." : " ASTRA will update this."}</p>`);

    el.innerHTML = `
      <div class="backbtn" data-back>◀ All quests</div>
      <div class="q-head" style="cursor:default;"><span class="q-ico">${q.ico || "•"}</span><span class="q-name">${esc(q.name)}</span>
        <span class="pill ${q.status === "complete" ? "done" : "active"}">${q.status === "complete" ? "Complete" : "In Progress"}</span></div>
      <p class="q-blurb" style="margin-top:10px;">${esc(q.description || "")}</p>
      <div class="doc"><h3>Quest Log &amp; Checklist</h3></div>
      ${isTurret ? turretGroup(ctx, q) : objs}
      ${ctx.isGM ? `<div class="gm-row"><span class="gm-tag">GM</span>
        ${!isTurret ? `<button class="btn mini" data-add>+ add task</button>` : ""}
        <button class="btn mini" data-status>${q.status === "complete" ? "mark active" : "mark complete"}</button></div>` : ""}`;

    el.querySelector("[data-back]").onclick = () => { S._questOpen = null; S.renderQuests(ctx, el.parentElement); };
    el.querySelectorAll("[data-expand]").forEach((t) => t.onclick = () => { const k = `${q.id}:${t.dataset.expand}`; S._objOpen[k] = !S._objOpen[k]; questDetail(ctx, el, q); });
    if (ctx.isGM) {
      el.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = () => ctx.toggleObjective(q.id, Number(b.dataset.toggle)));
      el.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => { const o = q.objectives[+b.dataset.edit]; const r = await ctx.promptObjective?.("Edit task", o); if (r) ctx.editObjective(q.id, +b.dataset.edit, r); });
      el.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { if (await ctx.confirm?.("Remove task?", "Delete this objective?")) ctx.removeObjective(q.id, +b.dataset.del); });
      const add = el.querySelector("[data-add]"); if (add) add.onclick = async () => { const r = await ctx.promptObjective?.("Add task", { title: "", detail: "" }); if (r && r.title) ctx.addObjective(q.id, r); };
      const stt = el.querySelector("[data-status]"); if (stt) stt.onclick = () => ctx.setQuestStatus(q.id, q.status === "complete" ? "active" : "complete");
      wireTurretGroup(ctx, el, el.parentElement);
    }
  }

  /* ================================================================== */
  /*  2. LORE                                                            */
  /* ================================================================== */
  S._loreSel = null;
  S.renderLore = function (ctx, body) {
    const el = root(body, "lore");
    const lore = ctx.data.lore || [];
    if (!lore.length) { el.innerHTML = `<h1 class="ssvj-title">Lore</h1><p class="muted">No lore loaded.</p>`; return; }
    if (!S._loreSel || !lore.find((s) => s.id === S._loreSel)) S._loreSel = lore[0].id;
    const sel = lore.find((s) => s.id === S._loreSel);
    el.innerHTML = `
      <h1 class="ssvj-title">Lore — The Known Universe</h1>
      <p class="ssvj-sub">What the crew understands about the world they're lost in.</p>
      <div class="two-col">
        <nav class="rail">${lore.map((s) => `<a data-lore="${s.id}" class="${s.id === sel.id ? "sel" : ""}">${esc(s.title)}</a>`).join("")}</nav>
        <div class="doc">${sel.body}</div>
      </div>`;
    el.querySelectorAll("[data-lore]").forEach((a) => a.onclick = () => { S._loreSel = a.dataset.lore; S.renderLore(ctx, body); });
  };

  /* ================================================================== */
  /*  3. TIMELINE                                                        */
  /* ================================================================== */
  S.renderTimeline = function (ctx, body) {
    const el = root(body, "timeline");
    const tl = ctx.data.timeline || [];
    el.innerHTML = `
      <h1 class="ssvj-title">Timeline</h1>
      <p class="ssvj-sub">In chronological order (Standard Year). The tag notes when the party learned it.</p>
      <div class="tl">${tl.map((t) => `
        <div class="tl-item ${t.era ? "era" : ""} ${t.now ? "now" : ""}">
          <span class="tl-date">${esc(t.date)}</span><span class="tl-tag">${esc(t.tag)}</span>
          <div class="tl-title">${esc(t.title)}</div>
          <div class="tl-body">${esc(t.body)}</div>
        </div>`).join("")}</div>`;
  };

  /* ================================================================== */
  /*  4. MAP                                                             */
  /* ================================================================== */
  // Map is a tree of nodes: map.start + map.nodes{ id: {name, image, kind, locations:[{id,name,x,y,hasData,info?,child?}]} }.
  // A location with a `child` node id drills into that sub-map; otherwise it shows info, or a red
  // "no info yet" popup when hasData is false.
  S._mapPath = null;      // array of node ids (breadcrumb)
  S._mapSel = null;       // selected location id (info / red popup)
  S.renderMap = function (ctx, body) {
    const el = root(body, "map");
    const M = (ctx.data && ctx.data.map) || {};
    const nodes = M.nodes || {};
    const startId = M.start || Object.keys(nodes)[0];
    if (!startId || !nodes[startId]) { el.innerHTML = `<h1 class="ssvj-title">Star Map</h1><p class="muted">No map loaded.</p>`; return; }
    if (!S._mapPath || !S._mapPath.length || !nodes[S._mapPath[S._mapPath.length - 1]]) S._mapPath = [startId];

    const node = nodes[S._mapPath[S._mapPath.length - 1]];
    const locs = node.locations || [];
    const loc = S._mapSel ? locs.find((l) => l.id === S._mapSel) : null;

    const crumbs = S._mapPath.map((id, i) => `<a data-jump="${i}">${esc(nodes[id].name)}</a>`).join(' <span>&rsaquo;</span> ');
    const back = S._mapPath.length > 1 ? `<a data-back>&#9664; Back</a> &nbsp; ` : "";

    let detail = "";
    if (loc) {
      detail = loc.hasData
        ? `<div class="detail"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><b style="color:var(--teal);font-size:15px;">${esc(loc.name)}</b><a class="link" data-close>close ✕</a></div><p style="color:#c6d6ec;margin-top:6px;font-size:13.5px;">${esc(loc.info || "")}</p></div>`
        : `<div class="detail red"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><b style="color:var(--red);font-size:15px;">${esc(loc.name)}</b><a class="link" data-close>close ✕</a></div><p class="noinfo" style="margin-top:6px;">⚠ ASTRA has no info on this region yet.</p></div>`;
    }

    el.innerHTML = `
      <h1 class="ssvj-title">Star Map</h1>
      <div class="crumbs">${back}${crumbs}</div>
      <div class="mapstage">
        <img src="${ctx.assetUrl(node.image)}" alt="${esc(node.name)}"/>
        ${locs.map((l) => { const drill = l.child && nodes[l.child]; const nd = (l.hasData || drill) ? "" : "nodata"; return `<button class="hot ${nd} ${loc && loc.id === l.id ? "sel" : ""}" data-loc="${l.id}" title="${esc(l.name)}" style="left:${(l.x * 100).toFixed(2)}%;top:${(l.y * 100).toFixed(2)}%;"></button>`; }).join("")}
      </div>
      <div class="legend">
        <span><b style="background:#3fe0c8"></b>Charted — click a marker</span>
        <span><b style="background:#ff5470"></b>No info yet</span>
        <span class="muted">${node.kind === "galaxy" ? "Click The Shattered Expanse to zoom into its sector chart." : ""}</span>
      </div>
      ${detail}`;

    el.querySelectorAll("[data-loc]").forEach((h) => h.onclick = () => {
      const l = locs.find((x) => x.id === h.dataset.loc);
      if (l && l.child && nodes[l.child]) { S._mapPath = S._mapPath.concat(l.child); S._mapSel = null; }
      else { S._mapSel = h.dataset.loc; }
      S.renderMap(ctx, body);
    });
    el.querySelectorAll("[data-jump]").forEach((a) => a.onclick = () => { S._mapPath = S._mapPath.slice(0, Number(a.dataset.jump) + 1); S._mapSel = null; S.renderMap(ctx, body); });
    const b = el.querySelector("[data-back]"); if (b) b.onclick = () => { S._mapPath = S._mapPath.slice(0, -1); S._mapSel = null; S.renderMap(ctx, body); };
    const c = el.querySelector("[data-close]"); if (c) c.onclick = () => { S._mapSel = null; S.renderMap(ctx, body); };
  };

  /* ================================================================== */
  /*  5. MY JOURNAL                                                      */
  /* ================================================================== */
  S._gmPreview = null;
  function dossierHtml(c) {
    const sec = (cls, label, items) => items && items.length ? `<div class="sec ${cls}"><div class="hd">${label}</div><ul>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : "";
    const s = c.secret || {};
    return `<div class="dossier">
      <div class="nm" style="color:${c.color}">${esc(c.name)}</div>
      <div class="rl">${esc(c.role)}</div>
      ${sec("secret", "🔒 Known only to you", s.dossier)}
      ${sec("goals", "◆ Private goals", s.goals)}
      ${sec("abil", "⚡ Your abilities", s.abilities)}
      ${sec("hooks", "⚑ Loose threads", s.hooks)}
      ${sec("party", "What the party sees", c.party)}
    </div>`;
  }
  S.renderMyJournal = function (ctx, body) {
    const el = root(body, "myjournal");
    const chars = ctx.data.characters || [];

    if (ctx.isGM) {
      if (!S._gmPreview || !chars.find((c) => c.id === S._gmPreview)) S._gmPreview = chars[0] && chars[0].id;
      const c = chars.find((x) => x.id === S._gmPreview);
      const assigned = (ctx.users || []).filter((u) => !u.isGM).map((u) => {
        const cid = (ctx.data.playerMap || {})[u.id]; const cc = cid ? chars.find((x) => x.id === cid) : null;
        return `${esc(u.name)} → <b style="color:${cc ? cc.color : "#7f93b3"}">${cc ? esc(cc.name) : "— unassigned"}</b>`;
      }).join(" &nbsp;·&nbsp; ") || "<span class='muted'>no players connected</span>";
      el.innerHTML = `
        <h1 class="ssvj-title">My Journal — GM view</h1>
        <p class="ssvj-sub">Each player sees only their own character's dossier here. Preview any below.</p>
        <div class="banner"><span class="gm-tag">Assignments</span><span style="font-size:12.5px">${assigned}</span><button class="btn" data-assign>Assign players…</button></div>
        <div class="banner"><span style="font-size:13px">Preview dossier:</span>
          <select data-preview>${chars.map((x) => `<option value="${x.id}" ${x.id === S._gmPreview ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        ${c ? dossierHtml(c) : ""}`;
      el.querySelector("[data-preview]").onchange = (e) => { S._gmPreview = e.target.value; S.renderMyJournal(ctx, body); };
      el.querySelector("[data-assign]").onclick = () => ctx.openAssign?.();
      return;
    }

    const c = ctx.myCharId ? chars.find((x) => x.id === ctx.myCharId) : null;
    if (!c) {
      el.innerHTML = `<h1 class="ssvj-title">My Journal</h1><p class="ssvj-sub">Your private dossier — for your eyes only.</p>
        <div class="ssvj-card"><p>No character is assigned to your account yet. Ask your GM to assign you (My Journal → Assign players).</p></div>`;
      return;
    }
    el.innerHTML = `
      <h1 class="ssvj-title">My Journal — ${esc(c.name)}</h1>
      <p class="ssvj-sub">Your private dossier. The 'known only to you' material is not visible to the rest of the crew.</p>
      ${dossierHtml(c)}
      <div class="ssvj-card" style="margin-top:14px;">
        <div class="q-head" style="cursor:default;"><span class="q-ico">📝</span><span class="q-name">My notes</span></div>
        <p class="muted">Private scratchpad — saved to your account (not shared).</p>
        <textarea data-scratch placeholder="Jot anything…">${esc(ctx.scratchpad || "")}</textarea>
        <div style="margin-top:8px;"><button class="btn" data-savescratch>Save notes</button> <span class="muted" data-saved></span></div>
      </div>`;
    const ta = el.querySelector("[data-scratch]");
    el.querySelector("[data-savescratch]").onclick = () => { ctx.saveScratchpad(ta.value); const s = el.querySelector("[data-saved]"); if (s) s.textContent = "saved."; };
  };

  /* ================================================================== */
  /*  6. PARTY JOURNAL                                                   */
  /* ================================================================== */
  S._sessionOpen = null;   // session index when viewing a full recap
  S.renderParty = function (ctx, body) {
    const el = root(body, "party");
    const data = ctx.data;
    const sessions = data.partyLog || [];

    if (S._sessionOpen != null && sessions[S._sessionOpen]) {
      const s = sessions[S._sessionOpen];
      const full = s.full || ("<ul>" + s.beats.map((b) => `<li>${esc(b)}</li>`).join("") + "</ul>");
      el.innerHTML = `
        <div class="backbtn" data-back>◀ Back to Party Journal</div>
        <h1 class="ssvj-title" style="font-size:19px;">${esc(s.session)} — ${esc(s.title)}</h1>
        <p class="ssvj-sub">${esc(s.date || "")} · the full account</p>
        <div class="recap">${full}</div>`;
      el.querySelector("[data-back]").onclick = () => { S._sessionOpen = null; S.renderParty(ctx, body); };
      return;
    }

    const notes = data.partyNotes || [];
    const who = data.whoswho || [];
    const leads = data.leads || [];
    el.innerHTML = `
      <h1 class="ssvj-title">Party Journal</h1>
      <p class="ssvj-sub">The crew's shared record — click a session for the full rundown.</p>

      <div class="ssvj-card">
        <div class="q-head" style="cursor:default;"><span class="q-ico">📓</span><span class="q-name">Mission log</span>
          ${ctx.isGM ? `<button class="btn mini" data-addnote>+ note</button>` : ""}</div>
        ${sessions.map((s, i) => `<div class="sess" data-sess="${i}">
          <div class="st"><span>${esc(s.session)} — ${esc(s.title)}</span><span class="go">full recap ▸</span></div>
          <div class="muted" style="margin:2px 0 6px;">${esc(s.date || "")}</div>
          <ul class="doc" style="margin:0;">${s.beats.slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join("")}${s.beats.length > 3 ? `<li class="muted">…click for the full account</li>` : ""}</ul>
        </div>`).join("")}
        ${notes.length ? `<div style="margin-top:12px;"><div style="font-weight:700;color:var(--gold);font-size:14px;">GM notes</div>
          <ul class="doc" style="margin:4px 0 0;">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
      </div>

      <div class="ssvj-card">
        <div class="q-head" style="cursor:default;"><span class="q-ico">🧭</span><span class="q-name">Open leads &amp; mysteries</span></div>
        <ul class="doc" style="margin-top:6px">${leads.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      </div>

      <h1 class="ssvj-title" style="font-size:17px;margin-top:6px">The Crew</h1>
      <div class="grid">
        ${who.map((c) => `<div class="who" style="border-top-color:${c.color || "#3fe0c8"}">
          <div class="nm">${esc(c.name)}</div><div class="rl">${esc(c.role)}</div><p>${esc(c.text)}</p></div>`).join("")}
      </div>`;
    el.querySelectorAll("[data-sess]").forEach((d) => d.onclick = () => { S._sessionOpen = Number(d.dataset.sess); S.renderParty(ctx, body); });
    if (ctx.isGM) { const b = el.querySelector("[data-addnote]"); if (b) b.onclick = async () => { const t = await ctx.promptText?.("Add a mission-log note", ""); if (t) ctx.addPartyNote(t); }; }
  };

  /* map of tab label -> renderer */
  S.PANELS = [
    { key: "quests", labels: ["quests", "quest board", "quest"], render: S.renderQuests },
    { key: "lore", labels: ["lore"], render: S.renderLore },
    { key: "timeline", labels: ["timeline"], render: S.renderTimeline },
    { key: "map", labels: ["map", "maps", "star map"], render: S.renderMap },
    { key: "myjournal", labels: ["my journal", "my notes", "personal", "journal"], render: S.renderMyJournal },
    { key: "party", labels: ["party journal", "party", "party log"], render: S.renderParty }
  ];

  globalThis.SSVJ = S;
})();
