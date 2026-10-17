'use strict';
/* EdgeLab — front-end estático. Datos: data/picks.json y data/results.json */
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
          set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pc=(x,d=0)=>(x*100).toFixed(d)+'%';
const fx=v=>v==null?'–':(Math.round(v*10)/10).toString();
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const SUSP=.15, TRIV=.85;
const LINEAS_OK={goles:[1.5,2.5,3.5],goles1t:[0.5,1.5]};
const NAMES={'1':'Gana local','X':'Empate','2':'Gana visitante','O2.5':'Más de 2.5 goles','U2.5':'Menos de 2.5 goles'};
const VN={goles:'Goles del partido',goles1t:'Goles 1er tiempo',corners:'Tiros de esquina',tarjetas:'Tarjetas (amarillas + rojas)',tiros_puerta:'Tiros a puerta',tiros:'Tiros totales',faltas:'Faltas'};
const CN={gol:'Goles',gol1t:'Goles 1T',esq:'Córners',tarj:'Tarjetas',ptas:'Tiros a puerta',tiros:'Tiros'};

const IC={
  ball:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z"/><path d="M12 3v4.5M20.5 9.5l-4.9.6M17.5 19l-3.3-4.7M6.5 19l3.3-4.7M3.5 9.5l4.9.6"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ticket:'<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M13 6v12" stroke-dasharray="2 3"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>', plus:'<path d="M12 5v14M5 12h14"/>', chev:'<path d="M9 6l6 6-6 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>', trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
  moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  check:'<path d="M5 12l5 5 9-10"/>',
  wallet:'<path d="M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l2-3h11"/><circle cx="17" cy="14" r="1.2"/>',
  alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'
};
const ic=(n,c='')=>`<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

const S={data:null,res:[],ligas:new Set(),w:LS.get('el.w',75)/100,only:LS.get('el.only',false),q:'',range:'all',
  view:LS.get('el.view','partidos'),sel:null,panel:'detalle',dtab:'resumen',slip:new Map(),
  bets:LS.get('el.bets',[]),bank:LS.get('el.bank',1000),bank0:LS.get('el.bank0',null),wAuto:LS.get('el.wauto',true),sim:LS.get('el.sim',{tipo:'todas',emin:-100,emax:100,pmin:0,cat:'',liga:'',casa:'',cmin:1,cmax:50,stake:'actual',fijo:10,pct:2}),riesgo:LS.get('el.riesgo',{dia:5,sem:10,exp:15}),slipMeta:{casa:LS.get('el.casa','Betano'),tag:LS.get('el.tag','Modelo'),nota:''},tomb:LS.get('el.tomb',{}),sync:{tok:LS.get('el.gtok',''),gist:LS.get('el.gist',''),last:LS.get('el.glast',null),msg:'',busy:false},plan:{perfil:LS.get('el.perfil','mod'),n:LS.get('el.nplan',5),saldo:null},theme:LS.get('el.theme','auto')};

/* ===================== cálculo ===================== */
const key=m=>`${m.liga}|${m.home}|${m.away}|${m.fecha}`;
/* peso del mercado: el validado por el backtest de cada liga (si está activo) o el manual */
const btOf=m=>(S.data&&S.data.meta.backtest&&S.data.meta.backtest[m.liga])||null;
const wOf=m=>{const b=btOf(m);return (S.wAuto&&b&&b.w_opt!=null)?b.w_opt:S.w};
/* ¿el modelo de conteo (1T, córners, tarjetas, tiros) supera al promedio de la liga? null = sin evidencia */
function skillOf(m,v){
  if(v==='goles'||v==='btts')return true;
  const b=btOf(m);if(!b||!b.conteos||!b.conteos[v])return null;
  return b.conteos[v].mejora>=.01;
}
function compute(m){
  const out={};
  for(const grp of [['1','X','2'],['O2.5','U2.5']]){
    if(!grp.every(s=>m.sel[s]))continue;
    if(!grp.every(s=>m.sel[s].avg)){grp.forEach(s=>{const q=m.sel[s].pm;out[s]={pm:q,pmk:q,p:q,o:null,edge:null}});continue}
    const inv=grp.map(s=>1/m.sel[s].avg),tot=inv.reduce((a,b)=>a+b,0);
    const w=wOf(m);grp.forEach((s,i)=>{const pmk=inv[i]/tot,p=(1-w)*m.sel[s].pm+w*pmk,o=m.sel[s].max;out[s]={pm:m.sel[s].pm,pmk,p,o,edge:p*o-1}});
  }
  return out;
}
const kelly=(p,o,cap)=>Math.max(0,Math.min(cap,(p*o-1)/(o-1)*.25));
const lvl=p=>p>=.7?['a','Alta']:p>=.55?['m','Media']:['b','Baja'];
const nivel=x=>{const l=lvl(x.p);return (x.dud&&l[0]==='a')?['m','Media']:l};
const dudTag=x=>x.dud?`<span class="lvl b" title="${x.sk===null?'Sin backtest para esta variable en esta liga':'En el backtest este modelo no supera al promedio de la liga'}">≈ liga</span>`:'';
const lvlColor=p=>p>=.7?'var(--good)':p>=.55?'var(--warn)':'var(--draw)';

function catOpts(m,c,all){
  const w=wOf(m),cats=[],ex=(v,l)=>(m.extra||[]).find(e=>e.var===v&&e.l===l);
  if(c['1']&&c['X']&&c['2']){
    cats.push({cat:'Resultado',opts:[['1','Gana '+m.home],['X','Empate'],['2','Gana '+m.away]].map(([id,t])=>({id,t,p:c[id].p,o:c[id].o,e:c[id].edge}))});
    cats.push({cat:'Doble oportunidad',opts:[['DC:1X','Local o empate',c['1'].p+c['X'].p],['DC:X2','Visita o empate',c['2'].p+c['X'].p],['DC:12','Local o visita',c['1'].p+c['2'].p]].map(([id,t,p])=>({id,t,p,o:null,e:null}))});
  }
  const lineas=(v,nombre,suf)=>{
    const o=m.vars&&m.vars[v];if(!o)return;const opts=[];
    const sel=o.lineas.filter(L=>all||!LINEAS_OK[v]||LINEAS_OK[v].includes(L.l));
    (sel.length?sel:o.lineas).forEach(L=>{
      let po=L.o,co=null,cu=null,io=`${v}:O:${L.l}`,iu=`${v}:U:${L.l}`;const e=ex(v,L.l);
      if(v==='goles'&&L.l===2.5&&c['O2.5']){po=c['O2.5'].p;co=c['O2.5'].o;cu=c['U2.5'].o;io='O2.5';iu='U2.5'}
      else if(e){const pmk=(1/e.cuo)/(1/e.cuo+1/e.cuu);po=(1-w)*e.po+w*pmk;co=e.cuo;cu=e.cuu}
      const sk=skillOf(m,v),dud=sk!==true;
      opts.push({id:io,t:`Más de ${L.l} ${suf}`,p:po,o:co,e:co?po*co-1:null,dud,sk});
      opts.push({id:iu,t:`Menos de ${L.l} ${suf}`,p:1-po,o:cu,e:cu?(1-po)*cu-1:null,dud,sk});
    });
    cats.push({cat:nombre,opts});
  };
  lineas('goles','Goles del partido','goles');lineas('goles1t','Goles 1er tiempo','goles 1T');
  lineas('corners','Córners','córners');lineas('tarjetas','Tarjetas','tarjetas');lineas('tiros_puerta','Tiros a puerta','tiros a puerta');
  if(m.btts!=null){
    const e=(m.extra||[]).find(x=>x.var==='btts');let ps=m.btts,cs=null,cn=null;
    if(e){const pmk=(1/e.cuo)/(1/e.cuo+1/e.cuu);ps=(1-w)*e.po+w*pmk;cs=e.cuo;cn=e.cuu}
    cats.push({cat:'Ambos equipos anotan',opts:[{id:'btts:S',t:'Sí anotan ambos',p:ps,o:cs,e:cs?ps*cs-1:null},{id:'btts:N',t:'No anotan ambos',p:1-ps,o:cn,e:cn?(1-ps)*cn-1:null}]});
  }
  return cats.filter(k=>k.opts.length);
}
function recos(m,c){
  return catOpts(m,c,false).map(k=>{const ok=k.opts.filter(x=>x.p<=TRIV);
    return {cat:k.cat,...(ok.length?ok:k.opts).reduce((a,b)=>b.p>a.p?b:a)}}).sort((a,b)=>b.p-a.p);
}
function findOpt(m,c,id){
  for(const k of catOpts(m,c,true))for(const x of k.opts)if(x.id===id)return {...x,cat:k.cat};
  return null;
}
const RISK_MIN=.15,RISK_ODDS=2.5; // arriesgada: paga 2.5x o más, pero con al menos 15% de opciones
function riskOpts(m,c){
  const best={};
  catOpts(m,c,true).forEach(k=>{if(k.cat==='Doble oportunidad')return;
    k.opts.forEach(x=>{const pay=x.o||1/x.p;if(x.p>=RISK_MIN&&pay>=RISK_ODDS&&(!best[k.cat]||x.p>best[k.cat].p))best[k.cat]={cat:k.cat,...x}})});
  return Object.values(best).sort((a,b)=>b.p-a.p);
}
function enrich(m){const c=compute(m),r=recos(m,c);
  const vivo=m.est==='vivo';
  const val=vivo?null:(r.filter(x=>x.e!=null&&x.e>=.03&&x.e<=SUSP).sort((a,b)=>b.e-a.e)[0]||null);
  const hot=!vivo&&r.some(x=>x.e!=null&&x.e>SUSP);
  return {m,c,r,risk:riskOpts(m,c),top:r.find(x=>x.cat!=='Doble oportunidad'&&!x.dud)||r.find(x=>x.cat!=='Doble oportunidad')||r[0],val,hot,k:key(m)};
}

/* ===================== utilidades de UI ===================== */
const peruNow=(add=0)=>new Date(Date.now()-5*3600e3+add*864e5).toISOString().slice(0,10);   // fecha de hoy en Perú (UTC-5)
const fmtDay=d=>{
  const diff=Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(peruNow()+'T00:00:00Z'))/864e5);
  const base=new Date(d+'T12:00:00Z').toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
  return diff===0?'Hoy · '+base:diff===1?'Mañana · '+base:base};
const ago=iso=>{const m=Math.max(0,Math.round((Date.now()-new Date(iso))/60000));
  return m<60?`hace ${m} min`:m<1440?`hace ${Math.round(m/60)} h`:`hace ${Math.round(m/1440)} d`};
function ring(p,size=42){
  const r=size/2-4,C=2*Math.PI*r,cx=size/2;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="4"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${lvlColor(p)}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(C*p).toFixed(1)} ${C.toFixed(1)}"/></svg>
    <span>${Math.round(p*100)}</span></div>`;
}
/* cuota que paga: real si la casa la ofrece; si no, la mínima con valor (1/p) */
function payPill(x){
  if(x.o)return `<span class="pay real" title="Cuota que paga la casa">@${x.o.toFixed(2)}</span>`;
  return `<span class="pay fair" title="Sin cuota de casa: tiene valor si una casa paga al menos esto">≥${(1/x.p).toFixed(2)}</span>`;
}
const ligaName=l=>(S.data.meta.ligas[l]||l);
const horaTxt=m=>m.ph?esc(m.ph):'—';
const tz=m=>'hora Perú';   // todos los horarios se muestran en hora de Perú (UTC-5)
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2600)}
const narrow=()=>window.matchMedia('(max-width:1100px)').matches;
const overlay=()=>narrow()||S.view!=='partidos';

/* ===================== estado del partido ===================== */
const DUR_MIN=130; // 90' + descanso + descuentos: pasado este tiempo se considera terminado
function ultimoDomingo(y,m){const d=new Date(Date.UTC(y,m+1,0));d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d}
function ukBST(ms){const y=new Date(ms).getUTCFullYear();
  const a=ultimoDomingo(y,2).setUTCHours(1,0,0,0),b=ultimoDomingo(y,9).setUTCHours(1,0,0,0);return ms>=a&&ms<b}
const LIMA=new Set(['PER','UCL','UEL','LIB','SUD']);
function koMs(m){
  const [y,mo,d]=m.fecha.split('-').map(Number);
  if(!m.hora)return Date.UTC(y,mo-1,d,23,59);            // sin hora: se considera todo el día
  const [h,mi]=m.hora.split(':').map(Number);
  if(m.zona==='lima'||(!m.zona&&LIMA.has(m.liga)))return Date.UTC(y,mo-1,d,h+5,mi);   // datos de ESPN: ya vienen en hora de Perú (UTC-5)
  const g=Date.UTC(y,mo-1,d,h,mi);                        // hora del Reino Unido
  return g-(ukBST(g)?3600000:0);
}
function estadoPartido(m,now){
  if(S.res.some(r=>r.h===m.home&&r.a===m.away&&r.d>=m.fecha))return 'fin';
  const ko=koMs(m);
  if(now>=ko+DUR_MIN*60000)return 'fin';
  return now>=ko?'vivo':'prox';
}
function aplicarEstado(){
  const now=Date.now();
  S.todos.forEach(m=>{
    if(m.pf)return;
    if(!m.hora){m.pf=m.fecha;m.ph=null;return}
    const d=new Date(koMs(m)-5*3600e3);                 // hora de Perú = UTC-5
    m.pf=d.toISOString().slice(0,10);m.ph=d.toISOString().slice(11,16);
  });
  S.data.partidos=S.todos.filter(m=>{m.est=estadoPartido(m,now);return m.est!=='fin'&&!m.rec});
}

/* ===================== carga ===================== */
async function init(){
  applyTheme();
  $('main').innerHTML='<div class="wrap"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  try{
    const [d,r]=window.__EL__?[window.__EL__.picks,window.__EL__.results]:await Promise.all([fetch('data/picks.json',{cache:'no-cache'}).then(x=>{if(!x.ok)throw 0;return x.json()}),
      fetch('data/results.json',{cache:'no-cache'}).then(x=>x.json()).catch(()=>[])]);
    S.data=d;S.res=r;
  }catch(e){$('main').innerHTML='<div class="wrap"><div class="empty"><b>Aún no hay datos</b>La primera actualización automática todavía no se ha ejecutado.</div></div>';return}
  Object.keys(S.data.meta.ligas).forEach(k=>S.ligas.add(k));
  S.todos=S.data.partidos.concat((S.data.recientes||[]).filter(r=>!S.data.partidos.some(p=>key(p)===key(r))).map(r=>({...r,rec:true})));aplicarEstado();
  setInterval(()=>{const antes=S.data.partidos.map(m=>key(m)+m.est).join();aplicarEstado();
    if(antes!==S.data.partidos.map(m=>key(m)+m.est).join()){if(S.sel&&!S.data.partidos.some(m=>key(m)===S.sel))S.sel=null;keepScroll(render);renderDetail()}validar(true)},60000);
  setInterval(refrescarResultados,180000);
  const h=(Date.now()-new Date(S.data.meta.generado))/36e5;
  $('updt').textContent='Actualizado '+ago(S.data.meta.generado);$('upd').querySelector('.dot').classList.toggle('old',h>12);
  validar(true);buildNav();render();sincronizar(false);
  if(!narrow()){const f=visible()[0];if(f&&!S.sel){S.sel=f.k;renderDetail()}else renderDetail()}else renderDetail();
}

/* ===================== navegación ===================== */
const VIEWS=[['partidos','Partidos','ball'],['top','Oportunidades','star'],['plan','Plan de apuestas','wallet'],['resultados','Resultados','check'],['historial','Mi historial','history'],['fiabilidad','Fiabilidad','shield']];
function buildNav(){
  const html=VIEWS.map(([id,l,i])=>`<button class="nav ${S.view===id?'on':''}" data-view="${id}" title="${l}">${ic(i)}<span>${l}</span>${
    id==='historial'&&S.bets.length?`<span class="cnt">${S.bets.length}</span>`:''}</button>`).join('');
  $('nav').innerHTML=html;
  $('bnav').innerHTML=VIEWS.map(([id,l,i])=>`<button class="${S.view===id?'on':''}" data-view="${id}">${ic(i)}${l.split(' ')[0]}</button>`).join('');
}
function setView(v){S.view=v;LS.set('el.view',v);closeDetail();buildNav();render();$('main').scrollTop=0;window.scrollTo(0,0)}

/* ===================== datos visibles ===================== */
function visible(){
  const q=norm(S.q.trim());
  const d0=peruNow(),d1=peruNow(1),d7=peruNow(7);
  return S.data.partidos.filter(m=>S.ligas.has(m.liga)).map(enrich).filter(o=>{
    if(q&&!norm(o.m.home+' '+o.m.away+' '+ligaName(o.m.liga)).includes(q))return false;
    if(S.range==='hoy'&&o.m.pf!==d0)return false;
    if(S.range==='manana'&&o.m.pf!==d1)return false;
    if(S.range==='semana'&&o.m.pf>d7)return false;
    if(S.only&&!o.val)return false;
    return true;
  }).sort((a,b)=>(a.m.pf+(a.m.ph||'')).localeCompare(b.m.pf+(b.m.ph||'')));
}

/* ===================== vistas ===================== */
function render(){renderMain();buildFilters()}
function renderMain(){
  const v={partidos:viewPartidos,top:viewTop,plan:viewPlan,resultados:viewRes,historial:viewHist,fiabilidad:viewFiab}[S.view];
  $('app').classList.toggle('wide',S.view!=='partidos');
  $('main').innerHTML=`<div class="wrap">${v()}</div>`;
  $('slipcnt').textContent=S.slip.size;$('slipcnt').hidden=!S.slip.size;
  if(S.view!=='partidos'&&!narrow()){/* el panel de detalle sigue visible */}
}

function rowHtml(o){
  const {m,c,top,val,hot,k}=o,tri=c['1']&&c['X']&&c['2'];
  const tag=val?`<span class="tag v">Valor +${pc(val.e,1)}</span>`:hot?`<span class="tag w">⚠ edge alto</span>`:'';
  const topTxt=top?`<div class="rc1">${esc(top.cat)}</div><div class="rc2" title="${esc(top.t)}">${esc(top.t)}</div><div style="margin-top:3px">${payPill(top)}</div>`:'';
  return `<button class="mrow ${S.sel===k?'sel':''}" data-k="${esc(k)}" aria-label="${esc(m.home)} contra ${esc(m.away)}">
    <div class="tm"><b class="num">${horaTxt(m)}</b>${m.est==='vivo'?'<span class="live"><i></i>VIVO</span>':tz(m).replace('hora ','')}</div>
    <div class="tn"><span class="lg">${m.est==='vivo'?'<span class="live"><i></i>EN VIVO</span> ':''}<span class="lgt">${horaTxt(m)} ${tz(m).replace('hora ','')} · </span>${esc(ligaName(m.liga))}${m.casa?' · '+esc(m.casa):''}</span><span>${esc(m.home)}</span><span>${esc(m.away)}</span>
      <div class="mob">${top?ring(top.p,30)+`<span>${esc(top.t)}</span>${payPill(top)}`:''}</div></div>
    <div class="tri-c">${tri?`<div class="tri" title="Local / Empate / Visita"><i class="a" style="flex-grow:${c['1'].p}"></i><i class="b" style="flex-grow:${c.X.p}"></i><i class="c" style="flex-grow:${c['2'].p}"></i></div>
      <div class="tripct"><b>${pc(c['1'].p)}</b><span>${pc(c.X.p)}</span><b>${pc(c['2'].p)}</b></div>`:'<span class="mut">—</span>'}</div>
    <div class="rec-c rec">${top?ring(top.p):''}<div class="rt">${topTxt}${tag}</div></div>
    <span class="chev">${ic('chev')}</span></button>`;
}

function kpisHtml(all,rows){
  const withVal=rows.filter(o=>o.val);
  const best=withVal.slice().sort((a,b)=>b.val.e-a.val.e)[0];
  return `<div class="kpi"><div class="l">Partidos</div><div class="v num">${rows.length}</div></div>
    <div class="kpi"><div class="l">Con valor</div><div class="v num good">${withVal.length}</div></div>
    <div class="kpi" title="${best?esc(best.m.home)+' – '+esc(best.m.away)+': '+esc(best.val.t):''}"><div class="l">Mejor valor</div><div class="v num">${best?'+'+pc(best.val.e,1):'—'}</div></div>`;
}
function listHtml(rows){
  if(!S.ligas.size)return `<div class="empty"><b>No hay ligas seleccionadas</b>Marca una o varias ligas en el filtro de la izquierda, o pulsa «todas».</div>`;
  if(!rows.length)return `<div class="empty"><b>Sin resultados</b>Prueba con otro periodo, activa más ligas o quita el filtro “Solo con valor”.</div>`;
  let h='',last='';
  rows.forEach(o=>{if(o.m.pf!==last){last=o.m.pf;h+=`<div class="day">${fmtDay(last)}</div>`}h+=rowHtml(o)});
  return h;
}
function paintDyn(){
  const all=S.data.partidos.filter(m=>S.ligas.has(m.liga)).length,rows=visible();
  if($('kp'))$('kp').innerHTML=kpisHtml(all,rows);
  if($('rows'))$('rows').innerHTML=listHtml(rows);
}
function filtersHtml(){
  const counts={};S.data.partidos.forEach(m=>counts[m.liga]=(counts[m.liga]||0)+1);
  const w=Math.round(S.w*100);
  return `<div class="fl">Periodo</div>
    <div class="fseg">${[['all','Todo'],['hoy','Hoy'],['manana','Mañana'],['semana','7 días']].map(([id,l])=>
      `<button class="${S.range===id?'on':''}" data-range="${id}">${l}</button>`).join('')}</div>
    <div class="fl">Ligas<span><button class="lnk" data-liga-all>todas</button><span class="mut"> · </span><button class="lnk" data-liga-none>ninguna</button></span></div>
    <div class="lgs">${Object.keys(S.data.meta.ligas).map(l=>
      `<button class="lrow ${S.ligas.has(l)?'on':''}" data-liga="${l}" aria-pressed="${S.ligas.has(l)}"><span class="cbx">${S.ligas.has(l)?ic('check'):''}</span><span class="ln">${esc(ligaName(l))}</span><em>${counts[l]||0}</em></button>`).join('')}</div>
    <div class="fl" title="Qué tanto pesa la cuota del mercado frente al modelo propio">Peso del mercado<b class="wv num">${S.wAuto?'auto':w+'%'}</b></div>
    <label class="sw" style="padding:0 8px 6px"><input type="checkbox" data-f="wauto" ${S.wAuto?'checked':''}> Validado por liga (recomendado)</label>
    <input type="range" data-f="w" min="0" max="100" step="5" value="${w}" aria-label="Peso del mercado manual" ${S.wAuto?'disabled':''}>
    <div class="wh">${S.wAuto?'Cada liga usa el peso que mejor predijo en su backtest (50–100%). Donde no hay backtest se usa el manual ('+w+'%).':wHint()}</div>
    <label class="sw" style="margin-top:8px"><input type="checkbox" data-f="only" ${S.only?'checked':''}> Solo con valor</label>`;
}
function buildFilters(){
  const el=$('filters');
  if(el&&S.data)el.innerHTML=`<div class="fh">Filtros</div>`+filtersHtml();
}
const wHint=()=>S.w>=.7?'Recomendado por el backtest':S.w<.4?'Más riesgo: el modelo solo rindió peor que el mercado':'Equilibrado';
function viewPartidos(){
  const all=S.data.partidos.filter(m=>S.ligas.has(m.liga)).length,rows=visible();
  return `<div class="ph compact"><h1>Partidos</h1></div>
  <div class="kpis" id="kp">${kpisHtml(all,rows)}</div>
  <div class="filt-m"><details class="acc"><summary>${ic('chev')}Filtros<span class="sm">periodo · ligas · peso del mercado</span></summary><div class="ab filters">${filtersHtml()}</div></details></div>
  <div id="rows">${listHtml(rows)}</div>`;
}

function viewTop(){
  const rows=S.data.partidos.filter(m=>S.ligas.has(m.liga)&&m.est!=='vivo').map(enrich);
  const items=[];rows.forEach(o=>o.r.forEach(x=>items.push({...x,ob:o})));
  const val=items.filter(x=>x.e!=null&&x.e>=.03&&x.e<=SUSP&&x.p>=.2).sort((a,b)=>b.e-a.e).slice(0,10);
  const conf=items.filter(x=>x.p>=.7&&!x.dud).sort((a,b)=>b.p-a.p).slice(0,10);
  const risky=[];rows.forEach(o=>{if(o.risk[0])risky.push({...o.risk[0],ob:o})});
  risky.sort((a,b)=>b.p-a.p);
  const li=x=>`<button class="mrow" style="grid-template-columns:42px minmax(0,1fr) auto 16px" data-k="${esc(x.ob.k)}">
     ${ring(x.p,40)}<div class="tn"><span>${esc(x.t)}</span><span class="lg">${esc(x.ob.m.home)} – ${esc(x.ob.m.away)} · ${x.ob.m.pf.slice(5)} · ${pc(x.p,1)}</span></div>
     <div style="text-align:right">${x.e!=null?`<div class="num ${x.e>0?'good':'bad'}" style="font-weight:800">${x.e>0?'+':''}${pc(x.e,1)}</div><div>${payPill(x)}</div>`:payPill(x)}</div>
     <span class="chev">${ic('chev')}</span></button>`;
  return `<div class="filt-m"><details class="acc"><summary>${ic('chev')}Filtros<span class="sm">ligas · peso del mercado</span></summary><div class="ab filters">${filtersHtml()}</div></details></div>
  <div class="ph"><h1>Oportunidades</h1><p>Ranking entre todos los partidos cargados. “Valor” compara la probabilidad estimada con la cuota real; “confianza” solo mide qué tan probable es el desenlace.</p></div>
  <div class="callout">${ic('alert')}<div><b>Probabilidad no es valor.</b> Algo con 80% de confianza puede pagar una cuota sin ventaja. Y un edge alto suele ser error del modelo: se excluyen los mayores al 15%.</div></div>
  <div class="two" style="align-items:start">
    <section><div class="sec"><h3>Mayor valor (3–15%)</h3></div>${val.length?val.map(li).join(''):'<div class="empty">Ahora mismo el mercado no ofrece ventajas creíbles.</div>'}</section>
    <section><div class="sec"><h3>Mayor confianza (≥70%)</h3></div>${conf.length?conf.map(li).join(''):'<div class="empty">Sin recomendaciones de alta confianza.</div>'}</section>
  </div>
  <div class="sec" style="margin-top:22px"><h3>Arriesgadas con más opciones de salir (paga ~2.5x o más)</h3></div>
  <div class="two" style="align-items:start">${risky.slice(0,10).map(li).join('')||'<div class="empty">Sin opciones arriesgadas ahora.</div>'}</div>`;
}

/* ===================== guardar y sincronizar el historial ===================== */
const GIST_FILE='edgelab.json',GIST_DESC='EdgeLab historial';
function persistBets(){LS.set('el.bets',S.bets);programarSync()}
let _syncT=0;
function programarSync(){if(!S.sync.tok)return;clearTimeout(_syncT);_syncT=setTimeout(()=>sincronizar(false),2500)}
function mergeBets(local,remote,tl,tr){
  const tomb={...tr};Object.keys(tl).forEach(k=>{tomb[k]=Math.max(tl[k]||0,tr[k]||0)});
  const m=new Map();
  [...remote,...local].forEach(b=>{const o=m.get(b.id);if(!o||(b.u||0)>=(o.u||0))m.set(b.id,b)});
  const bets=[...m.values()].filter(b=>!(tomb[b.id]&&tomb[b.id]>=(b.u||0))).sort((a,b)=>b.ts.localeCompare(a.ts));
  return {bets,tomb};
}
const gh=(path,opt={})=>fetch('https://api.github.com'+path,{...opt,headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+S.sync.tok,'Content-Type':'application/json',...(opt.headers||{})}});
async function sincronizar(manual){
  if(!S.sync.tok||S.sync.busy||window.__EL__)return;
  S.sync.busy=true;
  try{
    if(!S.sync.gist){                                   // buscar o crear el Gist privado
      const l=await gh('/gists?per_page=100');
      if(l.status===401)throw new Error('El token no es válido o caducó.');
      if(!l.ok)throw new Error('GitHub respondió '+l.status);
      const f=(await l.json()).find(g=>g.description===GIST_DESC&&g.files&&g.files[GIST_FILE]);
      if(f)S.sync.gist=f.id;
      else{
        const c=await gh('/gists',{method:'POST',body:JSON.stringify({description:GIST_DESC,public:false,files:{[GIST_FILE]:{content:JSON.stringify({v:1,bets:S.bets,tomb:S.tomb})}}})});
        if(!c.ok)throw new Error('No se pudo crear el Gist ('+c.status+'). El token necesita el permiso «gist».');
        S.sync.gist=(await c.json()).id;
      }
      LS.set('el.gist',S.sync.gist);
    }
    const r=await gh('/gists/'+S.sync.gist);
    if(!r.ok)throw new Error('No se pudo leer el historial en la nube ('+r.status+').');
    const j=await r.json(),file=j.files&&j.files[GIST_FILE];
    let remote={bets:[],tomb:{}};
    if(file){try{remote=JSON.parse(file.content)}catch(e){}}
    const m=mergeBets(S.bets,remote.bets||[],S.tomb,remote.tomb||{});
    const cambioLocal=JSON.stringify(m.bets)!==JSON.stringify(S.bets);
    S.bets=m.bets;S.tomb=m.tomb;LS.set('el.bets',S.bets);LS.set('el.tomb',S.tomb);
    const igual=JSON.stringify((remote.bets||[]).map(b=>b.id+':'+(b.u||0)+b.estado).sort())===JSON.stringify(m.bets.map(b=>b.id+':'+(b.u||0)+b.estado).sort());
    if(!igual){
      const w=await gh('/gists/'+S.sync.gist,{method:'PATCH',body:JSON.stringify({files:{[GIST_FILE]:{content:JSON.stringify({v:1,bets:S.bets,tomb:S.tomb})}}})});
      if(!w.ok)throw new Error('No se pudo guardar en la nube ('+w.status+').');
    }
    S.sync.last=Date.now();LS.set('el.glast',S.sync.last);S.sync.msg='';
    if(cambioLocal){buildNav();if(S.view==='historial'||S.view==='plan')keepScroll(renderMain)}
    if(manual)toast('Historial sincronizado con tu cuenta de GitHub');
  }catch(e){
    S.sync.msg=String(e.message||e).includes('Failed to fetch')?'Sin conexión con GitHub.':String(e.message||e);
    if(manual)toast(S.sync.msg);
  }finally{S.sync.busy=false;if(S.view==='historial')keepScroll(renderMain)}
}
function exportarHistorial(){
  const txt=JSON.stringify({v:1,bets:S.bets,tomb:S.tomb});
  const mostrar=()=>{const t=$('imp');if(t){t.value=txt;t.focus();t.select()}};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(()=>toast('Historial copiado: pégalo en el otro dispositivo o sitio'),()=>{mostrar();toast('Selecciona y copia el texto del recuadro')})}
  else{mostrar();toast('Selecciona y copia el texto del recuadro')}
}
function importarHistorial(){
  const t=$('imp');if(!t||!t.value.trim())return toast('Pega primero el historial copiado');
  try{
    const j=JSON.parse(t.value),m=mergeBets(S.bets,j.bets||[],S.tomb,j.tomb||{});
    const nuevas=m.bets.length-S.bets.length;
    S.bets=m.bets;S.tomb=m.tomb;LS.set('el.tomb',S.tomb);persistBets();validar(false);buildNav();render();
    toast(nuevas>0?`Importadas ${nuevas} apuesta${nuevas>1?'s':''}`:'Historial actualizado');
  }catch(e){toast('El texto no es un historial válido')}
}
function panelSync(){
  const st=S.sync,emb=!!window.__EL__;
  let h=`<div class="card" style="margin-bottom:10px"><b style="font-size:13px">Guardar y sincronizar tu historial</b>`;
  if(emb)h+=`<div class="note">Esta versión (claude.ai) guarda el historial solo en este navegador y no puede sincronizarlo. Para tenerlo en todos tus dispositivos usa <a href="https://atgo44.github.io/edgelab/" target="_blank" rel="noopener" style="color:var(--ac)">atgo44.github.io/edgelab</a>: copia tu historial aquí y pégalo allí.</div>`;
  else if(st.tok)h+=`<div class="row" style="margin-top:8px"><span class="pill"><span class="dot ${st.msg?'old':''}"></span>${st.msg?esc(st.msg):'Sincronizado con tu Gist privado de GitHub'}${st.last&&!st.msg?' · '+ago(new Date(st.last).toISOString()):''}</span>
      <button class="btn sm" id="sync-now">Sincronizar ahora</button><button class="btn ghost sm" id="sync-off">Desconectar</button></div>
      <div class="note">El historial se guarda en un Gist <b>privado</b> de tu cuenta y se une automáticamente entre tus dispositivos. El token queda solo en este navegador.</div>`;
  else h+=`<div class="note">Tu historial se guarda en este navegador. Para verlo desde cualquier dispositivo, conéctalo a tu cuenta de GitHub (se guarda en un Gist privado tuyo):</div>
      <ol class="tx2" style="padding-left:18px;font-size:13px;line-height:1.7;margin:6px 0">
        <li>Crea un token: <a href="https://github.com/settings/tokens/new?scopes=gist&description=EdgeLab" target="_blank" rel="noopener" style="color:var(--ac)">github.com/settings/tokens/new</a>. Debe tener <b>solo</b> el permiso «gist».</li>
        <li>Pégalo aquí y pulsa Conectar.</li></ol>
      <div class="row"><input class="inp" id="gtok" type="password" placeholder="ghp_… (permiso gist)" autocomplete="off" style="width:min(280px,100%);text-align:left"><button class="btn sm" id="sync-on">Conectar</button></div>
      ${st.msg?`<div class="note" style="color:var(--red)">${esc(st.msg)}</div>`:''}`;
  h+=`<details class="acc" style="margin-top:10px"><summary>${ic('chev')}Copiar / importar historial<span class="sm">pasar apuestas entre sitios o dispositivos</span></summary><div class="ab">
      <div class="row"><button class="btn sm" id="exp-copy">Copiar mi historial</button></div>
      <div class="note">Pega aquí un historial copiado en otro sitio o dispositivo y pulsa Importar (se une al que ya tienes, sin duplicar).</div>
      <textarea id="imp" rows="3" class="inp" style="width:100%;height:auto;padding:8px;text-align:left;font-family:monospace;font-size:12px" placeholder="Pega aquí el historial copiado"></textarea>
      <div class="row" style="margin-top:6px"><button class="btn sm ghost" id="imp-go">Importar</button></div></div></details></div>`;
  return h;
}

/* ===================== análisis avanzado de rentabilidad ===================== */
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const ROI=arr=>{const st=arr.reduce((a,b)=>a+b.monto,0);return st?arr.reduce((a,b)=>a+profitOf(b),0)/st:0};
function roiCI(done){                      // intervalo de confianza 95% del ROI (bootstrap)
  const n=done.length;if(n<5)return null;
  const st=done.map(b=>b.monto),pf=done.map(profitOf),r=rng(n*7919+13),v=[];
  for(let i=0;i<1500;i++){let s0=0,p0=0;for(let j=0;j<n;j++){const k=Math.floor(r()*n);s0+=st[k];p0+=pf[k]}v.push(s0?p0/s0:0)}
  v.sort((a,b)=>a-b);return {lo:v[37],hi:v[1462]};
}
function azar(done){                       // acierto real frente al que implican las cuotas
  const n=done.length;if(!n)return null;
  const pi=done.map(b=>1/b.cuota),ex=pi.reduce((a,x)=>a+x,0),va=pi.reduce((a,x)=>a+x*(1-x),0),w=done.filter(b=>b.estado==='ganada').length;
  return {n,exp:ex/n,real:w/n,z:va>0?(w-ex)/Math.sqrt(va):0};
}
function cierreDe(l){                      // última cuota máxima antes del inicio (cuota de cierre)
  const id=l.id||l.sel;if(!['1','X','2','O2.5','U2.5'].includes(id))return null;
  const m=S.todos.find(x=>x.home===l.home&&x.away===l.away&&x.fecha===l.fecha&&(!l.liga||x.liga===l.liga));
  if(!m||!m.sel||!m.sel[id]||!m.sel[id].max)return null;
  return koMs(m)<=Date.now()?m.sel[id].max:null;
}
function clvDe(b){
  const v=b.legs.map(l=>{const c=cierreDe(l);return c&&l.o?l.o/c:null});
  return v.length&&v.every(x=>x!=null)?v.reduce((a,x)=>a*x,1)-1:null;
}
function clvStats(done){const v=done.map(clvDe).filter(x=>x!=null);return {n:v.length,avg:v.length?v.reduce((a,x)=>a+x,0)/v.length:null,pos:v.filter(x=>x>0).length}}
const ptsPct=x=>(x>=0?'+':'')+(x*100).toFixed(1)+'%';
function ventajaHtml(done){
  const n=done.length;
  if(!n)return `<div class="sec"><h3>¿Es real tu ventaja?</h3><div class="card"><div class="mut">Aún no hay apuestas cerradas. Cuando haya resultados verás aquí si tu rentabilidad es real o suerte (margen de error, CLV y comparación con el azar).</div></div></div>`;
  const ci=roiCI(done),az=azar(done),cl=clvStats(done),roi=ROI(done);
  let ver,cls;
  if(n<30){ver=`Muestra insuficiente (${n} de 30 apuestas): cualquier resultado puede ser suerte.`;cls='info'}
  else if(ci&&ci.lo>0){ver='Ventaja probable: el ROI es positivo incluso en el escenario pesimista.';cls='good'}
  else if(ci&&ci.hi<0){ver='Pérdida probable: incluso en el mejor escenario el ROI es negativo. Revisa tu método.';cls='bad'}
  else{ver='No concluyente: el margen de error incluye ganar y perder. Hace falta más muestra.';cls='warn'}
  const hw=ci?(ci.hi-ci.lo)/2:null,need=ci&&hw>.05?Math.ceil(n*Math.pow(hw/.05,2)):null;
  const t=(l,v,s2,c='')=>`<div class="vt"><div class="l">${l}</div><div class="v num ${c}">${v}</div><div class="s">${s2}</div></div>`;
  return `<div class="sec"><h3>¿Es real tu ventaja?</h3><div class="card">
    <div class="vgrid">
      ${t('ROI',ptsPct(roi),ci?`margen de error 95%: ${ptsPct(ci.lo)} a ${ptsPct(ci.hi)}`:'pocas apuestas',roi>=0?'good':'bad')}
      ${t('Acierto real',pc(az.real,0),`las cuotas implicaban ${pc(az.exp,0)} · z = ${az.z.toFixed(1)}`,az.z>1.64?'good':az.z<-1.64?'bad':'')}
      ${t('CLV medio',cl.avg==null?'—':ptsPct(cl.avg),cl.n?`${cl.pos} de ${cl.n} apuestas mejoraron la cuota de cierre`:'sin cuota de cierre disponible aún',cl.avg>0?'good':cl.avg<0?'bad':'')}
      ${t('Para concluir',need?`~${need}`:'listo','apuestas necesarias para un margen de ±5%')}
    </div>
    <div class="verdict ${cls==='info'?'':cls}" style="margin:12px 0 0">${ic('info')}<span>${ver}</span></div>
    <div class="note">CLV: si tomas cuotas mejores que las de cierre del mercado, a largo plazo el ROI suele seguir; es más fiable que unos pocos resultados. «z» compara tu acierto con el que daría apostar sin ventaja: por encima de 1.6 o por debajo de −1.6 ya es relevante.</div></div></div>`;
}

/* ---------- control de riesgo ---------- */
function estadoRiesgo(extra=0){
  const b0=S.bank0!=null?S.bank0:S.bank,cer=S.bets.filter(closed),saldo=Math.max(1,b0+cer.reduce((a,b)=>a+profitOf(b),0));
  const dayOf=b=>new Date(Date.parse(b.ts)-5*3600e3).toISOString().slice(0,10),hoy=peruNow(),d7=peruNow(-6);
  const pDia=cer.filter(b=>dayOf(b)===hoy).reduce((a,b)=>a+profitOf(b),0),pSem=cer.filter(b=>dayOf(b)>=d7).reduce((a,b)=>a+profitOf(b),0);
  const exp=S.bets.filter(b=>b.estado==='pendiente').reduce((a,b)=>a+b.monto,0)+extra,R=S.riesgo,al=[];
  if(-pDia>saldo*R.dia/100)al.push(`Ya perdiste ${(-pDia).toFixed(0)} hoy (tu límite diario es ${R.dia}% del saldo).`);
  if(-pSem>saldo*R.sem/100)al.push(`Pierdes ${(-pSem).toFixed(0)} en 7 días (límite semanal ${R.sem}%).`);
  if(exp>saldo*R.exp/100)al.push(`Tendrías ${exp.toFixed(0)} en juego, ${pc(exp/saldo,0)} del saldo (límite ${R.exp}%).`);
  return {saldo,pDia,pSem,exp,al};
}
function riesgoBanner(){
  const r=estadoRiesgo();
  return r.al.length?`<div class="callout" style="margin-bottom:12px">${ic('alert')}<div><b>Control de riesgo:</b> ${r.al.map(esc).join(' ')} Considera parar o reducir montos.</div></div>`:'';
}
function riesgoHtml(){
  const r=estadoRiesgo(),R=S.riesgo;
  const barra=(l,v,lim)=>{const w=Math.min(100,Math.max(0,v/(r.saldo*lim/100))*100);
    return `<div class="bt-row"><span>${l}</span><div class="bar2"><i style="width:${w}%;background:${w>=100?'var(--red)':w>=70?'var(--warn)':'var(--good)'}"></i></div><b class="num">${v.toFixed(0)} / ${(r.saldo*lim/100).toFixed(0)}</b></div>`};
  return `<div class="sec"><h3>Control de riesgo</h3><div class="card">
    ${barra('Pérdida de hoy',Math.max(0,-r.pDia),R.dia)}${barra('Pérdida 7 días',Math.max(0,-r.pSem),R.sem)}${barra('En juego',r.exp,R.exp)}
    <div class="row" style="margin-top:10px;gap:14px">
      <label class="mut" style="font-size:12px">Pérdida diaria máx. (% saldo)<br><input class="inp num" type="number" min="0" step="1" data-riesgo="dia" value="${R.dia}"></label>
      <label class="mut" style="font-size:12px">Pérdida semanal máx. (%)<br><input class="inp num" type="number" min="0" step="1" data-riesgo="sem" value="${R.sem}"></label>
      <label class="mut" style="font-size:12px">En juego máx. (%)<br><input class="inp num" type="number" min="0" step="1" data-riesgo="exp" value="${R.exp}"></label></div>
    <div class="note">Si registras una apuesta que supera un límite, te lo avisará y tendrás que confirmar. Es un freno, no una prohibición.</div></div></div>`;
}

/* ---------- calibración por tramos ---------- */
function calibHtml(done){
  const B=[[0,.35,'menos de 35%'],[.35,.5,'35–50%'],[.5,.65,'50–65%'],[.65,.8,'65–80%'],[.8,1.01,'80% o más']];
  const rows=B.map(([a,b,l])=>{const x=done.filter(d=>d.p>=a&&d.p<b);if(!x.length)return '';
    const e=x.reduce((q,d)=>q+d.p,0)/x.length,r=x.filter(d=>d.estado==='ganada').length/x.length;
    return `<div class="gr"><div class="gl">${l}<small>${x.length} apuestas${x.length<8?' · muestra pequeña':''}</small></div>
      <div class="gb" title="esperado ${pc(e,0)}"><i style="width:${e*100}%;background:var(--draw)"></i></div><b class="num">${pc(e,0)}</b>
      <div class="gb" title="real ${pc(r,0)}"><i style="width:${r*100}%;background:${r>=e?'var(--good)':'var(--red)'}"></i></div><b class="num ${r>=e?'good':'bad'}">${pc(r,0)}</b></div>`}).join('');
  return `<div class="sec"><h3>Calibración por tramos de probabilidad</h3><div class="card"><div class="mut" style="font-size:12px;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(40px,1fr) 46px minmax(40px,1fr) 46px;gap:10px"><span></span><span>Esperado</span><span></span><span>Real</span><span></span></div>${rows||'<div class="mut">Sin datos.</div>'}
    <div class="note">Si en un tramo lo real queda por debajo de lo esperado, el modelo exagera en esa zona: pide más edge o sube el peso del mercado.</div></div></div>`;
}

/* ---------- simulador "¿y si…?" ---------- */
function simHtml(done){
  const f=S.sim,b0=S.bank0!=null?S.bank0:S.bank;
  const cats=[...new Set(done.flatMap(b=>b.legs.map(catOfLeg)))].sort(),ligas=[...new Set(done.map(b=>b.legs[0]&&b.legs[0].liga).filter(Boolean))],casas=[...new Set(done.map(b=>b.casa).filter(Boolean))];
  let sel=done.filter(b=>{
    if(f.tipo==='simples'&&b.legs.length!==1)return false;
    if(f.tipo==='comb'&&b.legs.length===1)return false;
    const e=b.p*b.cuota-1;if(e<f.emin/100||e>f.emax/100)return false;
    if(b.p<f.pmin/100)return false;
    if(f.cat&&!b.legs.some(l=>catOfLeg(l)===f.cat))return false;
    if(f.liga&&!b.legs.some(l=>l.liga===f.liga))return false;
    if(f.casa&&(b.casa||'')!==f.casa)return false;
    if(b.cuota<f.cmin||b.cuota>f.cmax)return false;
    return true;
  });
  const stake=b=>f.stake==='fijo'?f.fijo:f.stake==='pct'?b0*f.pct/100:f.stake==='kelly'?b0*kelly(b.p,b.cuota,.03):b.monto;
  sel=sel.map(b=>({...b,monto:stake(b)})).filter(b=>b.monto>0);
  const n=sel.length,st=sel.reduce((a,b)=>a+b.monto,0),pf=sel.reduce((a,b)=>a+profitOf(b),0),w=sel.filter(b=>b.estado==='ganada').length;
  const ci=roiCI(sel),roi0=ROI(done),pf0=done.reduce((a,b)=>a+profitOf(b),0);
  const opt=(arr,cur,all)=>`<option value="">${all}</option>`+arr.map(v=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(v)}</option>`).join('');
  const num=(k,l,st2='')=>`<label class="mut" style="font-size:12px">${l}<br><input class="inp num" type="number" data-sim="${k}" value="${f[k]}" ${st2}></label>`;
  const selc=(k,l,o)=>`<label class="mut" style="font-size:12px">${l}<br><select class="inp" data-sim="${k}" style="width:auto;text-align:left">${o}</select></label>`;
  return `<div class="sec"><h3>Simulador: ¿qué habría pasado si…?</h3><div class="card">
    <div class="row" style="gap:12px;align-items:flex-end">
      ${selc('tipo','Tipo',['todas:Todas','simples:Solo simples','comb:Solo combinadas'].map(x=>{const[v,l]=x.split(':');return `<option value="${v}" ${f.tipo===v?'selected':''}>${l}</option>`}).join(''))}
      ${selc('cat','Mercado',opt(cats,f.cat,'Todos'))}
      ${ligas.length?selc('liga','Liga',opt(ligas,f.liga,'Todas').replace(/<option value="([^"]+)"([^>]*)>([^<]+)</g,(m,v,a,t)=>v?`<option value="${v}"${a}>${esc(ligaName(v))}<`:m)):''}
      ${casas.length?selc('casa','Casa',opt(casas,f.casa,'Todas')):''}
      ${num('emin','Edge mín. %','style="width:80px"')}${num('emax','Edge máx. %','style="width:80px"')}
      ${num('pmin','Prob. mín. %','style="width:80px"')}${num('cmin','Cuota mín.','step="0.1" style="width:80px"')}${num('cmax','Cuota máx.','step="0.1" style="width:80px"')}
      ${selc('stake','Monto',['actual:El que usé','fijo:Fijo','pct:% de la banca inicial','kelly:Kelly 25% (tope 3%)'].map(x=>{const[v,l]=x.split(':');return `<option value="${v}" ${f.stake===v?'selected':''}>${l}</option>`}).join(''))}
      ${f.stake==='fijo'?num('fijo','Monto fijo','style="width:80px"'):''}${f.stake==='pct'?num('pct','% banca','step="0.5" style="width:80px"'):''}
    </div>
    <div class="vgrid" style="margin-top:12px">
      <div class="vt"><div class="l">Apuestas</div><div class="v num">${n}<small class="mut"> de ${done.length}</small></div><div class="s">que cumplen la regla</div></div>
      <div class="vt"><div class="l">Ganancia</div><div class="v num ${pf>=0?'good':'bad'}">${money(pf)}</div><div class="s">tu real: ${money(pf0)}</div></div>
      <div class="vt"><div class="l">ROI simulado</div><div class="v num ${pf>=0?'good':'bad'}">${st?ptsPct(pf/st):'—'}</div><div class="s">tu real: ${ptsPct(roi0)}${ci&&n>=5?` · margen ${ptsPct(ci.lo)} a ${ptsPct(ci.hi)}`:''}</div></div>
      <div class="vt"><div class="l">Acierto</div><div class="v num">${n?pc(w/n,0):'—'}</div><div class="s">${w} de ${n}</div></div>
    </div>
    <div class="note">${n<30?'Con menos de 30 apuestas esto es muy poco fiable: elegir reglas mirando resultados pasados «se ajusta» al azar. Úsalo para formular una hipótesis y confírmala con apuestas nuevas.':'Cuidado: una regla que funciona en el pasado no garantiza el futuro. Confírmala con apuestas nuevas antes de cambiar tu método.'}</div>
    <div class="row" style="margin-top:8px"><button class="btn ghost sm" id="sim-reset">Restablecer</button></div></div></div>`;
}

/* ---------- resumen semanal y exportación ---------- */
function semanaHtml(done){
  const dayOf=b=>new Date(Date.parse(b.ts)-5*3600e3).toISOString().slice(0,10);
  const a=peruNow(-6),b=peruNow(-13),pasada=S.bets.filter(x=>closed(x)&&dayOf(x)>=a),previa=S.bets.filter(x=>closed(x)&&dayOf(x)>=b&&dayOf(x)<a);
  const blk=(t,arr)=>{const st=arr.reduce((q,x)=>q+x.monto,0),pf=arr.reduce((q,x)=>q+profitOf(x),0),w=arr.filter(x=>x.estado==='ganada').length;
    return `<div class="vt"><div class="l">${t}</div><div class="v num ${pf>=0?'good':'bad'}">${arr.length?money(pf):'—'}</div><div class="s">${arr.length} apuestas · ${arr.length?`${w} ganadas · ROI ${st?ptsPct(pf/st):'—'}`:'sin cerrar'}</div></div>`};
  return `<div class="sec"><h3>Resumen semanal</h3><div class="card"><div class="vgrid">${blk('Últimos 7 días',pasada)}${blk('7 días anteriores',previa)}</div>
    <div class="row" style="margin-top:10px"><button class="btn ghost sm" id="exp-csv">Exportar apuestas (CSV)</button></div></div></div>`;
}
function exportarCSV(){
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const cols=['fecha','casa','motivo','selecciones','cuota','prob_modelo','monto','estado','ganancia','clv'];
  const filas=S.bets.map(b=>[b.ts.slice(0,10),b.casa||'',b.tag||'',b.legs.map(l=>`${l.home}-${l.away}: ${l.apuesta}`).join(' | '),b.cuota.toFixed(2),b.p.toFixed(3),b.monto,b.estado,
    b.estado==='pendiente'?'':profitOf(b).toFixed(2),clvDe(b)==null?'':(clvDe(b)*100).toFixed(1)+'%'].map(q).join(','));
  const csv=[cols.join(','),...filas].join('\n');
  try{
    if(!window.__EL__){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));a.download='edgelab_apuestas.csv';document.body.appendChild(a);a.click();a.remove();toast('Archivo descargado');return}
  }catch(e){}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(csv).then(()=>toast('CSV copiado al portapapeles'),()=>toast('No se pudo copiar'));
  else toast('Descarga no disponible en esta versión');
}

/* ---------- rentabilidad ---------- */
const closed=b=>b.estado==='ganada'||b.estado==='perdida';
const profitOf=b=>b.estado==='ganada'?b.monto*(b.cuota-1):b.estado==='perdida'?-b.monto:0;
const money=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(2);
function grp(done,fn){
  const m=new Map();
  done.forEach(b=>{const k=fn(b);if(k==null)return;const g=m.get(k)||{k,n:0,w:0,stake:0,profit:0,exp:0};
    g.n++;g.w+=b.estado==='ganada'?1:0;g.stake+=b.monto;g.profit+=profitOf(b);g.exp+=b.p;m.set(k,g)});
  return [...m.values()].map(g=>({...g,roi:g.stake?g.profit/g.stake:0,hit:g.w/g.n,expHit:g.exp/g.n})).sort((a,b)=>b.roi-a.roi);
}
const catOfLeg=l=>l.cat||(['1','X','2'].includes(l.sel)?'Resultado':['O2.5','U2.5'].includes(l.sel)?'Goles del partido':'Otros');
const srcOf=b=>{const s=b.legs.map(l=>l.src||'casa');return s.includes('estimada')?'Cuota estimada':s.includes('tuya')?'Cuota escrita por ti':'Cuota de la casa'};
function groupTables(done){
  return [
    ['Por tipo de apuesta',grp(done,b=>b.legs.length===1?'Simples':b.legs.length===2?'Combinadas de 2':'Combinadas de 3+')],
    ['Por mercado (simples)',grp(done.filter(b=>b.legs.length===1),b=>catOfLeg(b.legs[0]))],
    ['Por liga',grp(done,b=>b.legs.length===1&&b.legs[0].liga?ligaName(b.legs[0].liga):null)],
    ['Por cuota',grp(done,b=>b.cuota<1.5?'Menos de 1.50':b.cuota<2?'1.50 – 1.99':b.cuota<3?'2.00 – 2.99':'3.00 o más')],
    ['Por confianza del modelo',grp(done,b=>b.p>=.7?'Alta (≥70%)':b.p>=.55?'Media (55–70%)':'Baja (<55%)')],
    ['Por origen de la cuota',grp(done,srcOf)],
    ['Por casa de apuestas',grp(done,b=>b.casa||'Sin dato')],
    ['Por motivo',grp(done,b=>b.tag||'Sin dato')],
  ];
}
function insights(done,bank){
  const out=[],n=done.length;
  if(n<10)out.push(['info',`Solo tienes ${n} apuestas cerradas. Con menos de 30 las conclusiones no son fiables: sigue registrando.`]);
  if(!n)return out;
  const tipo=grp(done,b=>b.legs.length===1?'S':'C'),sim=tipo.find(g=>g.k==='S'),com=tipo.find(g=>g.k==='C');
  if(sim&&com&&sim.n>=3&&com.n>=3&&com.roi<sim.roi-.1)out.push(['warn',`Las combinadas rinden peor (ROI ${pc(com.roi,0)}) que las simples (${pc(sim.roi,0)}). Prioriza apuestas simples: cada selección extra multiplica la varianza.`]);
  const mer=grp(done.filter(b=>b.legs.length===1),b=>catOfLeg(b.legs[0])).filter(g=>g.n>=3);
  if(mer.length){
    const best=mer[0],worst=mer[mer.length-1];
    if(best.roi>.05)out.push(['good',`Tu mejor mercado es «${best.k}»: ROI ${pc(best.roi,0)} en ${best.n} apuestas. Dale prioridad, sin subir el monto por apuesta.`]);
    if(worst.roi<-.15&&worst!==best)out.push(['bad',`«${worst.k}» te está costando: ROI ${pc(worst.roi,0)} en ${worst.n} apuestas. Reduce o evita ese mercado hasta tener más datos.`]);
  }
  const hit=done.filter(b=>b.estado==='ganada').length/n,exp=done.reduce((a,b)=>a+b.p,0)/n;
  if(n>=15&&exp-hit>.08)out.push(['warn',`Aciertas ${pc(hit,0)} pero el modelo esperaba ${pc(exp,0)}: está sobreconfiado. Sube el peso del mercado en los filtros y exige más edge.`]);
  const avg=done.reduce((a,b)=>a+b.monto,0)/n;
  if(bank>0&&avg/bank>.05)out.push(['warn',`Tu monto medio es ${pc(avg/bank,1)} de la banca. Lo habitual es 1–3% por apuesta para sobrevivir a las rachas malas.`]);
  const est=done.filter(b=>srcOf(b)==='Cuota estimada').length;
  if(est)out.push(['info',`${est} apuestas usaron cuota estimada (no la real). Registra la cuota que te pagó la casa para medir bien la rentabilidad.`]);
  const ord=done.slice().sort((a,b)=>a.ts.localeCompare(b.ts));
  let cum=0,peak=0,dd=0,streak=0;
  ord.forEach(b=>{cum+=profitOf(b);peak=Math.max(peak,cum);dd=Math.max(dd,peak-cum)});
  for(let i=ord.length-1;i>=0&&ord[i].estado==='perdida';i--)streak++;
  if(bank>0&&dd/bank>.2)out.push(['warn',`Tu peor caída fue ${dd.toFixed(0)} (${pc(dd/bank,0)} de la banca). Revisa el tamaño de tus montos.`]);
  if(streak>=4)out.push(['warn',`Llevas ${streak} pérdidas seguidas. Pausa, revisa las apuestas y no subas el monto para recuperar.`]);
  if(!out.length)out.push(['good','Sin alertas: tus números van en orden. Sigue registrando para tener más muestra.']);
  return out;
}
function chartSvg(vals){
  const W=1000,H=160,P=26,mn=Math.min(0,...vals),mx0=Math.max(0,...vals),mx=mx0===mn?mn+1:mx0;
  const x=i=>P+i*(W-2*P)/Math.max(1,vals.length-1),y=v=>H-P-(v-mn)/(mx-mn)*(H-2*P);
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`),last=vals[vals.length-1];
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Evolución de la ganancia acumulada">
    <line x1="${P}" y1="${y(0)}" x2="${W-P}" y2="${y(0)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4 4"/>
    <polygon points="${x(0)},${y(0)} ${pts.join(' ')} ${x(vals.length-1)},${y(0)}" fill="${last>=0?'var(--good)':'var(--bad)'}" opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${last>=0?'var(--good)':'var(--bad)'}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(vals.length-1)}" cy="${y(last)}" r="4.5" fill="${last>=0?'var(--good)':'var(--bad)'}"/>
    <text x="${P}" y="${H-6}" font-size="11" fill="var(--mut)">0</text>
    <text x="${W-P}" y="${Math.max(12,y(last)-9)}" font-size="12" font-weight="700" text-anchor="end" fill="${last>=0?'var(--good)':'var(--bad)'}">${money(last)}</text></svg>`;
}
function viewHist(){
  const done=S.bets.filter(closed),pend=S.bets.filter(b=>b.estado==='pendiente');
  const stake=done.reduce((a,b)=>a+b.monto,0),profit=done.reduce((a,b)=>a+profitOf(b),0),won=done.filter(b=>b.estado==='ganada').length,n=done.length;
  const enJuego=pend.reduce((a,b)=>a+b.monto,0),b0=S.bank0!=null?S.bank0:S.bank,saldo=b0+profit;
  let h=`<div class="ph"><h1>Mi historial</h1><p>Tus apuestas se guardan solo en este navegador y se liquidan solas con los resultados publicados. Aquí ves cuánto ganas o pierdes y dónde mejorar.</p></div>
  <div class="kpis kpis-big">
    <div class="kpi"><div class="l">Beneficio</div><div class="v num ${profit>=0?'good':'bad'}">${money(profit)}</div></div>
    <div class="kpi"><div class="l">ROI</div><div class="v num ${profit>=0?'good':'bad'}">${stake?pc(profit/stake,1):'—'}</div></div>
    <div class="kpi"><div class="l">Aciertos</div><div class="v num">${n?`${won}/${n}`:'—'}</div></div>
    <div class="kpi"><div class="l">Apostado (cerradas)</div><div class="v num">${stake.toFixed(0)}</div></div>
    <div class="kpi"><div class="l">En juego</div><div class="v num">${enJuego.toFixed(0)}</div></div>
    <div class="kpi"><div class="l">Saldo estimado</div><div class="v num">${saldo.toFixed(2)}</div></div>
  </div>
  <div class="card row" style="gap:14px;margin-bottom:8px"><label class="mut" style="font-size:12px">Banca inicial<br><input class="inp num" type="number" min="0" data-f="bank0" value="${b0}" style="width:110px"></label>
    <span class="mut" style="font-size:12px;max-width:60ch">Saldo estimado = banca inicial + beneficio de apuestas cerradas. Disponible para apostar: <b class="num" style="color:var(--tx)">${(saldo-enJuego).toFixed(2)}</b> (descontando lo que está en juego).<br>Validación automática activa: se comprueba cada minuto${S.res&&S.res.length?` con ${S.res.length} resultados recientes`:''}${window.__EL__?'':' y los datos se recargan cada 3 minutos'}. Datos generados ${ago(S.data.meta.generado)}.</span></div>`;
  h+=riesgoBanner()+ventajaHtml(done)+riesgoHtml();
  if(n){
    const ord=done.slice().sort((a,b)=>a.ts.localeCompare(b.ts));
    let c=0;const vals=[0];ord.forEach(b=>{c+=profitOf(b);vals.push(c)});
    h+=`<div class="sec"><h3>Evolución de la ganancia</h3><div class="card">${chartSvg(vals)}</div></div>
    <div class="sec"><h3>Opciones de mejora</h3><div class="card">${insights(done,saldo>0?saldo:b0).map(([l,t])=>`<div class="ins ${l}"><span class="ii">${l==='good'?'✓':l==='bad'?'✕':l==='warn'?'!':'i'}</span><span>${esc(t)}</span></div>`).join('')}</div></div>
    <div class="sec"><h3>Dónde ganas y dónde pierdes</h3><div class="d2" style="align-items:start">${groupTables(done).filter(g=>g[1].length).map(([t,rows])=>`<div class="card"><b style="font-size:13px">${t}</b>
      ${rows.map(g=>{const w=Math.min(100,Math.abs(g.roi)*100*1.5);
        return `<div class="gr"><div class="gl" title="${esc(g.k)}">${esc(g.k)}<small>${g.n} ap. · acierto ${pc(g.hit,0)} (esperado ${pc(g.expHit,0)})${g.n<5?' · muestra pequeña':''}</small></div>
          <div class="gb"><i style="width:${w}%;background:${g.roi>=0?'var(--good)':'var(--bad)'}"></i></div><b class="num ${g.roi>=0?'good':'bad'}">${g.roi>=0?'+':''}${pc(g.roi,0)}</b></div>`}).join('')}</div>`).join('')}</div></div>`;
  }
  if(n)h+=calibHtml(done)+simHtml(done)+semanaHtml(done);
  h+=`<div class="sec"><h3>Apuestas guardadas</h3></div>`+panelSync();
  if(!S.bets.length)return h+`<div class="empty"><b>Aún no hay apuestas</b>Añade selecciones a la boleta y guárdalas, o registra el plan de apuestas.</div>`;
  h+=`<div class="card" style="padding:4px 4px"><div class="scroll"><table class="tbl"><thead><tr><th>Fecha</th><th>Selecciones</th><th>Cuota</th><th>Prob.</th><th>Monto</th><th>Ganancia</th><th>Estado</th><th></th></tr></thead><tbody>
  ${S.bets.map(b=>{const pf=profitOf(b);return `<tr class="b-${b.estado}"><td class="num">${new Date(b.ts).toLocaleDateString('es')}</td>
    <td>${b.legs.map(l=>{const x=S.res.filter(r=>r.h===l.home&&r.a===l.away&&r.d>=l.fecha).pop(),h=x?legHit(l,x):null;return `<div class="lgx ${h===true?'ok':h===false?'ko':'na'}" title="${h===true?'Acertó':h===false?'No salió':'Pendiente'}"><span class="lgi">${h===true?'✓':h===false?'✕':'•'}</span> ${esc(l.home)} – ${esc(l.away)} <span class="mut">· ${esc(l.apuesta)}${l.o?' @'+(+l.o).toFixed(2):''}</span></div>`}).join('')}</td>
    <td class="num">${b.cuota.toFixed(2)}</td><td class="num">${pc(b.p,1)}</td><td class="num">${b.monto}</td>
    <td class="num ${pf>0?'good':pf<0?'bad':'mut'}"><b>${b.estado==='pendiente'?'—':money(pf)}</b>${b.estado==='pendiente'?`<div class="mut" style="font-size:11px">posible ${money(b.monto*(b.cuota-1))}</div>`:''}</td>
    <td><select class="inp" data-bet="${b.id}" aria-label="Estado de la apuesta" style="width:auto;text-align:left">${['pendiente','ganada','perdida','anulada'].map(e=>`<option ${e===b.estado?'selected':''}>${e}</option>`).join('')}</select>${b.estado==='pendiente'?pendNote(b):''}</td>
    <td><button class="iconbtn" data-del="${b.id}" aria-label="Eliminar apuesta" style="width:30px;height:30px">${ic('trash')}</button></td></tr>`}).join('')}
  </tbody></table></div></div>`;
  return h;
}

/* ---------- plan de apuestas según saldo ---------- */
const PLAN_EDGE=.05; // en el backtest, exigir 3% dio ROI negativo en varias ligas; 5% fue el umbral más estable
const PERFILES={con:{n:'Conservador',frac:.10,cap:.01,exp:.06},mod:{n:'Moderado',frac:.25,cap:.02,exp:.12},agr:{n:'Agresivo',frac:.50,cap:.03,exp:.20}};
function planPicks(saldo){
  const P=PERFILES[S.plan.perfil]||PERFILES.mod;
  const cands=[];
  S.data.partidos.filter(m=>S.ligas.has(m.liga)&&m.est!=='vivo').forEach(m=>{
    const c=compute(m);let best=null;
    catOpts(m,c,false).forEach(k=>{if(k.cat==='Doble oportunidad')return;
      k.opts.forEach(x=>{if(x.o&&x.e!=null&&x.e>=PLAN_EDGE&&x.e<=SUSP&&x.p>=.25&&x.p<=TRIV&&!x.dud&&(!best||x.e>best.e))best={...x,cat:k.cat,m}})});
    if(best)cands.push(best);
  });
  const f=x=>Math.max(0,Math.min(P.cap,(x.p*x.o-1)/(x.o-1)*P.frac));
  cands.forEach(x=>{x.f=f(x)});
  const top=cands.filter(x=>x.f>0).sort((a,b)=>b.f*b.e-a.f*a.e).slice(0,S.plan.n);
  let tot=top.reduce((a,x)=>a+x.f,0);
  const k=tot>P.exp?P.exp/tot:1;
  top.forEach(x=>{x.monto=Math.max(1,Math.round(saldo*x.f*k));x.ev=x.monto*x.e});
  return {P,top,invert:top.reduce((a,x)=>a+x.monto,0),ev:top.reduce((a,x)=>a+x.ev,0)};
}
function viewPlan(){
  const done=S.bets.filter(closed),pend=S.bets.filter(b=>b.estado==='pendiente');
  const profit=done.reduce((a,b)=>a+profitOf(b),0),b0=S.bank0!=null?S.bank0:S.bank;
  const disp=Math.max(0,b0+profit-pend.reduce((a,b)=>a+b.monto,0));
  const saldo=S.plan.saldo!=null?S.plan.saldo:Math.round(disp);
  const pl=planPicks(saldo),P=pl.P;
  const ya=k=>S.bets.some(b=>b.estado==='pendiente'&&b.legs.length===1&&b.legs[0].home===k.m.home&&b.legs[0].away===k.m.away&&(b.legs[0].id||b.legs[0].sel)===k.id);
  let h=`<div class="ph"><h1>Plan de apuestas</h1><p>Con tu saldo y tu perfil de riesgo, reparte el monto entre las opciones con más valor de los partidos cargados. Es una propuesta de gestión, no una promesa de ganancia.</p></div>${riesgoBanner()}
  <div class="card row" style="gap:18px;margin-bottom:10px;align-items:flex-end">
    <label class="mut" style="font-size:12px">Saldo disponible<br><input class="inp num" type="number" min="0" data-f="saldo" value="${saldo}" style="width:120px"></label>
    <div><div class="mut" style="font-size:12px;margin-bottom:4px">Perfil de riesgo</div><div class="seg">${Object.entries(PERFILES).map(([id,p])=>`<button class="${S.plan.perfil===id?'on':''}" data-perfil="${id}">${p.n}</button>`).join('')}</div></div>
    <div><div class="mut" style="font-size:12px;margin-bottom:4px">Máx. apuestas</div><div class="seg">${[3,5,8].map(v=>`<button class="${S.plan.n===v?'on':''}" data-nplan="${v}">${v}</button>`).join('')}</div></div>
  </div>
  <div class="note" style="margin:-2px 2px 12px">${P.n}: Kelly al ${Math.round(P.frac*100)}%, máx. ${pc(P.cap,0)} del saldo por apuesta y ${pc(P.exp,0)} en total. Usa los filtros de ligas y peso del mercado del lateral.</div>`;
  if(!pl.top.length)return h+`<div class="empty"><b>Sin opciones con valor ahora</b>Ninguna selección con cuota de casa supera el 5% de edge (o todas pasan del 15% y se descartan por sospechosas). Esperar también es una decisión.</div>`;
  h+=`<div class="kpis kpis-big">
    <div class="kpi"><div class="l">Invertir</div><div class="v num">${pl.invert}</div></div>
    <div class="kpi"><div class="l">% del saldo</div><div class="v num">${saldo?pc(pl.invert/saldo,1):'—'}</div></div>
    <div class="kpi"><div class="l">Ganancia esperada*</div><div class="v num ${pl.ev>=0?'good':'bad'}">${money(pl.ev)}</div></div>
    <div class="kpi"><div class="l">Peor caso</div><div class="v num bad">−${pl.invert}</div></div>
    <div class="kpi"><div class="l">Reserva</div><div class="v num">${Math.max(0,saldo-pl.invert)}</div></div>
  </div>
  <div class="card" style="padding:4px 4px"><div class="scroll"><table class="tbl"><thead><tr><th>Partido</th><th>Apuesta</th><th>Cuota</th><th>Prob.</th><th>Edge</th><th>Monto</th><th>Ganancia esp.</th><th></th></tr></thead><tbody>
  ${pl.top.map(x=>`<tr><td>${esc(x.m.home)} – ${esc(x.m.away)}<div class="mut" style="font-size:11px">${esc(ligaName(x.m.liga))} · ${x.m.pf.slice(5)}${x.m.ph?' '+x.m.ph:''}</div></td>
    <td><b>${esc(x.t)}</b><div class="mut" style="font-size:11px">${esc(x.cat)}</div></td>
    <td class="num"><span class="pay real">@${x.o.toFixed(2)}</span></td><td class="num">${pc(x.p,0)}</td><td class="num good">+${pc(x.e,1)}</td>
    <td class="num"><b>${x.monto}</b></td><td class="num good">${money(x.ev)}</td>
    <td>${ya(x)?'<span class="mut" style="font-size:12px">ya registrada</span>':`<button class="btn sm" data-plan-reg="${esc(key(x.m))}" data-id="${esc(x.id)}">Registrar</button>`}</td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="row" style="margin:12px 0"><button class="btn" id="plan-all">Registrar todas como apuestas simples</button></div>
  <div class="callout">${ic('alert')}<div><b>*Ganancia esperada teórica.</b> Asume que el edge estimado es real. En el backtest el modelo rindió peor que las cuotas, así que la ganancia real puede ser menor o negativa. Son apuestas simples e independientes; no hay ingreso garantizado. Apuesta solo lo que puedas perder.</div></div>`;
  return h;
}
function registrarPlan(items){
  const pl=items;
  pl.forEach(x=>{
    S.bets.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),ts:new Date().toISOString(),u:Date.now(),monto:x.monto,cuota:x.o,p:x.p,estado:'pendiente',casa:S.slipMeta.casa,tag:'Plan',
      legs:[{home:x.m.home,away:x.m.away,fecha:x.m.fecha,liga:x.m.liga,id:x.id,sel:x.id,cat:x.cat,apuesta:x.t,o:x.o,src:'casa',p:x.p}]});
  });
  persistBets();validar(false);buildNav();
}

/* ---------- resultados: ¿salieron las recomendaciones? ---------- */
const resDe=m=>S.res.filter(r=>r.h===m.home&&r.a===m.away&&r.d>=m.fecha).pop()||null;
function viewRes(){
  const fin=S.todos.filter(m=>S.ligas.has(m.liga)&&m.est==='fin'&&resDe(m))
    .sort((a,b)=>(b.pf+(b.ph||'')).localeCompare(a.pf+(a.ph||'')));
  let tot=0,ok=0,aT=0,aO=0,rT=0,rO=0;
  const cards=fin.map(m=>{
    const r=resDe(m),o=enrich(m);
    const items=o.r.map(x=>({...x,h:legHit({id:x.id},r)}));
    const rk=o.risk[0]?{...o.risk[0],riesgo:true,h:legHit({id:o.risk[0].id},r)}:null;
    let mo=0,mt=0;
    items.forEach(x=>{if(x.h==null)return;tot++;mt++;if(x.h){ok++;mo++}if(x.p>=.7){aT++;if(x.h)aO++}});
    if(rk&&rk.h!=null){rT++;if(rk.h)rO++}
    const chip=x=>`<span class="hc ${x.h===true?'ok':x.h===false?'ko':'na'}" title="${esc(x.cat)}"><span>${x.h===true?'✓':x.h===false?'✕':'•'}</span>${x.riesgo?'<em>Arriesgada</em> ':''}${esc(x.t)} <b class="num">${pc(x.p)}</b>${x.o?` <span class="hq">@${x.o.toFixed(2)}</span>`:''}</span>`;
    const g=(r.ht!=null?`1T: ${r.ht} goles · `:'')+(r.c!=null?`Córners: ${r.c} · `:'')+(r.t!=null?`Tarjetas: ${r.t} · `:'')+(r.st!=null?`Tiros a puerta: ${r.st}`:'');
    return `<article class="card rcard"><div class="row" style="justify-content:space-between;align-items:baseline">
        <div><div class="mut" style="font-size:12px">${esc(ligaName(m.liga))} · ${m.pf.slice(5)}</div>
          <b style="font-size:15px">${esc(m.home)} <span class="score num">${r.hg} – ${r.ag}</span> ${esc(m.away)}</b></div>
        <span class="tagst ${mt&&mo/mt>=.5?'ganada':'perdida'}">${mo}/${mt} aciertos</span></div>
      <div class="mut" style="font-size:12px;margin:4px 0 8px">${g}</div>
      <div class="hcs">${items.map(chip).join('')}${rk?chip(rk):''}</div></article>`;
  });
  return `<div class="ph"><h1>Resultados</h1><p>Cómo salieron las recomendaciones en los partidos ya terminados. <b class="good">Verde</b> = salió, <b style="color:var(--red)">rojo</b> = no salió.</p></div>
  <div class="kpis kpis-big">
    <div class="kpi"><div class="l">Partidos terminados</div><div class="v num">${fin.length}</div></div>
    <div class="kpi"><div class="l">Recomendaciones acertadas</div><div class="v num">${tot?`${ok}/${tot}`:'—'}</div><div class="s" style="display:block">${tot?pc(ok/tot,0):''}</div></div>
    <div class="kpi"><div class="l">Alta confianza (≥70%)</div><div class="v num">${aT?`${aO}/${aT}`:'—'}</div><div class="s" style="display:block">${aT?pc(aO/aT,0):''}</div></div>
    <div class="kpi"><div class="l">Arriesgadas</div><div class="v num">${rT?`${rO}/${rT}`:'—'}</div><div class="s" style="display:block">${rT?pc(rO/rT,0):''}</div></div>
  </div>
  ${fin.length?`<div class="rgrid">${cards.join('')}</div>`:'<div class="empty"><b>Aún no hay partidos terminados</b>Cuando terminen los partidos del lote actual aparecerán aquí con sus recomendaciones en verde o rojo.</div>'}
  <div class="note" style="margin-top:12px">Se evalúan las recomendaciones tal como estaban antes del partido (con tu peso del mercado actual). Con pocos partidos el porcentaje es muy variable.</div>`;
}

function viewFiab(){
  const bt=S.data.meta.backtest||{},ks=Object.keys(bt).filter(l=>bt[l]&&bt[l].logloss);
  if(!ks.length)return `<div class="ph"><h1>Fiabilidad</h1></div><div class="empty"><b>Sin backtest en esta actualización</b>El backtest diario todavía no se ha ejecutado.</div>`;
  let gana=0,aporta=0,roiTot={},nTot={};
  const VN2={goles1t:'Goles 1T',corners:'Córners',tarjetas:'Tarjetas'};
  const cards=ks.map(l=>{
    const x=bt[l],ll=x.logloss,mo=ll['0.0'],me=ll['1.0'],mi=x.ll_opt!=null?x.ll_opt:me,w=x.w_opt!=null?x.w_opt:.75,p=x.params||{};
    if(me<mo)gana++;if(w<.95)aporta++;
    const lo=Math.min(mo,me,mi),hi=Math.max(mo,me,mi),sc=v=>hi>lo?8+(v-lo)/(hi-lo)*88:50;
    const line=(n,v,col)=>`<div class="bt-row"><span class="tx2">${n}</span><div class="bar2"><i style="width:${sc(v)}%;background:${col}"></i></div><b class="num">${v.toFixed(4)}</b></div>`;
    const roi=x.roi||{};Object.entries(roi).forEach(([u,r])=>{if(r.roi!=null){roiTot[u]=(roiTot[u]||0)+r.ganancia;nTot[u]=(nTot[u]||0)+r.apuestas}});
    const roiHtml=Object.keys(roi).length?`<div class="scroll"><table class="t" style="margin-top:8px"><thead><tr><th>Apostar si edge ≥</th><th>Apuestas</th><th>ROI simulado</th></tr></thead><tbody>${Object.entries(roi).map(([u,r])=>`<tr><td>${u}%</td><td class="num">${r.apuestas}</td><td class="num ${r.roi>0?'good':r.roi<0?'bad':''}">${r.roi==null?'—':(r.roi>0?'+':'')+(r.roi*100).toFixed(1)+'%'}${r.apuestas<40?' <span class="mut">(pocas)</span>':''}</td></tr>`).join('')}</tbody></table></div>`:'';
    const cont=x.conteos||{};
    const chips=Object.keys(VN2).map(v=>{const c=cont[v];if(!c)return `<span class="hc na" title="Sin datos suficientes"><span>•</span>${VN2[v]}: sin backtest</span>`;
      const ok=c.mejora>=.01;return `<span class="hc ${ok?'ok':'ko'}" title="Brier modelo ${c.brier_modelo} vs promedio de liga ${c.brier_liga} (${c.n} partidos, línea ${c.linea})"><span>${ok?'✓':'✕'}</span>${VN2[v]}: ${(c.mejora*100>0?'+':'')+(c.mejora*100).toFixed(1)}% vs liga</span>`}).join('');
    return `<div class="card" style="margin-bottom:10px">
      <div class="row" style="justify-content:space-between;align-items:baseline"><b>${esc(ligaName(l))}</b><span class="mut" style="font-size:12px">${x.n} partidos · peso de mercado validado <b class="num" style="color:var(--tx)">${Math.round(w*100)}%</b>${w>=.95?' · el modelo no aporta':''}</span></div>
      <div class="mut" style="font-size:12px;margin:2px 0 8px">Parámetros elegidos: memoria ${p.vida||365} días · regularización ${p.reg!=null?p.reg:'—'} · xG ${p.xg?'sí ('+Math.round(p.xg*100)+'%)':'no'}</div>
      ${line('Solo modelo',mo,'var(--draw)')}${line('Solo mercado',me,'var(--home)')}${line('Mezcla validada',mi,'var(--ac)')}
      ${x.ou?`<div class="note">Más/menos 2.5: modelo ${x.ou.modelo.toFixed(4)} · mercado ${x.ou.mercado.toFixed(4)} · mezcla ${x.ou.ll_opt.toFixed(4)} (peso ${Math.round(x.ou.w_opt*100)}%).</div>`:''}
      ${roiHtml}
      <div class="hcs" style="margin-top:8px">${chips}</div></div>`}).join('');
  const tot=Object.keys(roiTot).map(u=>`<div class="vt"><div class="l">Edge ≥ ${u}% · todas las ligas</div><div class="v num ${roiTot[u]/nTot[u]>0?'good':'bad'}">${(roiTot[u]/nTot[u]>0?'+':'')+(roiTot[u]/nTot[u]*100).toFixed(1)}%</div><div class="s">${nTot[u]} apuestas simuladas a cuota de cierre</div></div>`).join('');
  return `<div class="ph"><h1>Fiabilidad</h1><p>Qué tan bien predice el modelo, medido con partidos que no vio al entrenarse (validación walk-forward, ~250 partidos por liga). Se recalcula cada noche y elige los parámetros que mejor funcionaron.</p></div>
  <div class="callout">${ic('alert')}<div><b>El mercado por sí solo supera al modelo en ${gana} de ${ks.length} ligas; mezclados, el modelo aporta una mejora pequeña en ${aporta} de ${ks.length}.</b> Por eso cada liga usa su propio peso de mercado (filtro «Validado por liga»). Donde el peso es 100%, la probabilidad es la del mercado y cualquier «edge» viene solo de comparar cuotas entre casas.</div></div>
  <div class="sec"><h3>Apuestas simuladas (1 unidad, cuota de cierre máxima, mezcla validada)</h3><div class="card"><div class="vgrid">${tot}</div>
    <div class="note">Resultado muy variable entre ligas: es compatible con «sin ventaja clara». Un ROI positivo con pocas apuestas no es evidencia. La cuota máxima del mercado suele ser mayor que la de tu casa, así que el ROI real sería menor.</div></div></div>
  <div class="sec"><h3>Por liga</h3></div>${cards}
  <div class="two" style="margin-top:16px;align-items:start">
    <div class="card"><h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin-bottom:8px">Cómo se calcula</h3>
      <ol class="tx2" style="padding-left:18px;font-size:13px;line-height:1.7">
        <li>Dixon-Coles: ataque, defensa y localía por equipo, con más peso al pasado reciente (memoria validada por liga) y xG donde ayuda.</li>
        <li>Se quita el margen de la casa a las cuotas para obtener la probabilidad del mercado.</li>
        <li>Se mezclan con el peso que mejor predijo en el backtest de esa liga y se compara con la cuota para hallar el edge.</li>
        <li>Córners, tarjetas y goles 1T: modelo de conteo (Binomial Negativa) comparado con el promedio de la liga. Si no lo supera, se marca «≈ liga» y no puede ser «Alta».</li></ol></div>
    <div class="card"><h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin-bottom:8px">Límites</h3>
      <ul class="tx2" style="padding-left:18px;font-size:13px;line-height:1.7">
        <li>Liga 1 Perú, Champions, Europa League, Libertadores y Sudamericana: sin cuotas de referencia ni backtest. Son estimaciones con pocos partidos por equipo; úsalas con más cautela.</li>
        <li>Tiros a puerta: sin backtest. Se muestra como «≈ liga».</li>
        <li>No se consideran lesiones, alineaciones ni árbitro.</li>
        <li>Datos: football-data.co.uk, ESPN y Betano. Pueden retrasarse o cambiar.</li></ul></div>
  </div>`;
}

/* ===================== panel de detalle ===================== */
function renderDetail(){
  const n=S.slip.size;
  let h=`<div class="dtabs"><button data-panel="detalle" class="${S.panel==='detalle'?'on':''}">Partido</button>
    <button data-panel="boleta" class="${S.panel==='boleta'?'on':''}">${ic('ticket')}Boleta${n?` <span class="lvl a">${n}</span>`:''}</button>
    <button class="x iconbtn" id="dclose" aria-label="Cerrar" style="width:32px;height:32px;margin-bottom:6px">${ic('x')}</button></div><div class="dbody">`;
  h+=S.panel==='boleta'?slipHtml():matchHtml();
  $('detail').innerHTML=h+'</div>';
}
function openDetail(){if(overlay()){$('detail').classList.add('open');$('scrim').classList.add('show')}}
function closeDetail(){$('detail').classList.remove('open');$('scrim').classList.remove('show')}

function addBtn(k,id,t,small){
  const on=S.slip.has(legKey(k,id));
  return `<button class="addbtn ${on?'on':''} ${small?'sm':''}" data-reco="${esc(k)}" data-id="${esc(id)}" aria-pressed="${on}" title="${on?'Quitar de la boleta':'Añadir a la boleta'}" aria-label="${on?'Quitar de':'Añadir a'} la boleta: ${esc(t)}">${ic(on?'check':'plus')}</button>`;
}
function oddBtn(o,s,label){
  const x=o.c[s];if(!x)return '';
  if(x.o==null)return `<span class="odd nq" title="Sin cuota de referencia"><span class="num">${pc(x.p)}</span><small class="mut">sin cuota</small></span>`;
  const on=S.slip.has(legKey(o.k,s)),cl=on?'on':x.edge>SUSP?'h':x.edge>=.03?'v':'';
  return `<button class="odd ${cl}" data-odd="${esc(o.k)}" data-s="${s}" aria-pressed="${on}" aria-label="${esc(label)} cuota ${x.o.toFixed(2)}">
    <span class="num">${x.o.toFixed(2)}</span><small class="num ${on?'':x.edge>SUSP?'warn':x.edge>0?'good':'bad'}">${x.edge>SUSP?'⚠ ':''}${x.edge>0?'+':''}${pc(x.edge,1)}</small></button>`;
}

function matchHtml(){
  const m=S.data&&S.data.partidos.find(p=>key(p)===S.sel);
  if(!m)return `<div class="empty"><b>Selecciona un partido</b>Verás recomendaciones, variables esperadas y rivales.</div>`;
  const o=enrich(m),c=o.c;
  let h=`<div class="dh"><div class="lg">${esc(ligaName(m.liga))} · ${new Date(m.pf+'T12:00:00Z').toLocaleDateString('es',{day:'numeric',month:'short',timeZone:'UTC'})}${m.ph?' · '+esc(m.ph)+' ('+tz(m)+')':''}${m.casa?' · cuotas '+esc(m.casa):''}</div>
    <h2>${esc(m.home)} <span>vs</span> ${esc(m.away)}${m.est==='vivo'?' <span class="live"><i></i>EN VIVO</span>':''}</h2>${m.est==='vivo'?'<div class="note">Partido en juego: las cuotas y probabilidades son las previas al inicio y no se actualizan en vivo.</div>':''}</div>
    <div class="seg" style="margin-top:10px;width:100%">${[['resumen','Resumen'],['mercados','Mercados'],['forma','Forma y rivales']].map(([id,l])=>
      `<button style="flex:1" class="${S.dtab===id?'on':''}" data-dtab="${id}">${l}</button>`).join('')}</div>`;
  if(S.dtab==='resumen')h+=tabResumen(o);
  else if(S.dtab==='mercados')h+=tabMercados(m);
  else h+=tabForma(m);
  return h;
}

/* ---------- forma y observaciones ---------- */
const resultado=f=>f.gol_f==null||f.gol_c==null?null:f.gol_f>f.gol_c?'V':f.gol_f===f.gol_c?'E':'D';
const rbadge=r=>r?`<span class="rb ${r.toLowerCase()}" title="${r==='V'?'Victoria':r==='E'?'Empate':'Derrota'}">${r}</span>`:'';
const formaChips=c=>c.ultimos.slice().reverse().map(f=>rbadge(resultado(f))).join('');
const TIPO_ICO={ataque:'●',defensa:'■',disciplina:'▲',tiros:'◆',goles:'●',córners:'◆',racha:'★'};
function obsList(arr,max){
  arr=(arr||[]).slice(0,max||99);
  if(!arr.length)return '<div class="mut" style="font-size:13px">Sin tendencias marcadas en la muestra reciente.</div>';
  return arr.map(o=>`<div class="obs"><span class="oi ${o.tipo}" aria-hidden="true">${TIPO_ICO[o.tipo]||'●'}</span>
    <div><div class="ot">${esc(o.t)}</div><div class="oa">${esc(o.a)}</div></div>
    ${o.k!=null&&o.de?`<span class="ok num" title="${o.k} de ${o.de}">${o.k}/${o.de}</span>`:''}</div>`).join('');
}
function tendenciasHtml(m,max){
  const x=m.ctx;
  return `<div class="two">${[[m.home,x.home],[m.away,x.away]].map(([eq,c])=>`<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><b>${esc(eq)}</b><span class="forma" title="De más antiguo a más reciente">${formaChips(c)}</span></div>${obsList(c.obs,max)}</div>`).join('')}</div>`;
}

function tabResumen(o){
  const {m,c,r}=o;
  const subTxt=x=>x.o?`Paga <b class="num">${x.o.toFixed(2)}</b> · edge <b class="${x.e>SUSP?'warn':x.e>0?'good':'bad'}">${x.e>0?'+':''}${pc(x.e,1)}</b>${x.e>SUSP?' ⚠':''}`
    :`Sin cuota de casa · valor si paga ≥ <b class="num">${(1/x.p).toFixed(2)}</b>`;
  const probable=`<div class="sec first"><h3>Lo más probable</h3><div class="card">`+r.map(x=>{
    const [k,n]=nivel(x);
    return `<div class="rr"><div><div class="c">${esc(x.cat)}</div><div class="t">${esc(x.t)}<span class="lvl ${k}">${n}</span>${dudTag(x)}</div></div>
      <div class="pr">${payPill(x)}<span class="p num">${pc(x.p)}</span>${addBtn(o.k,x.id,x.t)}</div><div class="mb ${k==='m'?'m2':k}"><i style="width:${Math.min(100,x.p*100)}%"></i></div><div class="s">${subTxt(x)}</div></div>`}).join('')+
    `</div><div class="note">Probabilidad = modelo ${Math.round((1-wOf(m))*100)}% / mercado ${Math.round(wOf(m)*100)}% donde hay cuotas${S.wAuto&&btOf(m)&&btOf(m).w_opt!=null?' (peso validado para esta liga)':''}. «≈ liga» = sin ventaja demostrada frente al promedio de la liga. No es una garantía.</div></div>`;
  let risk='';
  if(o.risk&&o.risk.length){
    risk=`<div class="sec first"><h3>Apuesta arriesgada · la que más podría salir</h3><div class="card risk">`+o.risk.slice(0,2).map((x,i)=>
      `<div class="rr"><div><div class="c">${i===0?'La más probable de las arriesgadas · ':''}${esc(x.cat)}</div><div class="t">${esc(x.t)}<span class="lvl m">Riesgo alto</span>${dudTag(x)}</div></div>
        <div class="pr">${payPill(x)}<span class="p num">${pc(x.p)}</span>${addBtn(o.k,x.id,x.t)}</div>
        <div class="s">Sale ~1 de cada ${(1/x.p).toFixed(1)} veces · ${subTxt(x)}</div></div>`).join('')+
      `</div><div class="note">Paga ${RISK_ODDS.toFixed(2)} o más y tiene al menos ${Math.round(RISK_MIN*100)}% de probabilidad. Monto pequeño; no es una garantía.</div></div>`;
  }
  const cbRow=(x,lab,s_,n)=>`<div class="cb"><div class="n" title="${esc(n||lab)}">${lab}</div>
    <div class="stack"><div class="mb"><i style="width:${x.p*100}%"></i></div><div class="mbl"><span><b class="num" style="color:var(--tx)">${pc(x.p)}</b></span><span>Mercado ${pc(x.pmk)} · Modelo ${pc(x.pm)}</span></div></div>${oddBtn(o,s_,lab)}</div>`;
  let r1='',ou='';
  if(c['1']&&c.X&&c['2'])r1=`<div class="sec"><h3>Resultado (1X2)</h3><div class="card">${[['1',m.home,'Local'],['X','Empate','Empate'],['2',m.away,'Visita']].map(([s_,n,lab])=>cbRow(c[s_],lab,s_,n)).join('')}</div></div>`;
  if(c['O2.5']&&c['U2.5'])ou=`<div class="sec"><h3>Goles · línea 2.5</h3><div class="card">${[['O2.5','Más de 2.5'],['U2.5','Menos de 2.5']].map(([s_,l])=>cbRow(c[s_],l,s_)).join('')}</div></div>`;
  let h=`<div class="dgrid"><div>${probable}</div><div>${risk}${r1}${ou}</div></div>`;
  h+=`<div class="sec"><h3>Tendencias clave · qué suele pasar con cada equipo</h3>${tendenciasHtml(m,4)}<div class="note">Sobre sus últimos 6 partidos y su rol en este partido. Detalle completo en “Forma y rivales”.</div></div>`;
  if(m.extra&&m.extra.length){
    h+=`<div class="sec"><h3>Cuotas reales de ${esc(m.casa)}</h3><div class="card scroll"><table class="t"><thead><tr><th>Mercado</th><th>Más / Sí</th><th>Menos / No</th></tr></thead><tbody>`+
      m.extra.map(e=>{const w=wOf(m),pmk=(1/e.cuo)/(1/e.cuo+1/e.cuu),po=(1-w)*e.po+w*pmk,pu=1-po,eo=po*e.cuo-1,eu=pu*e.cuu-1;
        const cell=(p,q,ed)=>`<td><b class="num">${pc(p)}</b> <span class="mut">@${q.toFixed(2)}</span> <span class="num ${ed>SUSP?'warn':ed>0?'good':'bad'}">${ed>SUSP?'⚠ ':''}${ed>0?'+':''}${pc(ed,1)}</span></td>`;
        return `<tr><td>${esc(e.var==='btts'?'Ambos anotan':e.nombre)}${e.l!=null?` <span class="mut">${e.l}</span>`:''}</td>${cell(po,e.cuo,eo)}${cell(pu,e.cuu,eu)}</tr>`}).join('')+
      `</tbody></table></div><div class="note">Sin backtest en estos mercados. ⚠ = edge mayor al ${pc(SUSP)}: suele ser error del modelo.</div></div>`;
  }
  return h;
}

function lineRows(arr,id,m,c,v){
  return (arr||[]).map((l,i)=>{const po=l.o,pu=1-l.o,k=m?key(m):null;
    const ids=v==='goles'&&l.l===2.5&&c['O2.5']?['O2.5','U2.5']:[`${v}:O:${l.l}`,`${v}:U:${l.l}`];
    const cell=(p,t,idx)=>`<td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><span><b class="num">${pc(p)}</b> <span class="mut num">(${(1/p).toFixed(2)})</span></span>${m?addBtn(k,ids[idx],(idx?'Menos':'Más')+' de '+l.l+' '+(VN[v]||v),true):''}</div>
      <input class="inp num" type="number" step="0.01" min="1" inputmode="decimal" placeholder="tu cuota" aria-label="Tu cuota" data-p="${p}" data-t="${id}${t}${i}"><span id="${id}${t}${i}"></span></td>`;
    return `<tr><td><b>${l.l}</b></td>${cell(po,'o',0)}${cell(pu,'u',1)}</tr>`}).join('')}
function tabMercados(m){
  let h=`<div class="note" style="margin-top:14px">Valores esperados del modelo. Entre paréntesis, la cuota “justa”. Escribe la cuota de tu casa y verás el edge al instante (prob × cuota − 1).</div><div class="sec"><div class="acc-grid">`;
  Object.entries(m.vars||{}).forEach(([v,o],i)=>{
    h+=`<details class="acc" ${i<2?'open':''}><summary>${ic('chev')}${esc(VN[v]||o.nombre)}<span class="sm num">${esc(m.home)} ${o.mh} · ${esc(m.away)} ${o.ma} · total <b style="color:var(--tx)">${o.mt}</b></span></summary><div class="ab">
      <div class="scroll"><table class="t"><thead><tr><th>Línea</th><th>Más de</th><th>Menos de</th></tr></thead><tbody>${lineRows(o.lineas,v,m,compute(m),v)}</tbody></table></div>`;
    if(o.lh)h+=`<div class="two" style="margin-top:10px"><div><div class="note">${esc(m.home)} (individual)</div><div class="scroll"><table class="t"><tbody>${lineRows(o.lh,v+'h')}</tbody></table></div></div>
      <div><div class="note">${esc(m.away)} (individual)</div><div class="scroll"><table class="t"><tbody>${lineRows(o.la,v+'a')}</tbody></table></div></div></div>`;
    h+=`</div></details>`;
  });
  return h+'</div></div>';
}
function tabForma(m){
  const x=m.ctx;
  let h=`<div class="sec"><h3>Tendencias y observaciones</h3>${tendenciasHtml(m,12)}</div><div class="sec"><h3>Contra quién jugaron · últimos ${x.home.ultimos.length>5?6:5} (a favor – en contra)</h3>`;
  h+='<div class="d2">';
  for(const [eq,c] of [[m.home,x.home],[m.away,x.away]]){
    h+=`<div class="card scroll"><b>${esc(eq)}</b><table class="t"><thead><tr><th>Rival</th><th>Res.</th><th>Gol</th><th>1T</th><th>Córn</th><th>Tarj</th><th>Pta</th></tr></thead><tbody>
      ${c.ultimos.map(r=>`<tr><td>${r.loc==='L'?'':'<span class="mut">@</span> '}${esc(r.rival)}<br><span class="mut" style="font-size:11px">${r.d.slice(5)}</span></td>
        <td>${rbadge(resultado(r))}</td><td class="num">${fx(r.gol_f)}–${fx(r.gol_c)}</td><td class="num">${fx(r.gol1t_f)}–${fx(r.gol1t_c)}</td><td class="num">${fx(r.esq_f)}–${fx(r.esq_c)}</td><td class="num">${fx(r.tarj_f)}–${fx(r.tarj_c)}</td><td class="num">${fx(r.ptas_f)}–${fx(r.ptas_c)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  h+=`</div></div><div class="d2" style="align-items:start"><div class="sec"><h3>Promedios · últimos 8 partidos</h3><div class="card scroll"><table class="t"><thead><tr><th></th><th>${esc(m.home)} a favor</th><th>en contra</th><th>${esc(m.away)} a favor</th><th>en contra</th></tr></thead><tbody>
    ${Object.keys(CN).map(k=>`<tr><td>${CN[k]}</td><td class="num">${fx(x.home.prom8[k+'_f'])}</td><td class="num">${fx(x.home.prom8[k+'_c'])}</td><td class="num">${fx(x.away.prom8[k+'_f'])}</td><td class="num">${fx(x.away.prom8[k+'_c'])}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="sec"><h3>Cara a cara</h3>`+(x.h2h.length?`<div class="card scroll"><table class="t"><thead><tr><th>Fecha</th><th>Partido</th><th>Marcador</th><th>Córn</th><th>Tarj</th></tr></thead><tbody>
    ${x.h2h.map(r=>`<tr><td class="num">${r.d}</td><td>${esc(r.local)} – ${esc(r.visita)}</td><td class="num">${r.gl}–${r.gv}</td><td class="num">${fx(r.esq)}</td><td class="num">${fx(r.tarj)}</td></tr>`).join('')}</tbody></table></div>`:
    '<div class="card flat mut">Sin enfrentamientos recientes en los datos.</div>')+'</div></div>';
  return h;
}

/* ===================== boleta ===================== */
const legKey=(k,id)=>k+'#'+id;
const lo=l=>l.o||l.mo||1/l.p;                       // cuota efectiva
const lsrc=l=>l.o?'casa':l.mo?'tuya':'estimada';
const grupo=c=>(c==='Resultado'||c==='Doble oportunidad')?'R':c;
function totals(){const L=[...S.slip.values()];return{L,o:L.reduce((a,l)=>a*lo(l),1),p:L.reduce((a,l)=>a*l.p,1)}}
function slipSummary(){
  const {L,o,p}=totals(),edge=p*o-1,cap=L.length>1?.015:.03,st=S.bank*kelly(p,o,cap);
  const est=L.filter(l=>lsrc(l)==='estimada').length,mismo=new Set(L.map(l=>l.k)).size<L.length;
  const [cls,txt]=est?['warn',`${est} selección(es) sin cuota real: escribe la cuota de tu casa para ver el valor verdadero. Mientras tanto se usa la cuota justa (edge 0).`]
    :edge<=0?['bad','Sin valor teórico: la casa tiene ventaja en esta boleta.']
    :edge>SUSP?['warn','Edge muy alto: probablemente es error del modelo, no una ventaja real. Ve con cautela.']
    :['good','Valor teórico moderado, todavía no validado. Cada selección extra multiplica la varianza.'];
  return `<div class="stats"><div><small>Cuota</small><b class="num">${o.toFixed(2)}</b></div><div><small>Probabilidad</small><b class="num">${pc(p,1)}</b></div>
      <div><small>Edge</small><b class="num ${edge>0?'good':'bad'}">${(edge*100).toFixed(1)}%</b></div></div>
    <div class="verdict ${cls}">${ic('info')}<span>${txt}</span></div>
    ${mismo?`<div class="note" style="margin:-4px 0 10px">Hay varias selecciones del mismo partido: la probabilidad conjunta asume independencia y es aproximada.</div>`:''}
    <div class="note">Stake sugerido (Kelly 25%, tope ${(cap*100).toFixed(1)}%): <b class="num">${st.toFixed(0)}</b></div>`;
}
function slipHtml(){
  const {L}=totals();
  if(!L.length)return `<div class="empty"><b>Tu boleta está vacía</b>Toca <b style="display:inline">+</b> en una recomendación o una cuota para añadirla.</div>`;
  const {o,p}=totals(),st=S.bank*kelly(p,o,L.length>1?.015:.03);
  return `<div class="sec" style="margin-top:4px"><h3>Selecciones (${L.length})</h3><div class="card">${L.map(l=>`<div class="leg"><div style="min-width:0">
      <div class="mut" style="font-size:11px">${esc(l.cat)} · ${esc(l.label)}</div><div><b>${esc(l.apuesta)}</b> <span class="mut num">· ${pc(l.p)}</span></div>
      <div class="row" style="margin-top:6px">${l.o?`<span class="pay real">@${l.o.toFixed(2)}</span><span class="mut" style="font-size:12px">cuota de la casa</span>`
        :`<input class="inp num" type="number" step="0.01" min="1" inputmode="decimal" data-mo="${esc(l.lk)}" value="${l.mo||''}" placeholder="≥${(1/l.p).toFixed(2)}" aria-label="Tu cuota para ${esc(l.apuesta)}"><span class="mut" style="font-size:12px">tu cuota</span>`}</div></div>
      <button class="iconbtn" data-rm="${esc(l.lk)}" aria-label="Quitar" style="width:30px;height:30px">${ic('x')}</button></div>`).join('')}</div>
    <div id="slipsum" style="margin-top:12px">${slipSummary()}</div>
    <div class="row" style="margin-top:6px;gap:8px"><label class="mut" style="font-size:12px">Casa<br><select class="inp" data-meta="casa" style="width:auto;text-align:left">${['Betano','Apuesta Total','Inkabet','Otra'].map(c=>`<option ${c===S.slipMeta.casa?'selected':''}>${c}</option>`).join('')}</select></label><label class="mut" style="font-size:12px">Motivo<br><select class="inp" data-meta="tag" style="width:auto;text-align:left">${['Modelo','Valor','Intuición','Racha','Tipster','Otro'].map(c=>`<option ${c===S.slipMeta.tag?'selected':''}>${c}</option>`).join('')}</select></label></div>
    <div class="row" style="margin-top:6px"><label class="mut" style="font-size:12px">Monto<br><input class="inp num" type="number" id="amt" min="0" value="${Math.max(1,Math.round(st))}" style="width:96px"></label>
      <label class="mut" style="font-size:12px">Mi banca<br><input class="inp num" type="number" id="bank" min="0" value="${S.bank}" style="width:96px"></label></div>
    <div class="row" style="margin-top:14px"><button class="btn" id="save">Guardar en mi historial</button><button class="btn ghost" id="clear">Vaciar</button></div></div>`;
}
function toggleLeg(k,id){
  const m=S.data.partidos.find(p=>key(p)===k);if(!m)return;
  const x=findOpt(m,compute(m),id);if(!x)return;
  const lk=legKey(k,id);
  if(S.slip.has(lk)){S.slip.delete(lk)}
  else{
    // una selección por grupo y partido: opciones del mismo mercado son excluyentes o anidadas
    let replaced=false;
    [...S.slip.entries()].forEach(([kk,l])=>{if(l.k===k&&grupo(l.cat)===grupo(x.cat)){S.slip.delete(kk);replaced=true}});
    if(replaced)toast('Reemplazada la selección de ese mercado en el partido');
    S.slip.set(lk,{lk,k,id,m,label:`${m.home} – ${m.away}`,apuesta:x.t,cat:x.cat,o:x.o,p:x.p,mo:null});
  }
  refreshSlip();
}
function refreshSlip(){$('slipcnt').textContent=S.slip.size;$('slipcnt').hidden=!S.slip.size;renderDetail();if(S.view==='partidos')keepScroll(render)}
function keepScroll(fn){const y=$('main').scrollTop;fn();$('main').scrollTop=y}
function saveBet(){
  const {L,o,p}=totals();if(!L.length)return;
  const rk=estadoRiesgo(+$('amt').value||0);
  if(rk.al.length&&!S._confirmaRiesgo){toast('⚠ '+rk.al[0]+' Pulsa de nuevo para guardar igualmente.');S._confirmaRiesgo=true;setTimeout(()=>{S._confirmaRiesgo=false},9000);return}
  S._confirmaRiesgo=false;
  S.bets.unshift({id:Date.now().toString(36),ts:new Date().toISOString(),u:Date.now(),monto:+$('amt').value||0,cuota:o,p,estado:'pendiente',casa:S.slipMeta.casa,tag:S.slipMeta.tag,nota:S.slipMeta.nota,
    legs:L.map(l=>({home:l.m.home,away:l.m.away,fecha:l.m.fecha,liga:l.m.liga,id:l.id,sel:l.id,cat:l.cat,apuesta:l.apuesta,o:lo(l),src:lsrc(l),p:l.p}))});
  persistBets();S.slip.clear();settleAuto();S.panel='detalle';buildNav();refreshSlip();toast('Guardado en tu historial');
}
const hit=(s,hg,ag)=>({'1':hg>ag,'X':hg===ag,'2':hg<ag,'O2.5':hg+ag>=3,'U2.5':hg+ag<=2})[s];
function legHit(l,r){
  const id=l.id||l.sel;
  if(['1','X','2','O2.5','U2.5'].includes(id))return hit(id,r.hg,r.ag);
  if(id.startsWith('DC:')){const c=id.slice(3);return c==='1X'?r.hg>=r.ag:c==='X2'?r.hg<=r.ag:r.hg!==r.ag}
  if(id.startsWith('btts:'))return (r.hg>0&&r.ag>0)===(id==='btts:S');
  const [v,side,line]=id.split(':'),val={goles:r.hg+r.ag,goles1t:r.ht,corners:r.c,tarjetas:r.t,tiros_puerta:r.st,tiros:r.s}[v];
  if(val==null)return null;               // sin dato (p. ej. tiros a puerta): queda pendiente
  return side==='O'?val>+line:val<+line;
}
function settleAuto(){
  let n=0,g=0,p=0;
  S.bets.forEach(b=>{if(b.estado!=='pendiente')return;
    const r=b.legs.map(l=>{const x=S.res.filter(r=>r.h===l.home&&r.a===l.away&&r.d>=l.fecha).pop();return x?legHit(l,x):null});
    if(r.includes(false)){b.estado='perdida';b.u=Date.now();n++;p++}else if(r.length&&r.every(v=>v===true)){b.estado='ganada';b.u=Date.now();n++;g++}});
  if(n)persistBets();
  return {n,g,p};
}
/* validación automática: al cargar, cada minuto y cada vez que llegan resultados nuevos */
function validar(avisar){
  const r=settleAuto();S.lastSettle=Date.now();
  if(r.n){
    if(avisar)toast(`Validadas ${r.n} apuesta${r.n>1?'s':''} automáticamente: ${r.g} ganada${r.g!==1?'s':''}, ${r.p} perdida${r.p!==1?'s':''}`);
    buildNav();
    if(S.view==='historial'||S.view==='plan'||S.view==='top')keepScroll(renderMain);
  }
  return r;
}
async function refrescarResultados(){
  if(window.__EL__)return;                       // versión embebida: los datos no cambian hasta republicar
  try{
    const [d,r]=await Promise.all([fetch('data/picks.json',{cache:'no-cache'}).then(x=>{if(!x.ok)throw 0;return x.json()}),
      fetch('data/results.json',{cache:'no-cache'}).then(x=>{if(!x.ok)throw 0;return x.json()})]);
    S.res=r;S.lastFetch=Date.now();
    if(d.meta.generado!==S.data.meta.generado){          // llegaron partidos / cuotas nuevos
      S.data=d;
      S.todos=d.partidos.concat((d.recientes||[]).filter(q=>!d.partidos.some(p=>key(p)===key(q))).map(q=>({...q,rec:true})));
      aplicarEstado();
      if(S.sel&&!S.data.partidos.some(m=>key(m)===S.sel))S.sel=null;
      $('updt').textContent='Actualizado '+ago(d.meta.generado);
      keepScroll(render);renderDetail();
    }
  }catch(e){return}
  validar(true);sincronizar(false);
}
const pendNote=b=>{
  const f=b.legs.map(l=>l.fecha).sort().pop(),ayer=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
  return f&&f<ayer?'<div class="mut" style="font-size:11px">esperando resultado</div>':'';
};

/* ===================== tema ===================== */
function applyTheme(){
  const r=document.documentElement;
  if(S.theme==='auto')r.removeAttribute('data-theme');else r.dataset.theme=S.theme;
  document.querySelectorAll('#themeseg button').forEach(b=>b.classList.toggle('on',b.dataset.theme===S.theme));
}

/* ===================== eventos ===================== */
let _selEl=null;
function marcarSel(k){            // solo toca la fila anterior y la nueva (no las 100)
  if(_selEl&&_selEl.isConnected)_selEl.classList.remove('sel');
  _selEl=null;
  for(const r of document.querySelectorAll('#rows .mrow[data-k]')){if(r.dataset.k===k){r.classList.add('sel');_selEl=r;break}}
}
function selectMatch(k){
  S.sel=k;S.panel='detalle';
  if(!overlay()){marcarSel(k)}                       // respuesta inmediata en la lista
  setTimeout(()=>{renderDetail();$("detail").scrollTop=0;openDetail()},0);
}
document.addEventListener('click',e=>{
  const t=e.target;let b;
  if((b=t.closest('[data-view]'))){setView(b.dataset.view);return}
  if((b=t.closest('[data-k]'))){selectMatch(b.dataset.k);return}
  if((b=t.closest('[data-range]'))){S.range=b.dataset.range;keepScroll(render);return}
  if(t.closest('[data-liga-none]')){S.ligas.clear();keepScroll(render);return}
  if(t.closest('[data-liga-all]')){Object.keys(S.data.meta.ligas).forEach(l=>S.ligas.add(l));keepScroll(render);return}
  if((b=t.closest('[data-liga]'))){const l=b.dataset.liga;S.ligas.has(l)?S.ligas.delete(l):S.ligas.add(l);keepScroll(render);return}
  if((b=t.closest('[data-odd]'))){toggleLeg(b.dataset.odd,b.dataset.s);return}
  if((b=t.closest('[data-reco]'))){toggleLeg(b.dataset.reco,b.dataset.id);return}
  if((b=t.closest('[data-panel]'))){S.panel=b.dataset.panel;renderDetail();return}
  if((b=t.closest('[data-dtab]'))){S.dtab=b.dataset.dtab;renderDetail();return}
  if((b=t.closest('[data-rm]'))){S.slip.delete(b.dataset.rm);refreshSlip();return}
  if((b=t.closest('[data-del]'))){S.tomb[b.dataset.del]=Date.now();LS.set('el.tomb',S.tomb);S.bets=S.bets.filter(x=>x.id!==b.dataset.del);persistBets();buildNav();render();return}
  if((b=t.closest('[data-perfil]'))){S.plan.perfil=b.dataset.perfil;LS.set('el.perfil',S.plan.perfil);keepScroll(renderMain);return}
  if((b=t.closest('[data-nplan]'))){S.plan.n=+b.dataset.nplan;LS.set('el.nplan',S.plan.n);keepScroll(renderMain);return}
  if((b=t.closest('[data-plan-reg]'))){
    const m=S.data.partidos.find(p=>key(p)===b.dataset.planReg);
    const x=planPicks(S.plan.saldo!=null?S.plan.saldo:Math.round(Math.max(0,(S.bank0!=null?S.bank0:S.bank)+S.bets.filter(closed).reduce((a,q)=>a+profitOf(q),0)-S.bets.filter(q=>q.estado==='pendiente').reduce((a,q)=>a+q.monto,0)))).top.find(i=>i.m===m&&i.id===b.dataset.id);
    if(x){registrarPlan([x]);toast('Apuesta registrada en tu historial');keepScroll(renderMain)}return}
  if(t.closest('#plan-all')){
    const sal=S.plan.saldo!=null?S.plan.saldo:Math.round(Math.max(0,(S.bank0!=null?S.bank0:S.bank)+S.bets.filter(closed).reduce((a,q)=>a+profitOf(q),0)-S.bets.filter(q=>q.estado==='pendiente').reduce((a,q)=>a+q.monto,0)));
    const items=planPicks(sal).top.filter(x=>!S.bets.some(q=>q.estado==='pendiente'&&q.legs.length===1&&q.legs[0].home===x.m.home&&q.legs[0].away===x.m.away&&(q.legs[0].id||q.legs[0].sel)===x.id));
    registrarPlan(items);toast(items.length+' apuestas registradas');keepScroll(renderMain);return}
  if(t.closest('#sync-on')){const v=($('gtok')||{}).value||'';if(v.trim().length<20)return toast('Pega el token completo');
    S.sync.tok=v.trim();S.sync.gist='';S.sync.msg='';LS.set('el.gtok',S.sync.tok);LS.set('el.gist','');sincronizar(true);return}
  if(t.closest('#sync-now')){sincronizar(true);return}
  if(t.closest('#sync-off')){S.sync.tok='';S.sync.gist='';S.sync.last=null;S.sync.msg='';LS.set('el.gtok','');LS.set('el.gist','');LS.set('el.glast',null);toast('Desconectado: tu historial sigue en este navegador');keepScroll(renderMain);return}
  if(t.closest('#exp-copy')){exportarHistorial();return}
  if(t.closest('#exp-csv')){exportarCSV();return}
  if(t.closest('#sim-reset')){S.sim={tipo:'todas',emin:-100,emax:100,pmin:0,cat:'',liga:'',casa:'',cmin:1,cmax:50,stake:'actual',fijo:10,pct:2};LS.set('el.sim',S.sim);keepScroll(renderMain);return}
  if(t.closest('#imp-go')){importarHistorial();return}
  if(t.closest('#save')){saveBet();return}
  if(t.closest('#clear')){S.slip.clear();refreshSlip();return}
  if(t.closest('#dclose')||t.id==='scrim'){closeDetail();return}
  if(t.closest('#slipbtn')){S.panel='boleta';renderDetail();openDetail();return}
  if((b=t.closest('#themeseg [data-theme]'))){S.theme=b.dataset.theme;LS.set('el.theme',S.theme);applyTheme();return}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.f==='w'){
    S.w=t.value/100;LS.set('el.w',+t.value);
    document.querySelectorAll('[data-f="w"]').forEach(x=>{if(x!==t)x.value=t.value});
    document.querySelectorAll('.wv').forEach(x=>x.textContent=t.value+'%');
    document.querySelectorAll('.wh').forEach(x=>x.textContent=wHint());
    clearTimeout(input.t);input.t=setTimeout(()=>{if(S.view==='partidos')paintDyn();else keepScroll(renderMain);renderDetail()},50)}
  else if(t.dataset&&t.dataset.f==='wauto'){S.wAuto=t.checked;LS.set('el.wauto',S.wAuto);buildFilters();if(S.view==='partidos')paintDyn();else keepScroll(renderMain);renderDetail()}
  else if(t.dataset&&t.dataset.f==='only'){S.only=t.checked;LS.set('el.only',S.only);
    document.querySelectorAll('[data-f="only"]').forEach(x=>{x.checked=S.only});
    if(S.view==='partidos')paintDyn();else keepScroll(renderMain)}
  else if(t.id==='q'){S.q=t.value;if(S.view!=='partidos'){setView('partidos')}else paintDyn()}
  else if(t.dataset&&t.dataset.mo){const l=S.slip.get(t.dataset.mo);if(l){const q=+t.value;l.mo=q>1?q:null;$('slipsum').innerHTML=slipSummary()}}
  else if(t.id==='bank'){S.bank=+t.value||0;LS.set('el.bank',S.bank)}
  else if(t.dataset&&t.dataset.p){const q=+t.value,p=+t.dataset.p,o=$(t.dataset.t);
    if(!q||q<=1){o.textContent='';return}const ed=p*q-1;o.innerHTML=`<br><b class="num ${ed>SUSP?'warn':ed>0?'good':'bad'}">${ed>0?'+':''}${(ed*100).toFixed(1)}%</b>`}
});
const input={t:0};
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='bank'){renderDetail()}
  else if(t.dataset&&t.dataset.sim){S.sim[t.dataset.sim]=t.type==='number'?(+t.value):t.value;LS.set('el.sim',S.sim);keepScroll(renderMain)}
  else if(t.dataset&&t.dataset.riesgo){S.riesgo[t.dataset.riesgo]=Math.max(0,+t.value||0);LS.set('el.riesgo',S.riesgo);keepScroll(renderMain)}
  else if(t.dataset&&t.dataset.meta){S.slipMeta[t.dataset.meta]=t.value;if(t.dataset.meta!=='nota')LS.set('el.'+t.dataset.meta,t.value)}
  else if(t.dataset&&t.dataset.f==='saldo'){S.plan.saldo=Math.max(0,+t.value||0);keepScroll(renderMain)}
  else if(t.dataset&&t.dataset.f==='bank0'){S.bank0=Math.max(0,+t.value||0);LS.set('el.bank0',S.bank0);keepScroll(renderMain)}
  else if(t.dataset&&t.dataset.bet){const b=S.bets.find(x=>x.id===t.dataset.bet);if(b){b.estado=t.value;b.u=Date.now();persistBets();render()}}
});
document.addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toLowerCase();
  if(e.key==='Escape'){if(tag==='input'){e.target.blur()}closeDetail();return}
  if(tag==='input'||tag==='textarea'||tag==='select')return;
  if(e.key==='/'){e.preventDefault();$('q').focus();return}
  if((e.key==='j'||e.key==='k')&&S.view==='partidos'){
    const rows=[...document.querySelectorAll('.mrow[data-k]')];if(!rows.length)return;
    let i=rows.findIndex(r=>r.dataset.k===S.sel);i=e.key==='j'?Math.min(rows.length-1,i+1):Math.max(0,i-1);
    S.sel=rows[i].dataset.k;S.panel='detalle';renderDetail();
    marcarSel(S.sel);rows[i].scrollIntoView({block:'nearest'});
  }
});
window.addEventListener('resize',()=>{if(!overlay())closeDetail()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sincronizar(false)});
init();
