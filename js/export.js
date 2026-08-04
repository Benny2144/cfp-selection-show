/* =====================================================================
   BRACKET EXPORT — the field as a single image.

   The whole point of selection night is telling everybody about it, and a
   share link makes people sit through a show to see one picture. This
   draws the bracket straight onto a canvas at 1920x1080 so it can be
   dropped into Discord or a group chat as-is.

   Canvas rather than a screenshot library: no dependency to host, real
   control over type and spacing, and it renders identically whatever the
   viewer's window happens to be.
   ===================================================================== */
const BracketImage = (() => {

  const W = 1920, H = 1080;
  const TOP = 150, BOT = 1012;              // the band the bracket lives in
  const SPAN = BOT - TOP;

  /* Same proportions the on-screen bracket uses, so the picture and the
     page agree with each other. */
  const P = {
    rows: { topA: 18.5, topB: 29.2, mid1: 45.4, mid2: 64.5, botA: 81.0, botB: 91.7 },
    r1Y: 23.85, qfTopY: 34.6, qfBotY: 75.4, r1BotY: 86.35,
    x: { plateL: 1.6, r1L: 23, qfL: 34, sf: 45.25, qfR: 56.5, r1R: 67.5 },
    boxW: 9.5
  };

  const px = p => p / 100 * W;
  const py = p => TOP + p / 100 * SPAN;

  const INK = '#06070a', PANEL = '#11151c', LINE = '#2a313d';
  const GOLD = '#D8B45A', ORANGE = '#F56A00', DIM = '#8b93a1';

  const COND = 'Impact, Haettenschweiler, "Arial Narrow", sans-serif';
  const UI = 'Inter, "Segoe UI", system-ui, sans-serif';

  /* ------------------------------------------------------------ helpers */

  function round(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  /** Shrink type until it fits, rather than letting a long school name
      run off the edge of its plate. */
  function fit(c, text, max, size, family, weight) {
    let s = size;
    for (;;) {
      c.font = `${weight || 700} ${s}px ${family}`;
      if (c.measureText(text).width <= max || s <= 9) break;
      s -= 1;
    }
    return s;
  }

  /** A logo, already decoded, or null. Waits briefly for one that is
      still loading so the export is not a race against the network. */
  function logo(id) {
    return new Promise(res => {
      const ready = LogoStore.imageFor(id);
      if (ready && ready.complete && ready.naturalWidth) return res(ready);
      let done = false;
      const settle = v => { if (!done) { done = true; res(v); } };
      LogoStore.get(id, url => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => settle(img);
        img.onerror = () => settle(null);
        img.src = url;
      });
      setTimeout(() => settle(null), 3000);
    });
  }

  /* --------------------------------------------------------- background */

  function backdrop(c) {
    c.fillStyle = INK;
    c.fillRect(0, 0, W, H);

    const g = c.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, W * 0.72);
    g.addColorStop(0, '#1b212b');
    g.addColorStop(0.55, '#0c0f14');
    g.addColorStop(1, '#05060a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* the faint diagonal weave the site uses everywhere */
    c.save();
    c.globalAlpha = 0.035;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    for (let i = -H; i < W; i += 7) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke();
    }
    c.restore();

    /* vignette */
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.72)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  function header(c) {
    const cx = W / 2;

    c.textAlign = 'center';
    c.fillStyle = ORANGE;
    c.font = `800 19px ${UI}`;
    c.letterSpacing = '9px';
    c.fillText(String(STATE.league || '').toUpperCase(), cx, 54);
    c.letterSpacing = '0px';

    const title = String(STATE.title || 'College Football Playoff').toUpperCase();
    const size = fit(c, title, W - 240, 64, COND, 400);
    c.fillStyle = '#f6f8fb';
    c.font = `400 ${size}px ${COND}`;
    c.fillText(title, cx, 108);

    /* gold rule, brightest under the title */
    const rg = c.createLinearGradient(cx - 420, 0, cx + 420, 0);
    rg.addColorStop(0, 'rgba(216,180,90,0)');
    rg.addColorStop(0.5, GOLD);
    rg.addColorStop(1, 'rgba(216,180,90,0)');
    c.fillStyle = rg;
    c.fillRect(cx - 420, 124, 840, 2);

    c.fillStyle = DIM;
    c.font = `700 17px ${UI}`;
    c.letterSpacing = '5px';
    c.fillText(`${STATE.season}  ·  ${String(STATE.subtitle || '').toUpperCase()}`, cx, 146);
    c.letterSpacing = '0px';
  }

  function footer(c, solved) {
    c.textAlign = 'center';
    c.font = `600 15px ${UI}`;
    c.fillStyle = '#5a6270';
    c.letterSpacing = '3px';

    const champSeed = solved && solved.nc.winner;
    if (champSeed) {
      const s = STATE.seeds[champSeed - 1];
      c.fillStyle = GOLD;
      c.font = `700 17px ${UI}`;
      c.fillText(`${STATE.season} NATIONAL CHAMPION  ·  ` +
                 `NO. ${champSeed} ${team(s.id).school.toUpperCase()}`, W / 2, 1050);
    } else {
      c.fillText('TWELVE TEAMS  ·  ONE TROPHY', W / 2, 1050);
    }
    c.letterSpacing = '0px';
  }

  /* ------------------------------------------------------------- lines */

  function connectors(c) {
    c.strokeStyle = 'rgba(120,132,150,.42)';
    c.lineWidth = 2;

    const R = P.rows, X = P.x;
    const bw = px(P.boxW);
    const half = px(4.15) * 0 + (SPAN * 4.15 / 100);   // box half-height in px

    const v = (xp, y1, y2) => {
      c.beginPath(); c.moveTo(px(xp), py(y1)); c.lineTo(px(xp), py(y2)); c.stroke();
    };
    const h = (x1, x2, yp) => {
      c.beginPath(); c.moveTo(px(x1), py(yp)); c.lineTo(px(x2), py(yp)); c.stroke();
    };

    const r1Lc = X.r1L + P.boxW / 2, qfLc = X.qfL + P.boxW / 2;
    const r1Rc = X.r1R + P.boxW / 2, qfRc = X.qfR + P.boxW / 2;

    /* first-round boxes up into the quarter-finals */
    v(r1Lc, P.r1Y + 4.15, R.mid1);       h(r1Lc, X.qfL, P.qfTopY);
    v(r1Lc, R.mid2, P.r1BotY - 4.15);    h(r1Lc, X.qfL, P.qfBotY);
    v(r1Rc, P.r1Y + 4.15, R.mid1);       h(X.qfR + P.boxW, r1Rc, P.qfTopY);
    v(r1Rc, R.mid2, P.r1BotY - 4.15);    h(X.qfR + P.boxW, r1Rc, P.qfBotY);

    /* quarter-finals into the semis */
    v(qfLc, P.qfTopY + 4.15, 51.4);  v(qfLc, 58.0, P.qfBotY - 4.15);
    h(qfLc, X.sf, R.mid1);
    v(qfRc, P.qfTopY + 4.15, 51.4);  v(qfRc, 58.0, P.qfBotY - 4.15);
    h(X.sf + P.boxW, qfRc, R.mid2);

    /* the semis into the title game */
    c.strokeStyle = 'rgba(216,180,90,.55)';
    const cxp = 50;
    v(cxp, R.mid1 + 4.15, 53.2);
    v(cxp, 56.2, R.mid2 - 4.15);
  }

  /* ------------------------------------------------------- the fixtures */

  /** A hollow slot: the bowl name, or whoever has advanced into it. */
  function bowlBox(c, xp, yp, label, seedNo) {
    const x = px(xp), w = px(P.boxW);
    const hh = SPAN * 8.3 / 100;
    const y = py(yp) - hh / 2;

    c.save();
    round(c, x, y, w, hh, 8);
    c.fillStyle = 'rgba(16,20,27,.72)';
    c.fill();
    c.strokeStyle = seedNo ? 'rgba(216,180,90,.55)' : 'rgba(42,49,61,.9)';
    c.lineWidth = seedNo ? 2 : 1.5;
    c.stroke();
    c.clip();

    c.textAlign = 'center';
    if (seedNo) {
      const s = STATE.seeds[seedNo - 1];
      const t = team(s.id);
      c.fillStyle = GOLD;
      c.font = `700 12px ${UI}`;
      c.letterSpacing = '2px';
      c.fillText(label.replace(/\n/g, ' '), x + w / 2, y + 20);
      c.letterSpacing = '0px';
      const sz = fit(c, t.abbr, w - 18, 30, COND, 400);
      c.fillStyle = '#fff';
      c.font = `400 ${sz}px ${COND}`;
      c.fillText(t.abbr, x + w / 2, y + hh - 16);
    } else {
      c.fillStyle = '#6d7686';
      c.font = `700 13px ${UI}`;
      c.letterSpacing = '2px';
      const lines = label.split('\n');
      lines.forEach((ln, i) =>
        c.fillText(ln, x + w / 2, y + hh / 2 - (lines.length - 1) * 9 + i * 18 + 5));
      c.letterSpacing = '0px';
    }
    c.restore();
  }

  /* ---------------------------------------------------------- the plate */

  /** One team, drawn the way the site's banner draws it: an abbreviation
      panel, a colour crest with the logo in it, and the record alongside. */
  function plate(c, seedNo, yp, side, img, opts) {
    const s = STATE.seeds[seedNo - 1];
    const flip = side === 'R';
    const wpc = P.x.r1L - P.x.plateL - 0.6;
    const w = px(wpc);
    const hh = SPAN * 8.6 / 100;
    const x = flip ? W - px(P.x.plateL) - w : px(P.x.plateL);
    const y = py(yp) - hh / 2;

    const nw = 46;                                   // the seed-number gutter
    const bx = flip ? x : x + nw;
    const bw = w - nw;

    /* seed number */
    c.textAlign = 'center';
    c.fillStyle = seedNo <= 4 ? GOLD : '#59616f';
    const nsz = fit(c, String(seedNo), nw, 40, COND, 400);
    c.font = `400 ${nsz}px ${COND}`;
    c.fillText(String(seedNo), flip ? x + w - nw / 2 : x + nw / 2, y + hh / 2 + 13);

    if (!s) {
      c.save();
      round(c, bx, y, bw, hh, 7);
      c.strokeStyle = 'rgba(42,49,61,.8)';
      c.lineWidth = 1.5;
      c.setLineDash([6, 6]);
      c.stroke();
      c.restore();
      c.fillStyle = '#39414d';
      c.font = `700 15px ${UI}`;
      c.fillText('TBD', bx + bw / 2, y + hh / 2 + 5);
      return;
    }

    const t = team(s.id);
    const tagW = Math.min(bw * 0.42, 132);
    const crestX = flip ? bx : bx + tagW;
    const crestW = bw - tagW;

    c.save();
    round(c, bx, y, bw, hh, 7);
    c.clip();

    /* black abbreviation panel */
    c.fillStyle = '#0b0d11';
    c.fillRect(flip ? bx + crestW : bx, y, tagW, hh);

    /* team-colour crest */
    c.fillStyle = t.primary;
    c.fillRect(crestX, y, crestW, hh);

    /* a soft light down the crest so it is not a flat rectangle */
    const sg = c.createLinearGradient(crestX, y, crestX, y + hh);
    sg.addColorStop(0, 'rgba(255,255,255,.16)');
    sg.addColorStop(0.5, 'rgba(255,255,255,.02)');
    sg.addColorStop(1, 'rgba(0,0,0,.22)');
    c.fillStyle = sg;
    c.fillRect(crestX, y, crestW, hh);

    /* the seam in the second colour */
    c.fillStyle = t.secondary;
    c.fillRect(flip ? bx + crestW - 2 : bx + tagW - 1, y, 3, hh);

    /* abbreviation */
    const tagCx = (flip ? bx + crestW : bx) + tagW / 2;
    const asz = fit(c, t.abbr, tagW - 16, 34, COND, 400);
    c.fillStyle = '#fff';
    c.font = `400 ${asz}px ${COND}`;
    c.textAlign = 'center';
    c.fillText(t.abbr, tagCx, y + hh / 2 + asz * 0.34);

    /* logo, or the school's monogram if there is no file for it */
    const cx = crestX + crestW / 2, cy = y + hh / 2;
    if (img) {
      const maxH = hh * 0.72, maxW = crestW * 0.62;
      const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
      c.drawImage(img, cx - dw / 2 - crestW * 0.12, cy - dh / 2, dw, dh);
    } else {
      const ink = luma(t.primary) > 0.45 ? '#0a0a0a' : '#ffffff';
      const mark = (OVERRIDES[s.id] && OVERRIDES[s.id].mark) || t.mark || t.abbr;
      const msz = fit(c, mark, crestW * 0.5, 40, COND, 400);
      c.fillStyle = ink;
      c.globalAlpha = 0.92;
      c.font = `400 ${msz}px ${COND}`;
      c.fillText(mark, cx - crestW * 0.12, cy + msz * 0.34);
      c.globalAlpha = 1;
    }

    /* school name and record on the open side of the crest */
    const ink2 = luma(t.primary) > 0.45 ? 'rgba(0,0,0,.82)' : 'rgba(255,255,255,.9)';
    c.textAlign = flip ? 'left' : 'right';
    const tx = flip ? crestX + 12 : crestX + crestW - 12;
    const nameSz = fit(c, t.school.toUpperCase(), crestW * 0.5, 17, UI, 800);
    c.fillStyle = ink2;
    c.font = `800 ${nameSz}px ${UI}`;
    c.fillText(t.school.toUpperCase(), tx, cy - 2);

    const sub = [s.record, s.champ ? (t.conf || '').toUpperCase() + ' CHAMP' : '']
      .filter(Boolean).join('  ·  ');
    if (sub) {
      c.font = `700 12px ${UI}`;
      c.globalAlpha = 0.8;
      c.fillText(sub, tx, cy + 16);
      c.globalAlpha = 1;
    }
    c.restore();

    /* a gold hairline under the four byes */
    if (seedNo <= 4) {
      c.fillStyle = 'rgba(216,180,90,.5)';
      c.fillRect(bx, y + hh - 2, bw, 2);
    }
    if (opts && opts.eliminated) {
      c.save();
      round(c, bx, y, bw, hh, 7);
      c.fillStyle = 'rgba(4,5,8,.62)';
      c.fill();
      c.restore();
    }
  }

  /* --------------------------------------------------------- the middle */

  function centrepiece(c, solved) {
    const cx = W / 2, cy = py(54.7);
    const champSeed = solved.nc.winner;

    if (!champSeed) {
      c.textAlign = 'center';
      c.fillStyle = GOLD;
      c.font = `400 26px ${COND}`;
      c.letterSpacing = '3px';
      c.fillText('NATIONAL', cx, cy - 8);
      c.fillText('CHAMPIONSHIP', cx, cy + 20);
      c.letterSpacing = '0px';
      return;
    }

    const s = STATE.seeds[champSeed - 1];
    const t = team(s.id);

    const glow = c.createRadialGradient(cx, cy, 4, cx, cy, 190);
    glow.addColorStop(0, 'rgba(216,180,90,.34)');
    glow.addColorStop(1, 'rgba(216,180,90,0)');
    c.fillStyle = glow;
    c.fillRect(cx - 200, cy - 200, 400, 400);

    c.textAlign = 'center';
    c.fillStyle = GOLD;
    c.font = `800 13px ${UI}`;
    c.letterSpacing = '5px';
    c.fillText('NATIONAL CHAMPION', cx, cy - 34);
    c.letterSpacing = '0px';

    const sz = fit(c, t.school.toUpperCase(), 300, 44, COND, 400);
    c.fillStyle = '#fff';
    c.font = `400 ${sz}px ${COND}`;
    c.fillText(t.school.toUpperCase(), cx, cy + 8);

    c.fillStyle = DIM;
    c.font = `700 13px ${UI}`;
    c.fillText(`NO. ${champSeed} SEED`, cx, cy + 32);
  }

  /* ============================================================ render */

  const LEFT  = [[9, 'topA'], [8, 'topB'], [1, 'mid1'], [4, 'mid2'], [5, 'botA'], [12, 'botB']];
  const RIGHT = [[7, 'topA'], [10, 'topB'], [2, 'mid1'], [3, 'mid2'], [6, 'botA'], [11, 'botB']];

  async function draw() {
    const cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    const c = cvs.getContext('2d');

    const solved = Bracket.solve();

    /* Every logo up front — drawImage cannot wait, so nothing gets drawn
       until they are all either loaded or given up on. */
    const ids = STATE.seeds.filter(Boolean).map(s => s.id);
    const imgs = {};
    await Promise.all(ids.map(async id => { imgs[id] = await logo(id); }));

    /* The game uses one continuous, left-to-right playoff canvas. */
    c.fillStyle = '#141519'; c.fillRect(0, 0, W, H);
    const wash = c.createLinearGradient(0, 0, W, H);
    const lead = STATE.seeds[0] && team(STATE.seeds[0].id);
    wash.addColorStop(0, lead?.primary || '#17345f');
    wash.addColorStop(.34, '#29292e'); wash.addColorStop(1, '#0e0f12');
    c.globalAlpha = .42; c.fillStyle = wash; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    c.save(); c.globalAlpha = .035; c.strokeStyle = '#fff'; c.lineWidth = 2;
    for (let x = -H; x < W; x += 9) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + H, H); c.stroke(); }
    c.restore();

    c.textAlign = 'left'; c.fillStyle = '#fff';
    c.font = `900 56px ${COND}`;
    c.fillText(`${STATE.season} COLLEGE FOOTBALL PLAYOFF`, 58, 80);
    c.fillStyle = '#c8c9cd'; c.font = `800 15px ${UI}`; c.letterSpacing = '4px';
    c.fillText(`${String(STATE.league || '').toUpperCase()}  ·  THE ROAD TO THE NATIONAL CHAMPIONSHIP`, 61, 112);
    c.letterSpacing = '0px';
    c.fillStyle = GOLD; c.font = `400 20px ${COND}`;
    [['FIRST ROUND',58],['QUARTERFINAL',560],['SEMIFINAL',1030],['NATIONAL CHAMPIONSHIP',1400]]
      .forEach(([text, x]) => c.fillText(text, x, 165));

    const rowH = 43, matchGap = 5;
    const centres = [270, 455, 660, 845];
    const first = [
      { id:'fr2', seeds:[12,5] }, { id:'fr1', seeds:[9,8] },
      { id:'fr4', seeds:[11,6] }, { id:'fr3', seeds:[10,7] }
    ];
    const qf = ['qf2','qf1','qf4','qf3'];

    const teamSlot = (seed, x, y, width, score, winner, placeholder) => {
      const selection = seed && STATE.seeds[seed - 1];
      const t = selection && team(selection.id);
      c.save();
      round(c, x, y, width, rowH, 3);
      c.fillStyle = t ? t.primary : '#34353b'; c.fill();
      c.strokeStyle = winner && seed === winner ? '#f3c652' : 'rgba(255,255,255,.3)';
      c.lineWidth = winner && seed === winner ? 3 : 1.5; c.stroke(); c.clip();
      c.fillStyle = '#121317'; c.fillRect(x, y, 58, rowH);
      if (t) { c.fillStyle = t.secondary; c.fillRect(x + 56, y, 4, rowH); }
      c.textAlign = 'center'; c.fillStyle = seed ? '#fff' : '#777a82';
      c.font = `400 25px ${COND}`; c.fillText(seed || '', x + 27, y + 30);
      if (t) {
        const image = imgs[selection.id];
        if (image) {
          const scale = Math.min(31 / image.naturalHeight, 38 / image.naturalWidth);
          const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale;
          c.drawImage(image, x + 69, y + (rowH - dh) / 2, dw, dh);
        }
        c.textAlign = 'left';
        const textX = x + (image ? 114 : 72);
        c.fillStyle = luma(t.primary) > .47 ? '#101114' : '#fff';
        const nameSize = fit(c, t.school.toUpperCase(), width - (textX - x) - 48, 20, COND, 400);
        c.font = `400 ${nameSize}px ${COND}`; c.fillText(t.school.toUpperCase(), textX, y + 27);
      } else {
        c.textAlign = 'left'; c.fillStyle = '#8a8c93'; c.font = `700 14px ${UI}`;
        c.fillText(String(placeholder || 'TBD').toUpperCase(), x + 72, y + 27);
      }
      c.fillStyle = 'rgba(247,245,240,.94)'; c.fillRect(x + width - 42, y, 42, rowH);
      c.textAlign = 'center'; c.fillStyle = '#1b1c20'; c.font = `400 23px ${COND}`;
      c.fillText(score ?? '', x + width - 21, y + 29);
      c.restore();
    };

    const initialMatch = (item, centre) => {
      const state = solved[item.id];
      item.seeds.forEach((seed, index) => {
        const side = state.a === seed ? 'a' : 'b';
        teamSlot(seed, 58, centre - rowH - matchGap / 2 + index * (rowH + matchGap), 390,
          state[side === 'a' ? 'sa' : 'sb'], state.winner);
      });
    };
    const laterMatch = (id, x, centre, width) => {
      const g = GAME_BY_ID[id], state = solved[id];
      teamSlot(state.a, x, centre - rowH - matchGap / 2, width, state.sa, state.winner,
        Bracket.slotName(state.a, solved, g.a));
      teamSlot(state.b, x, centre + matchGap / 2, width, state.sb, state.winner,
        Bracket.slotName(state.b, solved, g.b));
      c.textAlign = 'left'; c.fillStyle = '#85878f'; c.font = `700 10px ${UI}`;
      c.fillText(g.name.toUpperCase(), x + 4, centre + rowH + 17);
    };

    c.strokeStyle = 'rgba(238,236,230,.72)'; c.lineWidth = 3;
    const hLine = (x1, x2, y) => { c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke(); };
    const vLine = (x, y1, y2) => { c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y2); c.stroke(); };
    centres.forEach(y => hLine(448, 560, y));
    [[centres[0],centres[1],362],[centres[2],centres[3],752]].forEach(([a,b,mid]) => {
      hLine(890, 975, a); hLine(890, 975, b); vLine(975, a, b); hLine(975, 1030, mid);
    });
    hLine(1325, 1360, 362); hLine(1325, 1360, 752); vLine(1360, 362, 752); hLine(1360, 1400, 557);
    hLine(1690, 1740, 557);

    first.forEach((item, index) => initialMatch(item, centres[index]));
    qf.forEach((id, index) => laterMatch(id, 560, centres[index], 330));
    laterMatch('sf1', 1030, 362, 295); laterMatch('sf2', 1030, 752, 295);
    laterMatch('nc', 1400, 557, 290);

    const trophy = await new Promise(resolve => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null);
      image.src = 'assets/trophy-cut.webp';
    });
    if (trophy) c.drawImage(trophy, 1740, 300, 150, 500);
    const champSeed = solved.nc.winner;
    c.textAlign = 'center';
    if (champSeed && STATE.seeds[champSeed - 1]) {
      c.fillStyle = '#fff'; c.font = `400 24px ${COND}`;
      c.fillText(team(STATE.seeds[champSeed - 1].id).school.toUpperCase(), 1814, 845);
      c.fillStyle = GOLD; c.font = `800 11px ${UI}`; c.fillText('NATIONAL CHAMPION', 1814, 868);
    } else {
      c.fillStyle = '#fff'; c.font = `400 22px ${COND}`; c.fillText('LAS VEGAS, NV', 1814, 845);
      c.fillStyle = GOLD; c.font = `800 11px ${UI}`; c.fillText('ONE CHAMPION', 1814, 868);
    }
    footer(c, solved);

    return cvs;
  }

  const fileName = () =>
    `${String(STATE.league || 'playoff').toLowerCase().replace(/[^a-z0-9]+/g, '-')}` +
    `-${STATE.season}-bracket.png`;

  function blobOf(cvs) {
    return new Promise((res, rej) => {
      try { cvs.toBlob(b => b ? res(b) : rej(new Error('empty')), 'image/png'); }
      catch (e) { rej(e); }        // a cross-origin logo can taint the canvas
    });
  }

  /** Save it to the device. */
  async function download() {
    const blob = await blobOf(await draw());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return blob;
  }

  /** Hand it to the OS share sheet — on a phone that is how it reaches
      the group chat without a trip through Files. */
  async function share() {
    const blob = await blobOf(await draw());
    const file = new File([blob], fileName(), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${STATE.league} ${STATE.season}` });
      return true;
    }
    return false;
  }

  const canShare = () => {
    try {
      return !!(navigator.canShare &&
        navigator.canShare({ files: [new File([new Blob()], 'b.png', { type: 'image/png' })] }));
    } catch (e) { return false; }
  };

  /** A data URL, for showing a preview before anybody commits to saving. */
  async function preview() {
    const cvs = await draw();
    try { return cvs.toDataURL('image/png'); } catch (e) { return null; }
  }

  return { draw, download, share, canShare, preview, fileName };
})();
