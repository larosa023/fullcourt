/* ---------------- playoff picture ---------------- */
function playoffBracketW() {
  const all = S.standings.confs.flatMap(c => c.rows).sort((a, b) => a.seed - b.seed);
  const s = n => all.find(x => x.seed === n);
  const team = (t, seed) => t ? `<button class="bk-t${t.id === favId ? ' fav' : ''}" data-team="${t.id}"><span class="sd">${seed}</span>${logo(t.abbr, 40)}<span class="nm">${esc(t.short)}</span><span class="rc">${t.w}-${t.l}</span></button>` : `<div class="bk-t tbd"><span class="sd">${seed}</span><span class="nm">TBD</span></div>`;
  const tb = note => `<div class="bk-t tbd"><span class="sd"></span><span class="nm">${esc(note)}</span></div>`;
  const m = (a, b) => `<div class="bk-m">${a}${b}</div>`;
  return `<div class="bracket">
    <p class="bk-note">Seeded 1–8 across the whole league by record, regardless of conference. No Play-In.</p>
    <div class="bk-conf"><div class="bk-cols" style="grid-template-columns:repeat(3,1fr)">
      <div class="bk-col"><div class="bk-ch">First round</div>${m(team(s(1), 1), team(s(8), 8))}${m(team(s(4), 4), team(s(5), 5))}${m(team(s(3), 3), team(s(6), 6))}${m(team(s(2), 2), team(s(7), 7))}</div>
      <div class="bk-col"><div class="bk-ch">Semifinals</div>${m(tb('Winner 1 / 8'), tb('Winner 4 / 5'))}${m(tb('Winner 3 / 6'), tb('Winner 2 / 7'))}</div>
      <div class="bk-col"><div class="bk-ch">WNBA Finals</div>${m(tb('Top half winner'), tb('Bottom half winner'))}</div>
    </div></div>
  </div>`;
}
function playoffBracket() {
  if (IS_W) return playoffBracketW();
  const conf = c => {
    const r = S.standings.confs[c].rows, s = n => r.find(x => x.seed === n);
    const team = (t, seed, note) => t
      ? `<button class="bk-t${t.id === favId ? ' fav' : ''}" data-team="${t.id}"><span class="sd">${seed}</span>${logo(t.abbr, 40)}<span class="nm">${esc(t.short)}</span><span class="rc">${t.w}-${t.l}</span></button>`
      : `<div class="bk-t tbd"><span class="sd">${seed ?? ''}</span><span class="nm">${esc(note)}</span></div>`;
    const m = (a, b, label) => `<div class="bk-m">${label ? `<div class="bk-l">${label}</div>` : ''}${a}${b}</div>`;
    const tb = note => team(null, '', note);
    return `<div class="bk-conf">
      <div class="bk-h"><h3 class="h-display">${esc(S.standings.confs[c].name)}</h3></div>
      <div class="bk-cols">
        <div class="bk-col pi"><div class="bk-ch">Play-In</div>
          ${m(team(s(7), 7), team(s(8), 8), 'Winner is the 7 seed')}
          ${m(team(s(9), 9), team(s(10), 10), 'Loser is out')}
          ${m(tb('Loser of 7 vs 8'), tb('Winner of 9 vs 10'), 'Winner is the 8 seed')}
        </div>
        <div class="bk-col"><div class="bk-ch">First round</div>
          ${m(team(s(1), 1), tb('Play-In winner (8)'))}
          ${m(team(s(4), 4), team(s(5), 5))}
          ${m(team(s(3), 3), team(s(6), 6))}
          ${m(team(s(2), 2), tb('Play-In winner (7)'))}
        </div>
        <div class="bk-col"><div class="bk-ch">Semifinals</div>
          ${m(tb('Winner 1 / 8'), tb('Winner 4 / 5'))}
          ${m(tb('Winner 3 / 6'), tb('Winner 2 / 7'))}
        </div>
        <div class="bk-col"><div class="bk-ch">Conference finals</div>
          ${m(tb('Top half winner'), tb('Bottom half winner'))}
        </div>
      </div>
    </div>`;
  };
  return `<div class="bracket">
    <p class="bk-note">If the season ended today. Seeds 1–6 go straight to the first round; seeds 7–10 play in the Play-In Tournament.</p>
    ${conf(0)}${conf(1)}
    <div class="bk-final"><div class="bk-ch">${LGN} Finals</div>${`<div class="bk-m">${'<div class="bk-t tbd"><span class="nm">East champion</span></div><div class="bk-t tbd"><span class="nm">West champion</span></div>'}</div>`}</div>
  </div>`;
}

