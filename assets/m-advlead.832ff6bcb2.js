import{$ as h,$$ as v,S as u,astTo as $,barVars as y,efgPct as N,ensureTeamColors as k,esc as t,face as d,leadCats as w,leagueTable as M,loadStandings as T,logo as P,rememberPlayer as F,teamColor as L,tsPct as C}from"core";async function E(e){const r=h("#leadBody");r.innerHTML='<div class="lead-grid"><div class="sk" style="height:420px;border-radius:20px"></div><div class="sk" style="height:520px"></div></div>';let n;try{[n]=await Promise.all([M(),T().catch(()=>null),k()])}catch{r.innerHTML=`<div class="empty"><b>Leaders didn't load</b>The stats feed may be busy.<br><button class="btn" data-retry="leaders">Try again</button></div>`;return}if(w()[u.leadKey]!==e)return;const m=Math.max(1,...n.map(a=>a.gp||0)),p=a=>(a.gp||0)>=Math.max(1,Math.floor(m*.5))&&(a.min||0)>=15,c=a=>(a.fga||0)*(a.fgp||0)/100,g={ts:a=>(a.fga||0)>=8?100*C(a.pts,a.fga,a.fta||0):NaN,efg:a=>(a.fga||0)>=8?100*N(c(a),a.tpm||0,a.fga):NaN,p36:a=>(a.min||0)>=20?a.pts*36/a.min:NaN,ato:a=>(a.ast||0)>=3?$(a.ast,a.tov||0):NaN,stocks:a=>(a.stl||0)+(a.blk||0),ftr:a=>(a.fga||0)>=8?100*(a.fta||0)/a.fga:NaN,tpr:a=>(a.fga||0)>=8?100*(a.tpa||0)/a.fga:NaN}[e.adv],o=n.filter(p).map(a=>({r:a,v:g(a)})).filter(a=>Number.isFinite(a.v)).sort((a,i)=>i.v-a.v).slice(0,15);if(!o.length){r.innerHTML='<div class="empty"><b>Not enough games yet</b>Check back after a few more games.</div>';return}o.forEach(a=>F({id:a.r.id,displayName:a.r.name,shortName:a.r.short,position:{abbreviation:a.r.pos}},a.r.teamId));const l=a=>a.toFixed(1),s=o[0],f=Math.max(...o.map(a=>a.v))||1,b={ts:"True shooting: points per shooting possession, counting threes and free throws. Min 8 shots a game.",efg:"Effective field goal %: field goal % with threes worth 1.5 makes. Min 8 shots a game.",p36:"Points per 36 minutes. Min 20 minutes a game.",ato:"Assists per turnover. Min 3 assists a game.",stocks:"Steals plus blocks per game.",ftr:"Free throw attempts per shot attempt (getting to the line). Min 8 shots a game.",tpr:"Share of shots taken from three. Min 8 shots a game."}[e.adv];r.innerHTML=`<div class="lead-grid">
    <button class="hero-card enter" style="--tc:${L(s.r.teamId||s.r.abbr)}" data-player="${s.r.id}">
      <span class="rk">No. 1 \xB7 ${t(e.k.toUpperCase())}</span>
      ${d(s.r.id,s.r.name,"face",700)}
      <div class="big num">${l(s.v)}<small>${t(e.u)}</small></div>
      <div class="who">${t(s.r.name)}</div>
      <div class="meta">${t(s.r.abbr)} \xB7 ${t(s.r.pos)} \xB7 ${s.r.gp} GP</div>
    </button>
    <div><div class="lrows">${o.map((a,i)=>`
      <button class="lrow enter" style="--i:${i}" data-player="${a.r.id}">
        <span class="rk">${i+1}</span>${d(a.r.id,a.r.name,"face",120)}
        <span class="nm"><b>${t(a.r.name)}</b><span>${P(a.r.abbr,32)}${t(a.r.abbr)} \xB7 ${t(a.r.pos)} \xB7 ${a.r.gp} GP</span></span>
        <span class="bar"><i data-w="${(a.v/f*100).toFixed(1)}" style="${y(a.r.teamId||a.r.abbr)}"></i></span>
        <span class="v">${l(a.v)}</span>
      </button>`).join("")}</div>
      <p class="race-note">${t(b)} Worked out from ESPN's per-game numbers.</p></div>
  </div>`,requestAnimationFrame(()=>requestAnimationFrame(()=>v(".lrow .bar i",r).forEach(a=>a.style.width=a.dataset.w+"%")))}export{E as renderAdvLeader};
