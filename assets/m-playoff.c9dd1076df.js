import{IS_W as k,LGN as f,S as r,esc as o,favId as b,logo as $}from"core";function p(){const t=r.standings.confs.flatMap(s=>s.rows).sort((s,a)=>s.seed-a.seed),c=s=>t.find(a=>a.seed===s),l=(s,a)=>s?`<button class="bk-t${s.id===b?" fav":""}" data-team="${s.id}"><span class="sd">${a}</span>${$(s.abbr,40)}<span class="nm">${o(s.short)}</span><span class="rc">${s.w}-${s.l}</span></button>`:`<div class="bk-t tbd"><span class="sd">${a}</span><span class="nm">TBD</span></div>`,i=s=>`<div class="bk-t tbd"><span class="sd"></span><span class="nm">${o(s)}</span></div>`,n=(s,a)=>`<div class="bk-m">${s}${a}</div>`;return`<div class="bracket">
    <p class="bk-note">Seeded 1\u20138 across the whole league by record, regardless of conference. No Play-In.</p>
    <div class="bk-conf"><div class="bk-cols" style="grid-template-columns:repeat(3,1fr)">
      <div class="bk-col"><div class="bk-ch">First round</div>${n(l(c(1),1),l(c(8),8))}${n(l(c(4),4),l(c(5),5))}${n(l(c(3),3),l(c(6),6))}${n(l(c(2),2),l(c(7),7))}</div>
      <div class="bk-col"><div class="bk-ch">Semifinals</div>${n(i("Winner 1 / 8"),i("Winner 4 / 5"))}${n(i("Winner 3 / 6"),i("Winner 2 / 7"))}</div>
      <div class="bk-col"><div class="bk-ch">WNBA Finals</div>${n(i("Top half winner"),i("Bottom half winner"))}</div>
    </div></div>
  </div>`}function h(){if(k)return p();const t=c=>{const l=r.standings.confs[c].rows,i=d=>l.find(e=>e.seed===d),n=(d,e,v)=>d?`<button class="bk-t${d.id===b?" fav":""}" data-team="${d.id}"><span class="sd">${e}</span>${$(d.abbr,40)}<span class="nm">${o(d.short)}</span><span class="rc">${d.w}-${d.l}</span></button>`:`<div class="bk-t tbd"><span class="sd">${e??""}</span><span class="nm">${o(v)}</span></div>`,s=(d,e,v)=>`<div class="bk-m">${v?`<div class="bk-l">${v}</div>`:""}${d}${e}</div>`,a=d=>n(null,"",d);return`<div class="bk-conf">
      <div class="bk-h"><h3 class="h-display">${o(r.standings.confs[c].name)}</h3></div>
      <div class="bk-cols">
        <div class="bk-col pi"><div class="bk-ch">Play-In</div>
          ${s(n(i(7),7),n(i(8),8),"Winner is the 7 seed")}
          ${s(n(i(9),9),n(i(10),10),"Loser is out")}
          ${s(a("Loser of 7 vs 8"),a("Winner of 9 vs 10"),"Winner is the 8 seed")}
        </div>
        <div class="bk-col"><div class="bk-ch">First round</div>
          ${s(n(i(1),1),a("Play-In winner (8)"))}
          ${s(n(i(4),4),n(i(5),5))}
          ${s(n(i(3),3),n(i(6),6))}
          ${s(n(i(2),2),a("Play-In winner (7)"))}
        </div>
        <div class="bk-col"><div class="bk-ch">Semifinals</div>
          ${s(a("Winner 1 / 8"),a("Winner 4 / 5"))}
          ${s(a("Winner 3 / 6"),a("Winner 2 / 7"))}
        </div>
        <div class="bk-col"><div class="bk-ch">Conference finals</div>
          ${s(a("Top half winner"),a("Bottom half winner"))}
        </div>
      </div>
    </div>`};return`<div class="bracket">
    <p class="bk-note">If the season ended today. Seeds 1\u20136 go straight to the first round; seeds 7\u201310 play in the Play-In Tournament.</p>
    ${t(0)}${t(1)}
    <div class="bk-final"><div class="bk-ch">${f} Finals</div><div class="bk-m"><div class="bk-t tbd"><span class="nm">East champion</span></div><div class="bk-t tbd"><span class="nm">West champion</span></div></div></div>
  </div>`}export{h as playoffBracket,p as playoffBracketW};
