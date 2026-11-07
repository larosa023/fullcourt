import{$ as v,$$ as u,S as $,astTo as y,barVars as N,efgPct as k,ensureTeamColors as w,esc as e,face as m,leadCats as M,leagueTable as T,loadStandings as P,logo as F,rememberPlayer as L,teamColor as C,tsPct as E}from"core";async function S(t,l){const r=v("#leadBody"),A=l?scrollY:null;l||(r.innerHTML='<div class="lead-grid"><div class="sk" style="height:420px;border-radius:20px"></div><div class="sk" style="height:520px"></div></div>');let n;try{[n]=await Promise.all([T(),P().catch(()=>null),w()])}catch{r.innerHTML=`<div class="empty"><b>Leaders didn't load</b>The stats feed may be busy.<br><button class="btn" data-retry="leaders">Try again</button></div>`;return}if(M()[$.leadKey]!==t)return;const p=Math.max(1,...n.map(a=>a.gp||0)),c=a=>(a.gp||0)>=Math.max(1,Math.floor(p*.5))&&(a.min||0)>=15,g=a=>(a.fga||0)*(a.fgp||0)/100,f={ts:a=>(a.fga||0)>=8?100*E(a.pts,a.fga,a.fta||0):NaN,efg:a=>(a.fga||0)>=8?100*k(g(a),a.tpm||0,a.fga):NaN,p36:a=>(a.min||0)>=20?a.pts*36/a.min:NaN,ato:a=>(a.ast||0)>=3?y(a.ast,a.tov||0):NaN,stocks:a=>(a.stl||0)+(a.blk||0),ftr:a=>(a.fga||0)>=8?100*(a.fta||0)/a.fga:NaN,tpr:a=>(a.fga||0)>=8?100*(a.tpa||0)/a.fga:NaN}[t.adv],o=n.filter(c).map(a=>({r:a,v:f(a)})).filter(a=>Number.isFinite(a.v)).sort((a,i)=>i.v-a.v).slice(0,15);if(!o.length){r.innerHTML='<div class="empty"><b>Not enough games yet</b>Check back after a few more games.</div>';return}o.forEach(a=>L({id:a.r.id,displayName:a.r.name,shortName:a.r.short,position:{abbreviation:a.r.pos}},a.r.teamId));const d=a=>a.toFixed(1),s=o[0],b=Math.max(...o.map(a=>a.v))||1,h={ts:"True shooting: points per shooting possession, counting threes and free throws. Min 8 shots a game.",efg:"Effective field goal %: field goal % with threes worth 1.5 makes. Min 8 shots a game.",p36:"Points per 36 minutes. Min 20 minutes a game.",ato:"Assists per turnover. Min 3 assists a game.",stocks:"Steals plus blocks per game.",ftr:"Free throw attempts per shot attempt (getting to the line). Min 8 shots a game.",tpr:"Share of shots taken from three. Min 8 shots a game."}[t.adv];r.innerHTML=`<div class="lead-grid">
    <button class="hero-card enter" style="--tc:${C(s.r.teamId||s.r.abbr)}" data-player="${s.r.id}">
      <span class="rk">No. 1 \xB7 ${e(t.k.toUpperCase())}</span>
      ${m(s.r.id,s.r.name,"face",700)}
      <div class="big num">${d(s.v)}<small>${e(t.u)}</small></div>
      <div class="who">${e(s.r.name)}</div>
      <div class="meta">${e(s.r.abbr)} \xB7 ${e(s.r.pos)} \xB7 ${s.r.gp} GP</div>
    </button>
    <div><div class="lrows">${o.map((a,i)=>`
      <button class="lrow enter" style="--i:${i}" data-player="${a.r.id}">
        <span class="rk">${i+1}</span>${m(a.r.id,a.r.name,"face",120)}
        <span class="nm"><b>${e(a.r.name)}</b><span>${F(a.r.abbr,32)}${e(a.r.abbr)} \xB7 ${e(a.r.pos)} \xB7 ${a.r.gp} GP</span></span>
        <span class="bar"><i data-w="${(a.v/b*100).toFixed(1)}" style="${N(a.r.teamId||a.r.abbr)}"></i></span>
        <span class="v">${d(a.v)}</span>
      </button>`).join("")}</div>
      <p class="race-note">${e(h)} Worked out from ESPN's per-game numbers.</p></div>
  </div>`,requestAnimationFrame(()=>requestAnimationFrame(()=>u(".lrow .bar i",r).forEach(a=>a.style.width=a.dataset.w+"%")))}export{S as renderAdvLeader};
