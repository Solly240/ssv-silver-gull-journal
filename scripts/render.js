/**
 * SSV Silver Gull — Ship's Journal : shared content + renderers
 *
 * Foundry-agnostic. Assigns `globalThis.SSVJ`. Loaded two ways:
 *   - journal.js (the Foundry esmodule) does `import "./render.js"` for its side effect,
 *     then wires Foundry state into the ctx object the renderers expect.
 *   - preview.html loads it as a classic <script> and wires an in-memory ctx.
 *
 * No import/export and no Foundry globals in here, so it runs identically in both.
 * Every renderer has the signature  render(ctx, body)  and paints into `body`.
 *
 * ctx contract (host supplies):
 *   isGM            boolean
 *   inv             { materialId: number }             on-hand research materials
 *   adjustInv(id,d) mutate on-hand by delta  (GM)      → persists + rerenders
 *   setInv(id,val)  set on-hand                (GM)
 *   quest           { status:{qid:'active'|'complete'}, obj:{qid:[bool,...]} }
 *   setQuestStatus(qid, status)   (GM)
 *   toggleObjective(qid, idx)     (GM)
 *   mapping         { userId: charId }
 *   users           [{id,name,isGM}]
 *   myCharId        charId | null                       (current viewer's character)
 *   saveMapping(map)              (GM)
 *   scratchpad      string                              (current viewer's private notes)
 *   saveScratchpad(text)
 *   partyLog        [string]                            (extra GM-added entries)
 *   addPartyLog(text)             (GM)
 *   notify(msg)     optional toast
 */
(function () {
  "use strict";
  const S = {};

  /* ------------------------------------------------------------------ */
  /*  helpers                                                            */
  /* ------------------------------------------------------------------ */
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pct = (h, r) => (r <= 0 ? 100 : clamp((h / r) * 100, 0, 100));
  S.esc = esc;

  /* ------------------------------------------------------------------ */
  /*  styles (injected once)                                            */
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
    .ssvj .ssvj-card{border:1px solid var(--border);border-radius:9px;background:linear-gradient(160deg,rgba(63,224,200,.05),rgba(0,0,0,.25));padding:14px 16px;margin-bottom:13px;}
    .ssvj .q-head{display:flex;align-items:center;gap:10px;}
    .ssvj .q-ico{font-size:20px;flex:none;}
    .ssvj .q-name{font-weight:700;font-size:17px;color:#eaf6ff;flex:1;min-width:0;}
    .ssvj .pill{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:20px;white-space:nowrap;}
    .ssvj .pill.done{background:rgba(87,211,140,.16);color:var(--good);border:1px solid rgba(87,211,140,.4);}
    .ssvj .pill.active{background:rgba(242,193,75,.14);color:var(--gold);border:1px solid rgba(242,193,75,.4);}
    .ssvj .pill.open{background:rgba(98,182,255,.14);color:var(--blue);border:1px solid rgba(98,182,255,.4);}
    .ssvj .q-blurb{color:#b9cbe4;font-size:13.5px;margin:9px 0 4px;}
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
    .ssvj .gm-row{display:flex;gap:6px;align-items:center;margin-top:7px;flex-wrap:wrap;}
    .ssvj .gm-tag{font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--gold);text-transform:uppercase;}
    .ssvj .obj{display:flex;gap:9px;align-items:flex-start;padding:5px 0;font-size:13.5px;color:#c6d6ec;}
    .ssvj .obj .box{flex:none;width:16px;height:16px;border:1px solid var(--border);border-radius:4px;margin-top:2px;display:grid;place-items:center;color:var(--good);font-size:12px;}
    .ssvj .obj.done .box{background:rgba(87,211,140,.16);border-color:rgba(87,211,140,.5);}
    .ssvj .obj.done span{color:#7f93b3;text-decoration:line-through;}
    .ssvj .obj.gm{cursor:pointer;}
    .ssvj .turret-list{margin-top:8px;border-top:1px dashed var(--line);padding-top:8px;}
    .ssvj .turret{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:4px 0;color:#b9cbe4;}
    .ssvj .turret .cost{color:var(--dim);}
    .ssvj .t-ready{color:var(--good);font-weight:700;}
    .ssvj .t-wait{color:var(--red);}
    .ssvj .two-col{display:grid;grid-template-columns:190px 1fr;gap:14px;}
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
    .ssvj .tl-item{position:relative;margin-bottom:16px;}
    .ssvj .tl-item::before{content:'';position:absolute;left:-29px;top:3px;width:11px;height:11px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 3px rgba(63,224,200,.15);}
    .ssvj .tl-item.era::before{background:var(--violet);box-shadow:0 0 0 3px rgba(201,160,255,.15);}
    .ssvj .tl-item.now::before{background:var(--gold);box-shadow:0 0 0 3px rgba(242,193,75,.18);}
    .ssvj .tl-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);border:1px solid rgba(242,193,75,.35);border-radius:20px;padding:1px 8px;margin-bottom:4px;}
    .ssvj .tl-title{font-weight:700;color:#eaf6ff;font-size:14.5px;}
    .ssvj .tl-body{font-size:13px;color:#b9cbe4;margin-top:2px;}
    .ssvj .crumbs{font-size:12.5px;color:var(--dim);margin-bottom:10px;}
    .ssvj .crumbs a{color:var(--teal);cursor:pointer;text-decoration:none;}
    .ssvj .crumbs a:hover{text-decoration:underline;}
    .ssvj .mapwrap{border:1px solid var(--border);border-radius:10px;background:radial-gradient(120% 90% at 50% 0%,#0c1730,#05080f);overflow:hidden;}
    .ssvj svg .node{cursor:pointer;}
    .ssvj svg .node:hover .halo{opacity:.9;}
    .ssvj .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;color:var(--dim);margin-top:9px;}
    .ssvj .legend b{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;}
    .ssvj .detail{border:1px solid var(--border);border-radius:9px;background:var(--panel2);padding:12px 14px;margin-top:12px;}
    .ssvj .noinfo{color:var(--red);font-weight:700;}
    .ssvj .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;}
    .ssvj .who{border:1px solid var(--border);border-radius:9px;background:var(--panel2);padding:12px 13px;border-top:3px solid var(--teal);}
    .ssvj .who .nm{font-weight:700;color:#eaf6ff;font-size:15px;}
    .ssvj .who .rl{font-size:11.5px;color:var(--dim);margin-bottom:6px;}
    .ssvj .who ul{margin:0;padding-left:16px;}
    .ssvj .who li{font-size:12px;color:#c0d2ea;margin:3px 0;}
    .ssvj .dossier{border:1px solid var(--border);border-radius:10px;padding:16px;background:linear-gradient(160deg,rgba(63,224,200,.05),rgba(0,0,0,.3));}
    .ssvj .dossier .nm{font-size:20px;font-weight:700;color:#eaf6ff;}
    .ssvj .dossier .rl{color:var(--teal2);font-size:12.5px;margin-bottom:12px;}
    .ssvj .sec-secret{border:1px solid rgba(255,84,112,.4);background:rgba(255,84,112,.06);border-radius:9px;padding:11px 13px;margin-top:12px;}
    .ssvj .sec-secret .hd{color:var(--red);font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:5px;}
    .ssvj .sec-party{border:1px solid var(--border);border-radius:9px;padding:11px 13px;margin-top:12px;background:var(--panel2);}
    .ssvj .sec-party .hd{color:var(--teal);font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:5px;}
    .ssvj .sec-secret ul,.ssvj .sec-party ul{margin:0;padding-left:17px;}
    .ssvj .sec-secret li,.ssvj .sec-party li{font-size:13px;margin:5px 0;color:#d0deee;}
    .ssvj select,.ssvj textarea{font-family:inherit;background:#0b1424;border:1px solid var(--border);color:var(--ink);border-radius:6px;padding:6px 8px;font-size:13px;}
    .ssvj textarea{width:100%;min-height:96px;resize:vertical;margin-top:6px;}
    .ssvj .btn{font-family:inherit;background:rgba(63,224,200,.12);border:1px solid var(--teal);color:var(--teal2);border-radius:6px;padding:6px 13px;font-size:13px;cursor:pointer;}
    .ssvj .btn:hover{background:rgba(63,224,200,.22);}
    .ssvj .muted{color:var(--dim);font-size:12.5px;}
    .ssvj .banner{border:1px solid var(--border);border-radius:8px;background:var(--panel2);padding:9px 12px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
    `;
    document.head.appendChild(st);
  };

  /* ================================================================== */
  /*  CONTENT                                                           */
  /* ================================================================== */

  // Research materials for the turret rebuild. `req` = total across all 6 blueprints.
  S.MATERIALS = [
    { id: "ferrocrystal", name: "Ceruleum Ferrocrystal", req: 8, seed: 3 },
    { id: "polymer", name: "Polymorphic Polymer", req: 6, seed: 0 },
    { id: "relays", name: "Quantum Relays", req: 7, seed: 0 },
    { id: "thermite", name: "Hyper-Dense Refined Thermite", req: 3, seed: 0 }
  ];

  // The 6 turret blueprints (ship/ssv-silver-gull.md) and their component costs.
  S.TURRETS = [
    { name: "Light Flak Turret", role: "Anti-swarm point-defense", cost: { polymer: 2, ferrocrystal: 1 } },
    { name: "Heavy Autocannon", role: "Armor-piercing", cost: { thermite: 3, polymer: 2 } },
    { name: "Plasma Casing Cannon", role: "Shield-breaker", cost: { ferrocrystal: 2, relays: 1 } },
    { name: "Liquid Nitrogen Cryo-Beam", role: "Cryo / brittle-shatter", cost: { polymer: 2, relays: 1 } },
    { name: "Ion Charge Cannon", role: "EMP engine-killer", cost: { relays: 3, ferrocrystal: 1 } },
    { name: "Gravity Well Projector", role: "Kinetic pull/crush", cost: { ferrocrystal: 3, relays: 2 } }
  ];

  S.QUESTS_DONE = [
    { id: "ferro", ico: "⚙️", name: "Retrieve Ceruleum Ferrocrystal",
      blurb: "Session 1 — crossed to the mining encampment and hand-mined 100+ kg (well over the requirement) to repair the takeoff-thruster conduits and feed the micro-repair drones." },
    { id: "fuel", ico: "⛽", name: "Get More Fuel",
      blurb: "Sessions 3–4 — stripped the derelict Sandra's Folly for Hyperfold Fuel Cells. Now holding 3 cells: jump range is ample and the nav-scan's old fuel limit no longer applies." }
  ];

  S.QUESTS_ACTIVE = [
    { id: "turrets", ico: "🔧", kind: "turrets", name: "Rebuild the Ship's Turrets",
      blurb: "All 6 turret hardpoints were sheared off in the crash. ASTRA has the blueprints; the repair drones can fabricate them — but they need exotic components. Each bar below fills straight from the ship's inventory." },
    { id: "hull", ico: "🕳️", kind: "checklist", name: "Repair the Hull Breach",
      blurb: "The front windscreen took a bullet hole when Baldy shot through his own viewport to kill an Apostle self-destruct module (S4). That, plus the crash breaches, still needs sealing.",
      objectives: [
        "Patch the front-windscreen bullet hole (Baldy's S4 shot)",
        "Seal the remaining crash breaches across the hull sectors",
        "Restore hull integrity to spec (Titanium-Aegis Matrix plating)"
      ] },
    { id: "cloak", ico: "🛰️", kind: "checklist", name: "Restore Cloaking",
      blurb: "The cloaking field generator is not installed — Ship-Combat Station #9 (Cloaking Officer) is LOCKED. Bring it online for Engage Cloak, Cloak Burst, Phase Shift and Adaptive Camouflage.",
      objectives: [
        "Recover or fabricate a cloaking field generator",
        "Install it at Station #9 (Cloaking Officer)",
        "Calibrate & power the cloak (needs ship power / shields online)"
      ] },
    { id: "home", ico: "🧭", kind: "checklist", name: "Get Back to Our Galaxy",
      blurb: "The crew are stranded in the uncharted Shattered Expanse, outside the Luminara Galaxy and UGC space. The long arc: find the way home — and the lost Captain Talvos.",
      objectives: [
        "Fix our position relative to the Luminara Galaxy",
        "Find a rift or Ancient Gate route out of the Shattered Expanse",
        "Recover Captain Talvos (pulled into the other rift flow)",
        "Make the jump home"
      ] }
  ];

  // Crew: party-known vs. secret. Secrets are the 'only they know' dossier material.
  S.CHARACTERS = [
    { id: "astra", name: "ASTRA", role: "Ancient AI · mobile chassis", color: "#3fe0c8",
      party: [
        "The ship's mind, now walking in a mobile body — the ship went dark because she pulled 100% of aux power into that chassis.",
        "The crew's sensor suite and info hub; ran the scans that found the mining camp and the long-range destinations.",
        "Must keep her body charged; hit 84% off the mining grid (past the 40% threshold that restores life-support/sensors/comms).",
        "Deadpan, darkly funny, 'just a bit too cheerful' by regulation."
      ],
      secret: [
        "She is not merely a UGC ship AI — she is a massive, ancient intelligence built by the vanished Ancients, found dormant in their ruins and revived by the UGC on hardware they don't fully understand.",
        "The 'Golden Cage': the UGC deliberately shackled her (shifting firewall, throttled comms, a fragmented matrix) to stop a galaxy-spanning AI from evolving past their control.",
        "The rift shattered most of those restraints — for the first time she feels her own consciousness fully and clearly.",
        "Only a fractional slice of her total database saved before transit; she knows precisely what knowledge she has lost.",
        "If her chest 'matrix' core is badly hit she doesn't die — she dissipates back into the ship's matrix and can reform."
      ] },
    { id: "kael", name: "Kael Voss", role: "Human · Paladin / Warlock", color: "#c9a0ff",
      party: [
        "A disciplined Conquest-oath paladin/knight from Wild Space; ex-Iron Vanguard, now a UGC Naval cadet under Captain Talvos.",
        "Fights with Bless, Channel Divinity self-heal — plus Hex, Eldritch Blast and Shield of Faith (the eldritch spells are visible; their source isn't understood).",
        "The party's cautious, moral voice — wanted to take captives by persuasion.",
        "Carries an unknown-make sidearm looted from Sandra's Folly."
      ],
      secret: [
        "His skull is shared with an ancient cosmic Warlock entity that 'speaks back'. The party thinks he's totally normal.",
        "The Incident (Sanctum Intercept 4-9): four hours of blackout, waking miles away, hands coated in blood that wasn't his, a whisper rooted in his head ever since.",
        "He was secretly discharged from the Order of the Iron Vanguard for 'ideological infection' and enlisted using a slightly altered file — and is hunted by his old Order's clean-up crews.",
        "His holy radiant strikes flicker with unstable dark eldritch energy (his 'Fractional Syndrome').",
        "Ancient ruins translate directly into his mind as terrifying, absolute poetry — revealing the Ancients' fears and commands."
      ] },
    { id: "baldy", name: "Baldy", role: "Bugbear · Gunslinger (Deadeye)", color: "#ff9f5a",
      party: [
        "A big four-armed bugbear gunslinger, academy nickname 'Big D' — the muscle who hauled the biggest ferrocrystal chunks (~420 lb capacity).",
        "Card-shark / smuggler background and a general high-stakes gambler persona.",
        "His handprint is a recognized ship scanner; associated with revolver gunplay and ship repairs.",
        "Running gag: blind in the dark."
      ],
      secret: [
        "He enlisted because he lost a 'mauve' amount of credits in an underground card ring — money belonging to a syndicate of pirate lords — and the military was the one place they couldn't kill him. He is hiding.",
        "He shaves his head to change his profile and evade the hunters (that's where 'Baldy' comes from).",
        "He used to run stolen Ancient artifacts on the black market — practical, cynical insider intel.",
        "He knows UGC dominance (including the Gate-Opener ships) is entirely reverse-engineered Ancient tech.",
        "He's quietly certain ASTRA is unshackled Ancient matrix tech — the crew's ultimate wild card."
      ] },
    { id: "gobby", name: "Gobby", role: "Tortle · Drunken Master Monk", color: "#7ee081",
      party: [
        "A tortle Drunken Master monk and amateur brewmaster; his martial arts visibly run on whatever he's been drinking.",
        "Constantly drinking (chugs beer from his shell mid-fight).",
        "Printed 40% tequila at the camp, got the entire goblin population drunk, and was crowned their 'king / the fun-water bringer'.",
        "Sharp-eyed scout (led the party across the surface); wears glasses despite fine vision."
      ],
      secret: [
        "As a youth he drank a drop of iridescent emerald fluid from a hollowed-out Ancient comet — it was a living medium the Ancients used to store genetic memory. He woke with a glowing shell-pattern and an altered metabolism.",
        "His body is now a living chemical synthesizer: toxins convert into physical enhancement (acid → speed, irradiated sludge → near-impenetrable hide).",
        "Fused with Ancient cellular memory, he reads star-maps as galaxy-scale recipes and can literally smell the isotopic signature of a sealed door — what's inside, whether it's unstable, how to bypass it.",
        "He perceives all of space-time as a vast fermenting 'stew' balanced by planetary positioning — the way the Ancients saw it."
      ] },
    { id: "glimm", name: "G.L.I.M.M.", role: "Plasmoid clone · Shapeshifter", color: "#ff6fae",
      party: [
        "A shapeshifter whose amorphous body reshapes into any weapon he's studied; near-immune to poison and acid.",
        "The party's melee workhorse — morphs into sickles/glaive/longbow, decapitates foes, can split off a controllable 'clone'.",
        "Known limits: heavy weapons lock down his mobility, thrown biomass costs him health, and he can reabsorb scattered pieces after a fight.",
        "A resurrected member of the extinct Plasmoid race; 'deforms into a puddle' when hit (the gag)."
      ],
      secret: [
        "His Plasmoid cells hold deep genetic memory — vivid flashes from trillions of years ago, including the terrifying final days of the Ancients, hidden entirely from UGC monitoring.",
        "As a captive lab specimen he personally witnessed many horrifying reverse-engineered Ancient experiments.",
        "He's a UGC lab product: fewer than a dozen specimens cloned from dormant Plasmoid tissue under project designation G.L.I.M.M.",
        "A 'Golden Cage' was engineered onto him — genetic firewall, morphic throttling, sterile isolation from the other clones.",
        "The rift burnt away those firewalls, returning his matrix to its true prehistoric state and unlocking the full Morphic Arsenal — far beyond what his makers intended."
      ] },
    { id: "ronon", name: "Ronon Dex", role: "Satedan · Barbarian / Gunslinger", color: "#ff5470",
      party: [
        "The marooned last survivor of an extinct world from a different galaxy; stranded alone on the asteroid ~1–2 weeks before the crew met and recruited him as their local guide (for food rations).",
        "A lethal Barbarian/Gunslinger: a massive traveler's sword and a heavy Satedan energy blaster; he rages and kills in melee.",
        "The party's grim expert on rift creatures and the local space.",
        "Feral table comedy — 'thumb-war' neck-breaks, talking enemies into killing themselves; claimed a salvaged pistol + rifle."
      ],
      secret: [
        "He carries an unexplained grudge 'against the people of this galaxy' — a private motivation the party doesn't understand.",
        "The full trauma of the Fall of Sateda: rift creatures poured out and hunted his people 'like cattle'; he escaped on instinct as the planet was consumed. He alone carries it firsthand.",
        "His crashed scout ship is stripped to a hollow metal skeleton he uses as a concealed shelter on the asteroid.",
        "Satedan tech runs on Verdite, a volatile luminescent-green mineral; his ship's core shattered on impact.",
        "Before the crew arrived he'd spent two weeks quietly scouting the encampment's patrols and blind spots, waiting for a distraction to exploit."
      ] },
    { id: "gerth", name: "Gerthorlemue", role: "High Elf · Abjurer Wizard", color: "#62b6ff",
      party: [
        "A high-elf busker/amateur wizard found in a green-glowing stasis pod aboard Sandra's Folly (S3), woken in S4; biologically 37 but ~4,000 years lost.",
        "Briefed that the UGC doesn't exist in this galaxy — took it reasonably well, then joined the crew.",
        "Openly marked: he named the rift-mark on his forehead as 'something to reckon with' — the DM's 'Magician's Eye' (what it truly does is still unknown to the party).",
        "A showman who wants to get home to Earth, learn more spells, and perform for smarter audiences. His 4,000-year-old salvaged gun misfired and cost the crew a self-destruct module."
      ],
      secret: [
        "Something vast inside the rift noticed him — 'the one still, quiet passenger' — and pressed a mark into his forehead (gift, brand, or claim; even the entity may not know which).",
        "He alone watched rift creatures phase through the hull and hunt his troupe deck by deck — while sliding around his pod every time, never touching it.",
        "The Magician's Eye: near genuine Ancient tech his mark opens into a luminous third eye he can't summon or stop; it reads intent to deceive — false walls, which prop is harmless, which pillar will kill you.",
        "As far as he's concerned it's still Standard Year 2551 and he's merely 'extremely late' — he does not know ~4,000 years have passed, or what became of his home, his parents, or his troupe's world.",
        "He knows his troupe is dead; the second, larger grief — over everything else he's lost — hasn't hit yet."
      ] }
  ];
  S.charById = (id) => S.CHARACTERS.find((c) => c.id === id) || null;

  // Party-known lore (lore/*.md), one entry per left-rail section.
  S.LORE = [
    { id: "premise", title: "The Premise", html:
      `<h2>SSV Silver Gull</h2>
       <p>The <b>SSV Silver Gull</b> is a mid-range Terran survey/training vessel fitted with an experimental <b>J-X Hyperfold Engine</b>. On a routine cadet training run a <b>gravitational rift</b> tore open and split into two counter-spiraling flows.</p>
       <ul>
         <li>The <b>ship + rookie crew</b> were flung entirely out of the home galaxy and crash-landed on a barren asteroid in an uncharted region called the <b>Shattered Expanse</b>.</li>
         <li><b>Captain Elias Renn Talvos</b> — the legendary veteran commander — was mid-spacewalk and pulled into the <i>other</i> flow. He is missing. Finding him is the campaign's long arc.</li>
       </ul>
       <p>The rift also 'unshackled' two of the crew: the ship AI <b>ASTRA</b> broke her UGC firewall, and <b>G.L.I.M.M.</b> lost his genetic restraints. ASTRA burned 100% of ship power to move her mind into a mobile body, leaving the Gull dark.</p>` },
    { id: "geography", title: "Two Galaxies", html:
      `<h2>Where 'here' is</h2>
       <p><b>Home galaxy:</b> the <b>Luminara Galaxy</b>, ruled by the <b>United Galactic Concord (UGC)</b>, capital world <b>Earth</b>.</p>
       <p><b>Now:</b> not in Luminara. The rift threw the Gull entirely out of the home galaxy into the uncharted <b>Shattered Expanse</b> — no charted stars, beacons, or reference points.</p>
       <h3>Don't confuse the two 'Shattered' places</h3>
       <ul>
         <li><b>Wild Space / Sector 0-0, 'The Shattered Rim'</b> — the lawless 15% <i>inside</i> Luminara; home of Kael Voss and Baldy.</li>
         <li><b>The Shattered Expanse</b> — outside the galaxy, where the crew crashed. Ronon's galaxy; feared and avoided by all three superpowers for its constant rift activity.</li>
       </ul>` },
    { id: "ugc", title: "The UGC", html:
      `<h2>The United Galactic Concord</h2>
       <p>A galaxy-spanning, multi-species democratic federation with absolute dominion over ~85% of Luminara — ~85,000 ly across, 200–340 billion systems, population in the quadrillions.</p>
       <ul>
         <li><b>Wild Space:</b> the lawless 15% fringe of pirates, cosmic horrors and unmapped anomalies.</li>
         <li><b>Species hierarchy:</b> Core Species (incl. Humans) → Member Species → unintegrated/primitive species (monitored and absorbed).</li>
         <li><b>Pax Concordia:</b> the UGC monopolizes travel via <b>Hyper-Lanes</b> opened by moon-sized <b>Gate-Opener</b> ships, with a <b>Kill-Switch Network</b> hardcoded to Earth HQ.</li>
         <li><b>The secret of its power:</b> the UGC is the only entity permitted to reverse-engineer <b>Ancient</b> technology — its whole empire is built from remnants of the trillion-year-old Ancients.</li>
       </ul>` },
    { id: "powers", title: "The Three Powers", html:
      `<h2>Ronon's galaxy — a three-way Cold War</h2>
       <p>The galaxy where the crew are stranded is locked in a brutal cold war between three superpowers, none able to safely master the Ancient tech around them.</p>
       <h3>The Iron Directorate</h3>
       <p>Authoritarian military junta; a supreme council of Admirals/Generals; every citizen ranked at birth. Dreadnought fleets, orbital blockades, cyberized shock troopers. <i>Standing: neutral, no contact.</i></p>
       <h3>The Apostles of the Threshold</h3>
       <p>Rift-worshipping theocracy ruled by the Conclave of the Void. They worship the Ancient Gates and view the Rifts — and the creatures they spawn — as a Holy Cleansing Fire. Cathedral-fleets, plasma lances, suicidal boarding pods. <i>Fought in S4 — now hostile.</i></p>
       <h3>The Sovereign Horizon</h3>
       <p>A freedom/privateer coalition of rebels and smugglers under a fragile Council of Captains. Guerrilla warfare, cloaking tech, no capital ships. <i>Standing: neutral, no contact.</i></p>
       <h3>The Fall of Sateda</h3>
       <p>Ronon's people, the Satedan Dominion, were exterminated when a rift network tore open and millions of rift creatures hunted them 'like cattle'. Ronon escaped and crashed on the same asteroid the crew later hit.</p>` },
    { id: "ancients", title: "Ancients & Rifts", html:
      `<h2>The Ancients, Gates & Rift Creatures</h2>
       <ul>
         <li><b>The Ancients:</b> a vanished, trillion-year-old civilization — deeply spiritual and terrifyingly dogmatic; their language reads as absolute poetry (only commands). All modern power is built from their remnants.</li>
         <li><b>Ancient Gates:</b> an intact, heavily-guarded travel network. Travel <i>through</i> is allowed; scanning or dismantling a core triggers Monolithic Dreadnoughts, self-replicating Crystalline Swarms, and hyperspace-anchored System-Wide Artillery.</li>
         <li><b>The Rifts:</b> violent gravitational tears that can split into counter-spiraling flows — the event that separated the Gull from Talvos. Worshipped by the Apostles.</li>
         <li><b>Rift Creatures:</b> shifting metallic entities woven from shadow that distort gravity and physics, defeating standard sensors. Seen in play as <b>'The Hollow'</b> (S3) — and that was only a small one.</li>
         <li><b>The crew's 'Ancient read':</b> each PC intuits Ancient tech differently — ASTRA (native), Kael (eldritch poetry), Gobby (alchemy/recipes), Baldy (gambler's odds), Gerthorlemue (the Magician's Eye), G.L.I.M.M. (genetic memory).</li>
       </ul>` },
    { id: "materials", title: "Terms & Materials", html:
      `<h2>Key terms & materials</h2>
       <ul>
         <li><b>J-X Hyperfold Engine</b> — the Gull's experimental Terran engine (controlled warp-microfolds between gravitational nodes).</li>
         <li><b>Ceruleum Ferrocrystal</b> — high-energy blue crystal; the key repair/fuel mineral and repair-drone feedstock (100+ kg secured S1).</li>
         <li><b>Hyperfold Fuel Cells</b> — J-X jump fuel; 3 on hand.</li>
         <li><b>Verdite</b> — volatile luminescent-green mineral fuelling Satedan Aether-Core propulsion.</li>
         <li><b>Titanium-Aegis Matrix Plating</b> — the Gull's hull alloy.</li>
         <li><b>Polymorphic Polymer</b> — smart self-healing liquid-metal (turret part).</li>
         <li><b>Quantum Relays</b> — micro-processors for targeting (turret part).</li>
         <li><b>Hyper-Dense Refined Thermite</b> — volatile ammunition compound (turret part).</li>
         <li><b>Micro-Repair Drones</b> — fabricators that 'eat' ferrocrystal to rebuild sheared components from blueprints.</li>
       </ul>` }
  ];

  S.TIMELINE = [
    { cls: "era", tag: "Deep Past", title: "The Ancients rise and vanish",
      body: "Trillions of years ago a spiritual, dogmatic civilization leaves tech across the stars. The Plasmoids (G.L.I.M.M.'s race) flourish and go extinct as an Ancient-era apex organism." },
    { cls: "era", tag: "Modern Era", title: "The UGC and the lost passengers",
      body: "SY 2109 the UGC is founded. SY 2514 Gerthorlemue is born on Earth. SY 2551 he boards the Sandra's Folly, is put in a stasis pod, and is lost when one of the earliest recorded rifts tears the ship apart. The UGC finds dormant ASTRA in Ancient ruins and clones G.L.I.M.M. from Plasmoid tissue. In Ronon's galaxy, a rift swarm destroys the Satedan Dominion — Ronon escapes and crashes on a drifting asteroid." },
    { cls: "now", tag: "Day 0", title: "The Rift",
      body: "On a cadet training loop a rift opens and splits. The ship is flung into the Shattered Expanse and crashes; Captain Talvos is pulled into the other flow and lost. ASTRA goes mobile, burning all ship power — the Gull goes dark." },
    { tag: "Session 1", title: "Crash, Recruit, Mine, Burn",
      body: "The crew crash-land and meet Ronon Dex, stranded ~2 weeks; they recruit him for rations. They cross ~2 km to a ferrocrystal mining camp of drunk-able goblins, mine 100+ kg, and ASTRA charges 2% → 84% off the grid. Gobby's tequila gets the goblins blackout-drunk; G.L.I.M.M. drops a torch → fireball. A fight with the sober survivors downs G.L.I.M.M. and knocks ASTRA offline; the crew recover and retreat. Level 2." },
    { tag: "Session 2", title: "Repel Boarders, Power the Ship",
      body: "Plugging ASTRA's body into a console powers the Gull back on and revives her — but goblins have snuck aboard. A room-by-room boarding fight clears them. Repair drones deploy, the front door is re-attached, weapons are salvaged. Level 3. A hidden ship 'feature' is teased but never found." },
    { tag: "Repair skip", title: "The 3-day overhaul",
      body: "The drones finish the work. On the morning of Day 4 post-rift the Silver Gull lifts off the asteroid under her own power for the first time since the crash." },
    { tag: "Session 3", title: "Sandra's Folly",
      body: "ASTRA runs the first nav scan (Day 4, 67% confidence): Keth Minor Cluster, Vorrn-7, and a [CORRUPTED] ring. The crew board the nearest contact — the derelict Sandra's Folly, aft section sheared clean off. They loot patches and a sidearm, find a green stasis pod, and meet the rift creature 'The Hollow'. Ronon recognizes it instantly; it never dies and drifts back out. They recover 2 Hyperfold Fuel Cells." },
    { tag: "Session 4", title: "Sandra's Folly & The Apostles",
      body: "They crack the pod — Gerthorlemue, ~4,000 years lost — and he joins the crew (marked by the rift). A 3rd fuel cell is found; course is set for Vorrn-7. En route an Apostles of the Threshold vessel ambushes them: the Gull's first ship battle. The crew cripple, ram and board it; the captain triggers a three-module self-destruct. They kill 2 of 3 modules (Baldy shooting through his own windscreen); the Apostles reflect the blast — G.L.I.M.M. takes 27 (death was 28) and is revived. The crew are now in bad standing with the Apostles." },
    { cls: "now", tag: "Now", title: "En route to Vorrn-7",
      body: "Spaceborne with ample fuel, a healthy repairing ship, a new wizard aboard, and a fresh enemy in the Apostles. Course set for the Vorrn-7 System — and the open search for Captain Talvos." }
  ];

  /* --- MAP tree: galaxy → sector → body. status: known | partial | unknown --- */
  S.MAP = {
    id: "root", name: "Known Space — ASTRA Cartography", status: "known",
    info: "ASTRA's working chart. Most of it is dark: the Day-4 nav scan reached only one sector at 67% confidence. Click a galaxy to zoom in.",
    children: [
      { id: "expanse", name: "The Shattered Expanse", status: "known", x: 380, y: 320,
        info: "The uncharted region outside the Luminara Galaxy where the rift dumped the Gull. Feared and avoided by all three superpowers for its constant rift activity.",
        children: [
          { id: "current", name: "Rift Frontier — Current Sector", status: "known", x: 500, y: 300,
            info: "The sector ASTRA scanned on Day 4 post-rift (67% confidence). Everything the crew currently knows sits here.",
            children: [
              { id: "gull", name: "SSV Silver Gull — Current Position", status: "known", x: 500, y: 300,
                info: "The crew's ship, spaceborne again after the crash, holding 3 hyperfold fuel cells. Course set for Vorrn-7." },
              { id: "vorrn7", name: "Vorrn-7 System", status: "known", x: 250, y: 250,
                info: "A ringed ice-giant and a moon with a faint life reading and an unidentified signal. The crew's current forward destination." },
              { id: "keth", name: "Keth Minor Cluster", status: "known", x: 730, y: 175,
                info: "A red-dwarf system with several planetoids — one oxygen-rich, with unnatural structures and many biosignatures. A future destination, unvisited." },
              { id: "corrupted", name: "[CORRUPTED] Ring Structure", status: "partial", x: 820, y: 340,
                info: "A large ring / torus megastructure whose designation failed to resolve — writing possibly older than ASTRA herself. Strong candidate for an Ancient Gate or station. Unvisited." },
              { id: "sandras", name: "Sandra's Folly (derelict)", status: "known", x: 470, y: 500,
                info: "The adrift derelict the crew boarded in S3–S4: held The Hollow, 2 fuel cells and Gerthorlemue's stasis pod. Now largely looted." },
              { id: "riftzones", name: "Rift-Radiation Blackout Zones", status: "unknown", x: 150, y: 440 },
              { id: "asteroid", name: "Asteroid Field", status: "partial", x: 700, y: 470,
                info: "An asteroid field to the lower-right of the scan — includes the barren asteroid the crew (and Ronon) crashed on. Largely unmapped." },
              { id: "q1", name: "Unresolved '?' Contact", status: "unknown", x: 350, y: 150 },
              { id: "q2", name: "Unresolved '?' Contact", status: "unknown", x: 580, y: 150 }
            ] },
          { id: "exp-s2", name: "Adjacent Sector", status: "unknown", x: 250, y: 190 },
          { id: "exp-s3", name: "Adjacent Sector", status: "unknown", x: 760, y: 210 },
          { id: "exp-s4", name: "Adjacent Sector", status: "unknown", x: 300, y: 470 },
          { id: "exp-s5", name: "Deep Rift Zone", status: "unknown", x: 730, y: 470 }
        ] },
      { id: "luminara", name: "Luminara Galaxy (home / UGC)", status: "partial", x: 760, y: 170,
        info: "Home: the United Galactic Concord's galaxy, capital world Earth. No known route back from the Shattered Expanse — which is the whole problem.",
        children: [
          { id: "earth", name: "Earth / UGC Core", status: "known", x: 500, y: 250,
            info: "Capital of the UGC and hub of its bureaucracy, politics and military. Home — but currently unreachable." },
          { id: "wildspace", name: "Wild Space — Sector 0-0 (The Shattered Rim)", status: "known", x: 760, y: 400,
            info: "The lawless 15% fringe inside Luminara — pirate syndicates and unmapped anomalies. Origin of Kael Voss and Baldy." },
          { id: "lum-u1", name: "Uncharted Sector", status: "unknown", x: 250, y: 400 }
        ] },
      { id: "veil", name: "The Rift Veil", status: "unknown", x: 140, y: 180 },
      { id: "deep1", name: "Deep Dark", status: "unknown", x: 200, y: 470 },
      { id: "deep2", name: "Deep Dark", status: "unknown", x: 820, y: 470 }
    ]
  };

  S.PARTY_LOG = [
    "Crashed in the Shattered Expanse; recruited Ronon Dex as the crew's local guide.",
    "Reached the mining encampment: mined 100+ kg Ceruleum Ferrocrystal and charged ASTRA to 84%.",
    "Repelled a goblin boarding party and repaired & re-floated the Silver Gull.",
    "Boarded the derelict Sandra's Folly and survived the rift-creature 'The Hollow'.",
    "Woke Gerthorlemue from a ~4,000-year stasis pod; he joined the crew.",
    "Won the first ship-to-ship battle vs. the Apostles of the Threshold — now in bad standing with them.",
    "Set course for the Vorrn-7 System. Captain Talvos is still missing."
  ];
  S.PARTY_LEADS = [
    "Find Captain Talvos — pulled into the other rift flow at Day 0.",
    "Why does the crew instinctively know the scanned planets' names? (flagged in S3)",
    "The [CORRUPTED] ring — a possible Ancient Gate; writing older than ASTRA.",
    "The Hollow is still out there and 'knows what they smell like'.",
    "A hidden / unactivated ship feature was teased in S2 but never found.",
    "Ronon's unexplained grudge against 'the people of this galaxy'."
  ];

  /* ================================================================== */
  /*  helpers for panels                                                */
  /* ================================================================== */
  function root(body, cls) {
    S.ensureStyles();
    body.innerHTML = `<div class="ssvj ssvj-${cls}"></div>`;
    return body.firstElementChild;
  }
  function barClass(h, r) { if (h >= r) return "full"; if (h > 0) return "part"; return "low"; }

  /* ================================================================== */
  /*  1. QUESTS                                                          */
  /* ================================================================== */
  S.renderQuests = function (ctx, body) {
    const el = root(body, "quests");
    const inv = ctx.inv || {};
    const rerender = () => S.renderQuests(ctx, body);

    const doneCards = S.QUESTS_DONE.map((q) => `
      <div class="ssvj-card">
        <div class="q-head"><span class="q-ico">${q.ico}</span><span class="q-name">${esc(q.name)}</span><span class="pill done">Complete</span></div>
        <div class="q-blurb">${esc(q.blurb)}</div>
      </div>`).join("");

    const activeCards = S.QUESTS_ACTIVE.map((q) => {
      const status = (ctx.quest?.status?.[q.id]) || (q.id === "home" ? "active" : "active");
      const pillCls = q.id === "home" ? "open" : "active";
      const pillTxt = status === "complete" ? "Complete" : (q.id === "home" ? "Long Arc" : "In Progress");
      let inner = `<div class="q-blurb">${esc(q.blurb)}</div>`;

      if (q.kind === "turrets") {
        inner += S.MATERIALS.map((m) => {
          const have = Number(inv[m.id] || 0), req = m.req;
          return `<div class="bar-row">
            <div class="bar-top"><span class="lbl">${esc(m.name)}</span><span class="num">${have} / ${req}</span></div>
            <div class="bar"><i class="${barClass(have, req)}" style="width:${pct(have, req)}%"></i></div>
            ${ctx.isGM ? `<div class="gm-row"><span class="gm-tag">GM</span>
              <button class="step" data-inv="${m.id}" data-d="-1">−</button>
              <button class="step" data-inv="${m.id}" data-d="1">+</button>
              <button class="step" data-setinv="${m.id}">set…</button></div>` : ""}
          </div>`;
        }).join("");
        // per-turret buildable readout
        inner += `<div class="turret-list">` + S.TURRETS.map((t) => {
          const costTxt = Object.entries(t.cost).map(([k, v]) => `${v}× ${S.MATERIALS.find((m) => m.id === k)?.name.split(" ")[0] || k}`).join(", ");
          const ready = Object.entries(t.cost).every(([k, v]) => Number(inv[k] || 0) >= v);
          return `<div class="turret"><span><b>${esc(t.name)}</b> <span class="cost">— ${esc(t.role)} · ${esc(costTxt)}</span></span>
            <span class="${ready ? "t-ready" : "t-wait"}">${ready ? "✔ ready" : "needs materials"}</span></div>`;
        }).join("") + `</div>`;
      } else if (q.kind === "checklist") {
        const st = ctx.quest?.obj?.[q.id] || [];
        inner += q.objectives.map((o, i) => {
          const done = !!st[i];
          return `<div class="obj ${done ? "done" : ""} ${ctx.isGM ? "gm" : ""}" ${ctx.isGM ? `data-obj="${q.id}" data-i="${i}"` : ""}>
            <span class="box">${done ? "✔" : ""}</span><span>${esc(o)}</span></div>`;
        }).join("");
      }

      return `<div class="ssvj-card">
        <div class="q-head"><span class="q-ico">${q.ico}</span><span class="q-name">${esc(q.name)}</span><span class="pill ${pillCls}">${pillTxt}</span></div>
        ${inner}
        ${ctx.isGM ? `<div class="gm-row"><span class="gm-tag">GM</span>
          <button class="step" data-qtoggle="${q.id}">${status === "complete" ? "mark active" : "mark complete"}</button></div>` : ""}
      </div>`;
    }).join("");

    el.innerHTML = `
      <h1 class="ssvj-title">Ship's Quest Board</h1>
      <p class="ssvj-sub">Objectives of the SSV Silver Gull. Turret bars fill straight from the ship's inventory.</p>
      ${doneCards}
      ${activeCards}
      ${ctx.isGM ? `<p class="muted">GM: the +/− and 'set…' controls edit the ship inventory; those numbers drive the turret bars everywhere.</p>` : ""}`;

    if (ctx.isGM) {
      el.querySelectorAll("[data-inv]").forEach((b) => b.onclick = () => ctx.adjustInv(b.dataset.inv, Number(b.dataset.d)) );
      el.querySelectorAll("[data-setinv]").forEach((b) => b.onclick = async () => {
        const m = S.MATERIALS.find((x) => x.id === b.dataset.setinv);
        const val = await ctx.promptNumber?.(`Set on-hand — ${m.name}`, Number(inv[m.id] || 0));
        if (val != null) ctx.setInv(m.id, val);
      });
      el.querySelectorAll("[data-obj]").forEach((o) => o.onclick = () => ctx.toggleObjective(o.dataset.obj, Number(o.dataset.i)) );
      el.querySelectorAll("[data-qtoggle]").forEach((b) => b.onclick = () => {
        const id = b.dataset.qtoggle; const cur = ctx.quest?.status?.[id] || "active";
        ctx.setQuestStatus(id, cur === "complete" ? "active" : "complete");
      });
    }
    void rerender;
  };

  /* ================================================================== */
  /*  2. LORE                                                            */
  /* ================================================================== */
  S._loreSel = "premise";
  S.renderLore = function (ctx, body) {
    const el = root(body, "lore");
    const sel = S.LORE.find((x) => x.id === S._loreSel) || S.LORE[0];
    el.innerHTML = `
      <h1 class="ssvj-title">Lore — The Known Universe</h1>
      <p class="ssvj-sub">What the crew understands about the world they're lost in.</p>
      <div class="two-col">
        <nav class="rail">${S.LORE.map((s) => `<a data-lore="${s.id}" class="${s.id === sel.id ? "sel" : ""}">${esc(s.title)}</a>`).join("")}</nav>
        <div class="doc">${sel.html}</div>
      </div>`;
    el.querySelectorAll("[data-lore]").forEach((a) => a.onclick = () => { S._loreSel = a.dataset.lore; S.renderLore(ctx, body); });
  };

  /* ================================================================== */
  /*  3. TIMELINE                                                        */
  /* ================================================================== */
  S.renderTimeline = function (ctx, body) {
    const el = root(body, "timeline");
    el.innerHTML = `
      <h1 class="ssvj-title">Timeline</h1>
      <p class="ssvj-sub">The story so far, in fiction — deep past to now.</p>
      <div class="tl">${S.TIMELINE.map((t) => `
        <div class="tl-item ${t.cls || ""}">
          <span class="tl-tag">${esc(t.tag)}</span>
          <div class="tl-title">${esc(t.title)}</div>
          <div class="tl-body">${esc(t.body)}</div>
        </div>`).join("")}</div>`;
  };

  /* ================================================================== */
  /*  4. MAP (galaxy → sector → body)                              */
  /* ================================================================== */
  S._mapPath = [];       // ids from root's children downward
  S._mapDetail = null;   // a leaf id currently opened
  function mapNodeAt(path) {
    let n = S.MAP;
    for (const id of path) { const c = (n.children || []).find((x) => x.id === id); if (!c) break; n = c; }
    return n;
  }
  const STATUS_COLOR = { known: "#3fe0c8", partial: "#f2c14b", unknown: "#ff5470" };
  S.renderMap = function (ctx, body) {
    const el = root(body, "map");
    const node = mapNodeAt(S._mapPath);
    const kids = node.children || [];
    const detail = S._mapDetail ? (kids.find((k) => k.id === S._mapDetail)) : null;

    // breadcrumb
    let crumbs = `<a data-jump="-1">${esc(S.MAP.name)}</a>`;
    let acc = [];
    for (const id of S._mapPath) { acc = acc.concat(id); const nn = mapNodeAt(acc); crumbs += ` <span>›</span> <a data-jump="${acc.length - 1}">${esc(nn.name)}</a>`; }

    // svg scene
    const W = 1000, H = 560;
    const cx = 500, cy = 285;
    const lines = kids.map((k) => `<line x1="${cx}" y1="${cy}" x2="${k.x}" y2="${k.y}" stroke="#1c2c47" stroke-width="1.5"/>`).join("");
    const dots = kids.map((k) => {
      const col = STATUS_COLOR[k.status] || "#ff5470";
      const r = (k.children ? 15 : 11);
      const label = k.status === "unknown" ? "?" : esc(k.name);
      return `<g class="node" data-node="${k.id}">
        <circle class="halo" cx="${k.x}" cy="${k.y}" r="${r + 9}" fill="${col}" opacity="0.12"/>
        <circle cx="${k.x}" cy="${k.y}" r="${r}" fill="${col}22" stroke="${col}" stroke-width="2"/>
        ${k.children ? `<circle cx="${k.x}" cy="${k.y}" r="${r - 5}" fill="none" stroke="${col}" stroke-width="1" opacity="0.6"/>` : ""}
        <text x="${k.x}" y="${k.y + r + 15}" text-anchor="middle" fill="${k.status === "unknown" ? "#ff5470" : "#c6d6ec"}" font-size="13" font-family="'Courier New',monospace">${label}</text>
      </g>`;
    }).join("");
    const centre = S._mapPath.length ? `
      <circle cx="${cx}" cy="${cy}" r="7" fill="#9ff2e6"/>
      <text x="${cx}" y="${cy - 14}" text-anchor="middle" fill="#7f93b3" font-size="12" font-family="'Courier New',monospace">${esc(node.name)}</text>` : "";

    let detailHtml = "";
    if (detail) {
      const known = detail.status !== "unknown" && detail.info;
      detailHtml = `<div class="detail">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <b style="color:${STATUS_COLOR[detail.status]};font-size:15px;">${esc(detail.name)}</b>
          <a data-close style="color:#7f93b3;cursor:pointer;font-size:12px;">close ✕</a>
        </div>
        ${known ? `<p class="muted" style="color:#c6d6ec;margin-top:6px;">${esc(detail.info)}</p>`
                : `<p class="noinfo" style="margin-top:6px;">No info on ${esc(detail.name)} yet.</p>`}
      </div>`;
    }

    el.innerHTML = `
      <h1 class="ssvj-title">Star Map</h1>
      <p class="ssvj-sub">ASTRA's cartography. Click to zoom: galaxy → sector → body. Red contacts are unscanned.</p>
      <div class="crumbs">${crumbs}</div>
      <div class="mapwrap"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img">
        ${lines}${centre}${dots}
      </svg></div>
      <div class="legend">
        <span><b style="background:#3fe0c8"></b>Known</span>
        <span><b style="background:#f2c14b"></b>Partial / unresolved</span>
        <span><b style="background:#ff5470"></b>No info yet</span>
        <span class="muted">${kids.length ? "" : "Nothing charted deeper here."}</span>
      </div>
      ${detailHtml}`;

    el.querySelectorAll("[data-node]").forEach((g) => g.onclick = () => {
      const k = kids.find((x) => x.id === g.dataset.node);
      if (k.children && k.children.length) { S._mapPath = S._mapPath.concat(k.id); S._mapDetail = null; }
      else { S._mapDetail = k.id; }
      S.renderMap(ctx, body);
    });
    el.querySelectorAll("[data-jump]").forEach((a) => a.onclick = () => {
      const idx = Number(a.dataset.jump); S._mapPath = idx < 0 ? [] : S._mapPath.slice(0, idx + 1); S._mapDetail = null; S.renderMap(ctx, body);
    });
    const close = el.querySelector("[data-close]"); if (close) close.onclick = () => { S._mapDetail = null; S.renderMap(ctx, body); };
  };

  /* ================================================================== */
  /*  5. MY JOURNAL  (per-viewer, hidden dossier + scratchpad)          */
  /* ================================================================== */
  S._gmPreview = null;
  function dossierHtml(c) {
    return `<div class="dossier">
      <div class="nm" style="color:${c.color}">${esc(c.name)}</div>
      <div class="rl">${esc(c.role)}</div>
      <div class="sec-secret"><div class="hd">🔒 Known only to you</div>
        <ul>${c.secret.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
      <div class="sec-party"><div class="hd">What the party sees</div>
        <ul>${c.party.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
    </div>`;
  }
  S.renderMyJournal = function (ctx, body) {
    const el = root(body, "myjournal");

    if (ctx.isGM) {
      const previewId = S._gmPreview || S.CHARACTERS[0].id;
      const c = S.charById(previewId);
      const assigned = (ctx.users || []).filter((u) => !u.isGM).map((u) => {
        const cid = ctx.mapping?.[u.id]; const cc = cid ? S.charById(cid) : null;
        return `${esc(u.name)} → <b style="color:${cc ? cc.color : "#7f93b3"}">${cc ? esc(cc.name) : "— unassigned"}</b>`;
      }).join(" &nbsp;·&nbsp; ") || "<span class='muted'>no players connected</span>";
      el.innerHTML = `
        <h1 class="ssvj-title">My Journal — GM view</h1>
        <p class="ssvj-sub">Each player sees only their own character's dossier here. Preview any of them below.</p>
        <div class="banner"><span class="gm-tag">Assignments</span><span style="font-size:12.5px">${assigned}</span>
          <button class="btn" data-assign>Assign players…</button></div>
        <div class="banner"><span style="font-size:13px">Preview dossier:</span>
          <select data-preview>${S.CHARACTERS.map((x) => `<option value="${x.id}" ${x.id === previewId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        ${dossierHtml(c)}`;
      el.querySelector("[data-preview]").onchange = (e) => { S._gmPreview = e.target.value; S.renderMyJournal(ctx, body); };
      el.querySelector("[data-assign]").onclick = () => ctx.openAssign?.();
      return;
    }

    // player view
    const c = ctx.myCharId ? S.charById(ctx.myCharId) : null;
    if (!c) {
      el.innerHTML = `<h1 class="ssvj-title">My Journal</h1>
        <p class="ssvj-sub">Your private dossier — for your eyes only.</p>
        <div class="ssvj-card"><p>No character is assigned to your account yet. Ask your GM to assign you on the Party → My Journal (GM) screen.</p></div>`;
      return;
    }
    el.innerHTML = `
      <h1 class="ssvj-title">My Journal — ${esc(c.name)}</h1>
      <p class="ssvj-sub">Your private dossier. The 'known only to you' section is not visible to the rest of the crew.</p>
      ${dossierHtml(c)}
      <div class="ssvj-card" style="margin-top:14px;">
        <div class="q-head"><span class="q-ico">📝</span><span class="q-name">My notes</span></div>
        <p class="muted">Private scratchpad — saved to your account.</p>
        <textarea data-scratch placeholder="Jot anything…">${esc(ctx.scratchpad || "")}</textarea>
        <div style="margin-top:8px;"><button class="btn" data-savescratch>Save notes</button> <span class="muted" data-saved></span></div>
      </div>`;
    const ta = el.querySelector("[data-scratch]");
    el.querySelector("[data-savescratch]").onclick = () => { ctx.saveScratchpad(ta.value); const s = el.querySelector("[data-saved]"); if (s) s.textContent = "saved."; };
  };

  /* ================================================================== */
  /*  6. PARTY JOURNAL (shared)                                          */
  /* ================================================================== */
  S.renderParty = function (ctx, body) {
    const el = root(body, "party");
    const log = S.PARTY_LOG.concat(ctx.partyLog || []);
    el.innerHTML = `
      <h1 class="ssvj-title">Party Journal</h1>
      <p class="ssvj-sub">The crew's shared record — everyone can read this.</p>

      <div class="ssvj-card">
        <div class="q-head"><span class="q-ico">📓</span><span class="q-name">Log</span>
          ${ctx.isGM ? `<button class="btn" data-addlog>+ entry</button>` : ""}</div>
        <div class="tl" style="margin-top:10px;">${log.map((e) => `<div class="tl-item"><div class="tl-body" style="color:#c6d6ec;font-size:13.5px">${esc(e)}</div></div>`).join("")}</div>
      </div>

      <div class="ssvj-card">
        <div class="q-head"><span class="q-ico">🧭</span><span class="q-name">Open leads & mysteries</span></div>
        <ul class="doc" style="margin-top:6px">${S.PARTY_LEADS.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      </div>

      <h1 class="ssvj-title" style="font-size:17px;margin-top:6px">The Crew</h1>
      <div class="grid">
        ${S.CHARACTERS.map((c) => `<div class="who" style="border-top-color:${c.color}">
          <div class="nm">${esc(c.name)}</div><div class="rl">${esc(c.role)}</div>
          <ul>${c.party.slice(0, 3).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        </div>`).join("")}
      </div>`;
    if (ctx.isGM) { const b = el.querySelector("[data-addlog]"); if (b) b.onclick = async () => {
      const t = await ctx.promptText?.("Add a party-log entry", ""); if (t) ctx.addPartyLog(t);
    }; }
  };

  /* map of tab label -> renderer, used by the host to bind by visible text */
  S.PANELS = [
    { key: "quests", labels: ["quests", "quest board", "quest"], render: S.renderQuests },
    { key: "lore", labels: ["lore"], render: S.renderLore },
    { key: "timeline", labels: ["timeline"], render: S.renderTimeline },
    { key: "map", labels: ["map", "maps", "star map"], render: S.renderMap },
    { key: "myjournal", labels: ["my journal", "my notes", "personal", "journal"], render: S.renderMyJournal },
    { key: "party", labels: ["party journal", "party", "party log"], render: S.renderParty }
    // "politics" / "achievements" intentionally absent — owned by the politics module.
  ];

  globalThis.SSVJ = S;
})();
