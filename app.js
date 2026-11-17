const K='erp_cv_v3',$=s=>document.querySelector(s),r2=x=>Math.round((x+Number.EPSILON)*100)/100;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const R$=v=>v==null||isNaN(v)?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const P=v=>v==null||isNaN(v)?'—':(v*1).toFixed(2).replace('.',',')+'%';

if(window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ⚠️ COLE AQUI O UUID DA SUA EMPRESA (da tabela 'organizations')
const ORG_ID = '3c08f841-984c-4041-a3ff-52b326b27f5c';

let S = {
  cfg:{trib:8,com:5,taxa:2,mMin:15,mMed:25,mMax:35,ind:10,hora:35,pin:'1234'},
  dre:null, seq:1, qseq:1, sales:[], quotes:[], auth:[],
  mats:[
    {id:1,nome:'ACM',un:'m²',custo:180},
    {id:2,nome:'Estrutura metálica',un:'m',custo:22},
    {id:3,nome:'LED',un:'un',custo:3.5},
    {id:4,nome:'Fonte',un:'un',custo:45},
    {id:5,nome:'Parafuso',un:'un',custo:.4},
    {id:6,nome:'Vinil adesivo (rolo 50m×1,22m)',un:'m²',custo:20}
  ],
  prods:[
    {id:1,nome:'Fachada em ACM',cat:'Fachadas',horas:6,comp:[{m:1,q:4,perda:10},{m:2,q:12,perda:5},{m:3,q:30,perda:0},{m:4,q:2,perda:0},{m:5,q:40,perda:0}]},
    {id:2,nome:'Adesivo impresso m²',cat:'Adesivos',horas:.5,comp:[{m:6,q:1,perda:8}]}
  ]
};

// Salva localmente (cache rápido) e sincroniza com o Supabase
const save = async () => {
  try { localStorage.setItem(K, JSON.stringify(S)); } catch(e) {}
  if (typeof sb === 'undefined' || !me) return;

  const { data, error } = await sb.from('dashboard_data').upsert({
    organization_id: ORG_ID,
    payload: S,
    source_name: 'ERP_Comunicacao_Visual',
    updated_at: new Date().toISOString()
  }, { onConflict: 'organization_id' }).select();

  if (error) {
    console.error('Erro ao salvar no Supabase:', error.message);
    alert('Erro ao salvar na nuvem: ' + error.message);
  } else if (!data || data.length === 0) {
    alert('Bloqueio de segurança (RLS): O banco recusou a gravação dos dados.');
  }
};

let role='seller',page='dash',dr=null,cart=[],pos={pid:'',q:1,mode:'med',custom:'',pin:'',just:'',cliente:''},err='';
let prodFilter='',prodPage=1,impPreview=null,drePreview=null;

const adm=()=>role!='seller',isA=()=>role=='admin'||role=='staff';
const vp=()=>S.cfg.trib+S.cfg.com+S.cfg.taxa;
function cost(p){
  let mat=0;
  (p.comp||[]).forEach(c=>{
    const m=S.mats.find(x=>x.id==c.m);
    if(m)mat+=c.q/(1-(c.perda||0)/100)*m.custo;
  });
  const mo=(p.horas||0)*S.cfg.hora;
  const ind=(mat+mo)*S.cfg.ind/100;
  return{mat,mo,ind,tot:mat+mo+ind};
}
const price=(c,m)=>{const d=1-(vp()+m)/100;return d>0?r2(c/d):null};
function fx(p){const c=cost(p);return{c,min:price(c.tot,S.cfg.mMin),med:price(c.tot,S.cfg.mMed),max:price(c.tot,S.cfg.mMax)}}
function met(pr,c){const v=pr*vp()/100,lucro=pr-v-c.tot;return{lucro,margem:pr?lucro/pr:0,markup:c.tot?pr/c.tot:0,contrib:pr-v-c.mat-c.mo}}

const NAV=[['dash','Dashboard'],['ins','Insumos'],['prod','Produtos & Estoque'],['sim','Simulador'],['pdv','Orçamentos'],['ven','Vendas'],['cfg','DRE & Configurações']];
let V_USR;NAV.push(['usr','Usuários & Acessos']);
const DEF_SCR={admin:NAV.map(n=>n[0]),staff:NAV.map(n=>n[0]),manager:['dash','ins','prod','sim','pdv','ven'],seller:['prod','pdv','ven']};
const RL={admin:'Administrador',staff:'Administrador',manager:'Gerente',seller:'Vendedor'};

let U = []; // Lista de perfis carregados do Supabase
let me = null; // Perfil do usuário logado

const allowed=()=>{
  if(!me)return[];
  if(isA())return NAV.map(n=>n[0]);
  return NAV.map(n=>n[0]).filter(k=>k!='usr'&&(me.telas||DEF_SCR[me.role]||[]).includes(k));
};

// Tela de Login conectada ao Supabase Auth
function authScreen(){
  document.body.innerHTML=`<div style="min-height:100vh;display:grid;place-items:center;background:var(--nav);padding:20px">
    <form id="af" style="background:var(--sf);padding:28px;border-radius:14px;width:100%;max-width:380px;display:grid;gap:12px">
      <h2 style="margin:0">ERP Comunicação Visual</h2>
      <p class="mu" style="margin:0">Entre com seu e-mail e senha cadastrados.</p>
      <label>E-mail<input id="a_u" type="email" required autocomplete="email"></label>
      <label>Senha<input id="a_p" type="password" required autocomplete="current-password"></label>
      <div id="a_e" style="color:var(--er);font-size:13px"></div>
      <button id="a_btn" class="b" type="submit">Entrar</button>
    </form>
  </div>`;

  document.getElementById('af').onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('#a_btn');
    const errDiv = $('#a_e');
    btn.disabled = true;
    btn.textContent = 'Autenticando...';
    errDiv.textContent = '';

    const email = $('#a_u').value.trim();
    const password = $('#a_p').value;

    const { error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      errDiv.textContent = 'E-mail ou senha inválidos.';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    // Recarrega para inicializar a sessão e baixar os dados da nuvem
    location.reload();
  };
}

async function logout(){
  await sb.auth.signOut();
  location.reload();
}

// Gestão de Usuários e Permissões (via tabela profiles)
let ue=null;
V_USR=()=>{const scr=NAV.filter(n=>n[0]!='usr');
  return `<div class="card" style="padding:16px;margin-bottom:16px">
    <h3 style="margin-top:0">${ue?'Editar permissões de: '+esc(ue.nome||ue.email):'Gestão de Acessos (Supabase)'}</h3>
    <p class="mu" style="margin-top:0">Para adicionar um novo usuário, cadastre o e-mail e senha dele no painel <b>Authentication > Users</b> do Supabase. Ele aparecerá automaticamente na lista abaixo após o primeiro acesso (ou insira o UUID dele na tabela profiles).</p>
    ${ue?`
      <div class="row" style="flex-wrap:wrap;gap:10px">
        <label>Nome de Exibição<input id="u_n" value="${esc(ue?.nome||'')}"></label>
        <label>Perfil<select id="u_r" onchange="document.querySelectorAll('.u_t').forEach(c=>c.checked=DEF_SCR[this.value].includes(c.value))">
          <option value="admin" ${ue?.role=='admin'||ue?.role=='staff'?'selected':''}>Administrador</option>
          <option value="manager" ${ue?.role=='manager'?'selected':''}>Gerente</option>
          <option value="seller" ${ue?.role=='seller'?'selected':''}>Vendedor</option>
        </select></label>
      </div>
      <p class="mu" style="margin:12px 0 6px">Telas liberadas (administrador sempre vê todas):</p>
      <div class="row" style="flex-wrap:wrap;gap:14px">
        ${scr.map(n=>`<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" class="u_t" value="${n[0]}" ${(ue?.telas||DEF_SCR[ue?.role||'seller']).includes(n[0])?'checked':''}> ${n[1]}</label>`).join('')}
      </div>
      <div id="u_e" style="color:var(--er);margin-top:8px"></div>
      <div class="row" style="margin-top:10px;gap:8px">
        <button class="b" onclick="saveUsr()">Salvar Permissões</button>
        <button class="b g" onclick="ue=null;R()">Cancelar</button>
      </div>
    `:''}
  </div>
  <div class="card" style="padding:16px">
    <table style="width:100%">
      <thead><tr><th align="left">Nome</th><th align="left">E-mail / ID</th><th align="left">Perfil</th><th align="left">Telas</th><th align="left">Situação</th><th></th></tr></thead>
      <tbody>
        ${U.map(u=>`<tr>
          <td>${esc(u.nome||'Sem nome')}</td>
          <td><small class="mu">${esc(u.email||u.id)}</small></td>
          <td>${RL[u.role]||u.role}</td>
          <td class="mu">${u.role=='admin'||u.role=='staff'?'Todas':(u.telas||[]).map(k=>NAV.find(n=>n[0]==k)?.[1]).filter(Boolean).join(', ')||'Nenhuma'}</td>
          <td>${u.bloq?'<b style="color:var(--er)">Bloqueado</b>':'<span style="color:var(--ok)">Ativo</span>'}</td>
          <td style="white-space:nowrap">
            <button class="b g" onclick="ue=U.find(z=>z.id=='${u.id}');R()">Permissões</button> 
            ${u.id!=me.id?`<button class="b g" onclick="togB('${u.id}')">${u.bloq?'Desbloquear':'Bloquear'}</button>`:''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`};

async function saveUsr(){
  if(!ue)return;
  const n=$('#u_n').value.trim(), r=$('#u_r').value, t=[...document.querySelectorAll('.u_t:checked')].map(c=>c.value);
  if(ue.id==me.id && r!='admin' && r!='staff')return alert('Você não pode tirar seu próprio acesso de administrador.');
  
  const telas = (r=='admin'||r=='staff') ? DEF_SCR.admin : t;
  const { error } = await sb.from('profiles').update({ nome: n, role: r, telas }).eq('id', ue.id);
  
  if(error) return alert('Erro ao atualizar perfil: ' + error.message);
  
  ue.nome = n; ue.role = r; ue.telas = telas;
  ue = null;
  R();
}

async function togB(id){
  const u=U.find(z=>z.id==id);
  const novoStatus = !u.bloq;
  const { error } = await sb.from('profiles').update({ bloq: novoStatus }).eq('id', id);
  if(error) return alert('Erro ao alterar status: ' + error.message);
  u.bloq = novoStatus;
  R();
}

function go(p){page=p;dr=null;err='';R()}
function R(){
  if(!me)return authScreen();
  if(!allowed().length){document.querySelector('#app').innerHTML='<p style="padding:30px">Nenhuma tela liberada para você. <button class="b" onclick="logout()">Sair</button></p>';return}
  if(!allowed().includes(page))page=allowed()[0];
  $('#nav').innerHTML='<h1>ERP Comunicação Visual</h1>'+NAV.filter(n=>allowed().includes(n[0])).map(n=>`<button class="${n[0]==page?'on':''}" onclick="go('${n[0]}')">${n[1]}</button>`).join('');
  const t=NAV.find(n=>n[0]==page)[1];
  $('#app').innerHTML=`<div class="top"><h2>${t}</h2><div class="row"><span class="mu" style="margin-right:10px">${esc(me.nome)} · ${RL[me.role]}</span><button class="b g" onclick="logout()">Sair</button></div></div>`+V[page]();
  if(page==='sim')simO();
}
const V={};V.usr=()=>V_USR();

/* ================= DASHBOARD ================= */
let dper=30;const COL=['var(--ac)','var(--ok)','var(--wa)','var(--er)','#8b5cf6','#06b6d4'],kd=d=>new Date(d).toLocaleDateString('sv-SE');
const lg=a=>'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px">'+a.map(x=>`<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${x.c}"></i> ${esc(x.k)}</span>`).join('')+'</div>';
const hb=(rows,fmt)=>{const mx=Math.max(1e-9,...rows.map(r=>Math.abs(r.v)));return rows.length?rows.map(r=>`<div style="display:grid;grid-template-columns:minmax(80px,140px) 1fr 84px;gap:8px;align-items:center;margin:5px 0"><span title="${esc(r.k)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.k)}</span><div class="bar" title="${esc(r.k)}: ${fmt(r.v)}" style="width:${Math.abs(r.v)/mx*100}%;background:${r.c||'var(--ac)'}"></div><span>${fmt(r.v)}</span></div>`).join(''):'<p class="mu">Sem vendas no período.</p>'};
function donut(d){const t=d.reduce((a,x)=>a+x.v,0);if(!t)return'<p class="mu">Sem dados no período.</p>';let a=-Math.PI/2,s='';const pt=(r,z)=>(60+r*Math.cos(z)).toFixed(2)+' '+(60+r*Math.sin(z)).toFixed(2);
d.forEach((x,i)=>{if(x.v<=0)return;const f=x.v/t,b=a+Math.min(f,.9999)*2*Math.PI,l=f>.5?1:0;s+=`<path d="M${pt(50,a)}A50 50 0 ${l} 1 ${pt(50,b)}L${pt(30,b)}A30 30 0 ${l} 0 ${pt(30,a)}Z" fill="${COL[i%6]}"><title>${esc(x.k)}: ${R$(x.v)} (${P(f*100)})</title></path>`;a=b});
return`<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 120 120" width="150" height="150">${s}</svg>${lg(d.map((x,i)=>({k:x.k+' · '+P(x.v/t*100),c:COL[i%6]})))}</div>`}
function lineC(days,ser){const W=640,H=230,L=58,B=26,T=10,n=days.length,all=ser.flatMap(s=>s.v),mx=Math.max(1,...all),mn=Math.min(0,...all),X=i=>(L+i*(W-L-12)/Math.max(1,n-1)).toFixed(1),Y=v=>(T+(H-T-B)*(1-(v-mn)/(mx-mn))).toFixed(1);let g='';
for(let t=0;t<=4;t++){const v=mn+(mx-mn)*t/4;g+=`<line x1="${L}" x2="${W-8}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--bd)"/><text x="${L-6}" y="${+Y(v)+3}" font-size="10" text-anchor="end" fill="var(--mu)">${Math.round(v)}</text>`}
[0,Math.floor((n-1)/2),n-1].forEach(i=>g+=`<text x="${X(i)}" y="${H-8}" font-size="10" text-anchor="middle" fill="var(--mu)">${days[i].slice(8)}/${days[i].slice(5,7)}</text>`);
ser.forEach(s=>{g+=`<path d="${s.v.map((v,i)=>(i?'L':'M')+X(i)+' '+Y(v)).join('')}" fill="none" stroke="${s.c}" stroke-width="2"/>`;s.v.forEach((v,i)=>{if(v)g+=`<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${s.c}"><title>${s.k} em ${days[i].slice(8)}/${days[i].slice(5,7)}: ${R$(v)}</title></circle>`})});
return`<div class="sc"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:420px">${g}</svg></div>${lg(ser.map(s=>({k:s.k,c:s.c})))}`}

V.dash=()=>{
  const lim=Date.now()-dper*864e5,ok=S.sales.filter(s=>s.st=='ok'&&new Date(s.data)>=lim),sum=(f)=>ok.reduce((a,s)=>a+s.itens.reduce((b,i)=>b+f(i),0),0);
  const rec=ok.reduce((a,s)=>a+s.total,0),luc=sum(i=>i.lucro),cus=sum(i=>i.custo*i.q);
  const D={};ok.forEach(s=>{const d=D[kd(s.data)]=D[kd(s.data)]||{f:0,c:0,l:0};s.itens.forEach(i=>{d.f+=i.preco*i.q;d.c+=i.custo*i.q;d.l+=i.lucro})});
  const days=[];for(let i=dper-1;i>=0;i--)days.push(kd(Date.now()-i*864e5));const sv=k=>days.map(d=>r2((D[d]||{f:0,c:0,l:0})[k]));
  const pr={},cat={};ok.forEach(s=>s.itens.forEach(i=>{const p=pr[i.nome]=pr[i.nome]||{r:0,l:0};p.r+=i.preco*i.q;p.l+=i.lucro;const c=(S.prods.find(x=>x.id==i.pid)||{}).cat||'Outros';cat[c]=(cat[c]||0)+i.preco*i.q}));
  const rank=Object.entries(pr).sort((a,b)=>b[1].r-a[1].r).slice(0,6).map(([k,v])=>({k,v:v.r})),
  marg=Object.entries(pr).filter(x=>x[1].r).map(([k,v])=>{const m=v.l/v.r*100;return{k,v:m,c:m<S.cfg.mMin?'var(--er)':m<S.cfg.mMed?'var(--wa)':'var(--ok)'}}).sort((a,b)=>b.v-a.v).slice(0,6);
  const cp=S.prods.map(p=>({p,c:cost(p),f:fx(p)})).sort((a,b)=>b.c.tot-a.c.tot).slice(0,6),mxc=Math.max(1e-9,...cp.map(x=>x.c.tot)),mxp=Math.max(1e-9,...cp.map(x=>x.f.max||0));
  const tm=cp.reduce((a,x)=>a+x.c.mat,0),tl=cp.reduce((a,x)=>a+x.c.mo,0),ti=cp.reduce((a,x)=>a+x.c.ind,0);
  const k=(a,b,c)=>`<div class="k"><small>${a}</small><b class="${c||''}">${b}</b></div>`,cd=(t,b)=>`<div class="card"><b>${t}</b><div style="margin-top:8px">${b}</div></div>`;
  return`<div class="row" style="margin-bottom:12px"><label>Período<select onchange="dper=+this.value;R()">${[7,30,90].map(x=>`<option value="${x}" ${x==dper?'selected':''}>Últimos ${x} dias</option>`).join('')}</select></label>
  ${S.dre?`<div class="pill ok">DRE Contábil Vinculada: ${esc(S.dre.periodo||'Ativa')} (Custos Indiretos: ${P(S.cfg.ind)} | Tributos: ${P(S.cfg.trib)})</div>`:`<button class="b g" onclick="go('cfg')">Importar DRE da Contabilidade (PDF)</button>`}</div>
  <div class="grid">${k('Faturamento',R$(rec))}${k('Vendas',ok.length)}${k('Ticket médio',R$(ok.length?rec/ok.length:0))}${k('Custo dos produtos vendidos',R$(cus))}${k('Lucro estimado',R$(luc),luc<0?'er':'ok')}${k('Margem',P(rec?luc/rec*100:0))}${k('Catálogo ativo',S.prods.length+' itens')}</div>
  ${cd('Faturamento, custo e lucro por dia',lineC(days,[{k:'Faturamento',c:'var(--ac)',v:sv('f')},{k:'Custo',c:'var(--wa)',v:sv('c')},{k:'Lucro',c:'var(--ok)',v:sv('l')}]))}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
  ${cd('Ranking de produtos (faturamento)',hb(rank,R$))}${cd('Margem por produto (verde ≥ meta, amarelo ≥ mínima, vermelho abaixo)',hb(marg,v=>P(v)))}
  ${cd('Vendas por categoria',donut(Object.entries(cat).map(([k,v])=>({k,v}))))}${cd('Composição do custo industrial (top 6 catálogo)',donut([{k:'Materiais',v:tm},{k:'Mão de obra',v:tl},{k:'Indiretos',v:ti}]))}
  ${cd('Custo de fabricação por produto',cp.map(({p,c})=>`<div style="margin:7px 0"><div style="display:flex;justify-content:space-between"><span>${esc(p.nome)}</span><b>${R$(c.tot)}</b></div><div style="display:flex;width:${c.tot/mxc*100}%;height:14px;border-radius:3px;overflow:hidden"><div title="Materiais ${R$(c.mat)}" style="flex:${c.mat};background:var(--ac)"></div><div title="Mão de obra ${R$(c.mo)}" style="flex:${c.mo};background:var(--wa)"></div><div title="Indiretos ${R$(c.ind)}" style="flex:${c.ind};background:#8b5cf6"></div></div></div>`).join('')+lg([{k:'Materiais',c:'var(--ac)'},{k:'Mão de obra',c:'var(--wa)'},{k:'Indiretos',c:'#8b5cf6'}]))}
  ${cd('Faixas de preço por produto',cp.map(({p,f})=>`<div style="margin:7px 0"><span>${esc(p.nome)}</span>${[['Mín.',f.min,'var(--wa)'],['Méd.',f.med,'var(--ac)'],['Máx.',f.max,'var(--ok)']].map(([l,v,c])=>`<div style="display:grid;grid-template-columns:34px 1fr 84px;gap:6px;align-items:center"><small class="mu">${l}</small><div class="bar" title="${l} ${R$(v)}" style="height:8px;width:${(v||0)/mxp*100}%;background:${c}"></div><small>${R$(v)}</small></div>`).join('')}</div>`).join(''))}
  </div>`;
};

/* ================= INSUMOS ================= */
let insFilter='',insPage=1;
V.ins=()=>{
  const flt=insFilter.trim().toLowerCase();
  const list=flt?S.mats.filter(m=>m.nome.toLowerCase().includes(flt)||String(m.cod||'').toLowerCase().includes(flt)):S.mats;
  const perPage=50,totPages=Math.max(1,Math.ceil(list.length/perPage));
  if(insPage>totPages)insPage=totPages;
  const slice=list.slice((insPage-1)*perPage,insPage*perPage);
  return`<div class="card"><b>Novo insumo</b><div class="f" style="margin-top:8px"><label>Descrição<input id="in"></label><label>Unidade de consumo<input id="iu" value="m²"></label><label>Custo de compra (R$)<input id="ic" type="number" step="0.01"></label><label>Frete + despesas (R$)<input id="if" type="number" step="0.01" value="0"></label><label>Qtd por embalagem (na unid. de consumo)<input id="iq" type="number" step="0.001" value="1"></label></div>
  <div class="row" style="margin-top:8px"><label>Rolo: comprimento (m)<input id="rc" type="number" step="0.01" style="width:110px"></label><label>Largura (m)<input id="rl" type="number" step="0.01" style="width:110px"></label><button class="b g" onclick="rolo()">Calcular m² do rolo</button><button class="b" onclick="addIns()">Salvar insumo</button></div>${err?`<div class="msg er">${err}</div>`:''}</div>
  <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><label style="flex:1;min-width:220px">Buscar insumo (${list.length} cadastrado(s))<input value="${esc(insFilter)}" placeholder="Filtrar por código ou descrição..." oninput="insFilter=this.value;insPage=1;R()"></label>
  <div class="row"><button class="b g" onclick="insPage=Math.max(1,insPage-1);R()" ${insPage<=1?'disabled':''}>Anterior</button><span class="mu">Pág. ${insPage} de ${totPages}</span><button class="b g" onclick="insPage=Math.min(${totPages},insPage+1);R()" ${insPage>=totPages?'disabled':''}>Próxima</button></div></div>
  <div class="sc"><table><tr><th>Cód.</th><th>Descrição</th><th>Unidade</th><th>Custo unitário</th><th></th></tr>${slice.map(m=>`<tr><td>${esc(m.cod||'—')}</td><td>${esc(m.nome)}</td><td>${esc(m.un)}</td><td><input type="number" step="0.0001" value="${m.custo}" style="width:110px" onchange="setCusto(${m.id},this.value)"></td><td>${isA()?`<button class="b g" onclick="delIns(${m.id})">Excluir</button>`:''}</td></tr>`).join('')}</table></div></div>`;
};
function rolo(){$('#iq').value=r2(($('#rc').value*$('#rl').value)*1000)/1000}
function addIns(){const n=$('#in').value.trim(),c=+$('#ic').value+ +$('#if').value,q=+$('#iq').value;if(!n||!(c>0)||!(q>0)){err='Informe descrição, custo e quantidade por embalagem maiores que zero.';return R()}
S.mats.push({id:Date.now(),nome:n,un:$('#iu').value,custo:+(c/q).toFixed(4)});err='';save();R()}
function setCusto(id,v){if(!(+v>=0))return;S.mats.find(m=>m.id==id).custo=+v;save();R()}
function delIns(id){if(S.prods.some(p=>p.comp.some(c=>c.m==id))){err='Insumo usado em composição; remova da composição antes.';return R()}if(confirm('Excluir insumo?')){S.mats=S.mats.filter(m=>m.id!=id);save();R()}}

/* ================= IMPORTADOR FLEXÍVEL DE PLANILHAS (.XLS, .XLSX, .CSV) ================= */
function parseNumberFlex(v){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  let s=String(v??'').trim().replace(/[R$\s]/g,'');
  if(!s)return NaN;
  if(s.includes(',')&&s.includes('.')){
    if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(s.includes(','))s=s.replace(',','.');
  return parseFloat(s);
}
function normStr(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}

function extractItemsFromSheet(matrix){
  const items=[];
  let headerRowIdx=-1;
  let colMap=null;

  for(let r=0;r<Math.min(20,matrix.length);r++){
    const row=matrix[r]||[];
    const norms=row.map(normStr);
    const hasProduto=norms.some(x=>['produto','descricao','descricaodoproduto','item','nome','material'].includes(x));
    const hasCusto=norms.some(x=>['custo','custounitario','valor','valorunitario','preco','precocusto','total','precovenda'].includes(x));
    const hasUn=norms.some(x=>['un','unid','unidade','unidadecomercial','um'].includes(x));
    if(hasProduto&&(hasCusto||hasUn)){
      headerRowIdx=r;
      const pIdx=norms.findIndex(x=>['produto','descricao','descricaodoproduto','item','nome','material'].includes(x));
      const uIdx=norms.findIndex(x=>['un','unid','unidade','unidadecomercial','um'].includes(x));
      const cIdx=norms.findIndex(x=>['custo','custounitario','valor','valorunitario','preco','precocusto'].includes(x));
      const qIdx=norms.findIndex(x=>['quantest','quantidade','qtd','estoque','saldo','qtde'].includes(x));
      const lIdx=norms.findIndex(x=>['local','deposito','almoxarifado','categoria','grupo','setor'].includes(x));
      const fIdx=norms.findIndex(x=>['fornecedor','fabricante','marca'].includes(x));
      const ncmIdx=norms.findIndex(x=>['clasfiscal','ncm','ref','referencia','codigo'].includes(x));
      colMap={pIdx,uIdx,cIdx,qIdx,lIdx,fIdx,ncmIdx};
      break;
    }
  }

  const getCell=(row,idx,scanRight=2)=>{
    if(idx<0||!row)return '';
    for(let offset=0;offset<=scanRight;offset++){
      const val=row[idx+offset];
      if(val!==undefined&&val!==null&&String(val).trim()!=='')return val;
    }
    return '';
  };

  if(headerRowIdx>=0&&colMap){
    for(let r=headerRowIdx+1;r<matrix.length;r++){
      const row=matrix[r]||[];
      if(!row.some(c=>c!==undefined&&c!==null&&String(c).trim()!==''))continue;

      const c0=String(row[colMap.pIdx]??'').trim();
      const c1=String(row[colMap.pIdx+1]??'').trim();

      const low0=c0.toLowerCase();
      if(!c0&&!c1)continue;
      if(low0==='produto'||low0.startsWith('posição de estoque')||low0.startsWith('filtros:')||low0.startsWith('produtos valorados:')||low0.startsWith('log-')||low0.startsWith('http'))continue;

      let cod='',nome='';
      if(/^\d{4,}$/.test(c0)&&c1&&isNaN(Number(c1))){
        cod=c0;
        nome=c1;
      }else{
        nome=c0||c1;
      }
      if(!nome||nome.length<2)continue;

      const un=String(getCell(row,colMap.uIdx,1)||'UN').trim().toUpperCase();
      const local=String(getCell(row,colMap.lIdx,1)||'').trim();
      const fornecedor=String(getCell(row,colMap.fIdx,1)||'').trim();
      const ncm=String(getCell(row,colMap.ncmIdx,1)||'').trim();

      let custo=NaN;
      if(colMap.cIdx>=0){
        for(const off of [0,-1,1,2]){
          const cand=parseNumberFlex(row[colMap.cIdx+off]);
          if(Number.isFinite(cand)){custo=cand;break;}
        }
      }
      if(!Number.isFinite(custo))custo=0;

      let qtd=0;
      if(colMap.qIdx>=0){
        for(const off of [0,-1,1,2]){
          const cand=parseNumberFlex(row[colMap.qIdx+off]);
          if(Number.isFinite(cand)){qtd=cand;break;}
        }
      }

      items.push({cod,nome,un,custo,qtd,local,fornecedor,ncm});
    }
  }else{
    for(let r=0;r<matrix.length;r++){
      const row=(matrix[r]||[]).filter(x=>x!==undefined&&x!==null&&String(x).trim()!=='');
      if(row.length<2)continue;
      const texts=row.filter(x=>isNaN(parseNumberFlex(x))&&String(x).trim().length>2);
      const nums=row.map(parseNumberFlex).filter(n=>Number.isFinite(n));
      if(texts.length&&nums.length){
        const nome=String(texts[0]).trim();
        if(/^(produto|descri|total|pagina|filtro)/i.test(nome))continue;
        items.push({
          cod:/^\d{4,}$/.test(String(row[0]).trim())?String(row[0]).trim():'',
          nome,
          un:'UN',
          custo:nums[0]||0,
          qtd:nums[1]||0,
          local:'Importados',
          fornecedor:'',
          ncm:''
        });
      }
    }
  }

  return items;
}

async function handleSheetFile(file){
  if(!file)return;
  const ext=file.name.split('.').pop().toLowerCase();
  const buf=await file.arrayBuffer();
  let matrix=[];

  if(window.XLSX){
    const wb=XLSX.read(buf,{type:'array'});
    const firstSheet=wb.Sheets[wb.SheetNames[0]];
    matrix=XLSX.utils.sheet_to_json(firstSheet,{header:1,defval:''});
  }else if(ext==='csv'||ext==='txt'){
    const text=new TextDecoder('utf-8').decode(buf).replace(/^﻿/,'');
    const delim=(text.split(/\r?\n/,1)[0].match(/;/g)||[]).length>=(text.split(/\r?\n/,1)[0].match(/,/g)||[]).length?';':',';
    matrix=text.split(/\r?\n/).map(line=>line.split(delim).map(c=>c.replace(/^"|"$/g,'')));
  }else{
    throw new Error('Biblioteca de leitura XLS/XLSX não carregada. Verifique sua conexão ou salve como CSV.');
  }

  const rawItems=extractItemsFromSheet(matrix);
  if(!rawItems.length)throw new Error('Nenhum produto válido foi identificado na planilha.');

  const map=new Map();
  for(const it of rawItems){
    const key=(it.cod?it.cod+'::':'')+it.nome.toUpperCase();
    if(!map.has(key)){
      map.set(key,{...it});
    }else{
      const prev=map.get(key);
      prev.qtd=r2((prev.qtd||0)+(it.qtd||0));
      if((it.custo||0)>(prev.custo||0))prev.custo=it.custo;
      if(!prev.local&&it.local)prev.local=it.local;
    }
  }

  const consolidated=[...map.values()];
  impPreview={
    fileName:file.name,
    totalLinhas:rawItems.length,
    unicos:consolidated.length,
    comCusto:consolidated.filter(x=>x.custo>0).length,
    items:consolidated
  };
  R();
}

function confirmImportSheet(){
  if(!impPreview||!impPreview.items.length)return;
  const dest=$('#impDestino')?.value||'ambos';
  const onlyWithCost=$('#impOnlyCost')?.checked||false;
  const replaceMode=$('#impReplace')?.checked||false;

  let list=impPreview.items;
  if(onlyWithCost)list=list.filter(x=>x.custo>0);
  if(!list.length){alert('Nenhum item atende ao filtro selecionado.');return;}

  if(replaceMode){
    if(dest==='produtos'||dest==='ambos')S.prods=[];
    if(dest==='insumos'||dest==='ambos')S.mats=[];
  }

  let addedP=0,addedM=0;
  const baseId=Date.now();

  list.forEach((it,idx)=>{
    const matId=baseId+idx*2+1;
    const prodId=baseId+idx*2+2;
    const cat=it.local?it.local.split('-')[0].trim():'Importados';

    if(dest==='insumos'||dest==='ambos'){
      const existM=S.mats.find(m=>(it.cod&&m.cod===it.cod)||m.nome.toLowerCase()===it.nome.toLowerCase());
      if(existM){
        if(it.custo>0)existM.custo=it.custo;
        existM.un=it.un||existM.un;
      }else{
        S.mats.push({id:matId,cod:it.cod,nome:it.nome,un:it.un||'UN',custo:it.custo||0});
        addedM++;
      }
    }

    if(dest==='produtos'||dest==='ambos'){
      const linkedMat=S.mats.find(m=>(it.cod&&m.cod===it.cod)||m.nome.toLowerCase()===it.nome.toLowerCase());
      const useMatId=linkedMat?linkedMat.id:matId;
      if(!linkedMat){
        S.mats.push({id:matId,cod:it.cod,nome:it.nome,un:it.un||'UN',custo:it.custo||0});
      }
      const existP=S.prods.find(p=>(it.cod&&p.cod===it.cod)||p.nome.toLowerCase()===it.nome.toLowerCase());
      if(existP){
        existP.quantidade=it.qtd;
        existP.un=it.un;
        if(it.custo>0&&existP.comp&&existP.comp.length===1){
          const mObj=S.mats.find(m=>m.id===existP.comp[0].m);
          if(mObj)mObj.custo=it.custo;
        }
      }else{
        S.prods.push({
          id:prodId,
          cod:it.cod,
          nome:it.nome,
          cat:cat||'Importados',
          horas:0,
          comp:[{m:useMatId,q:1,perda:0}],
          un:it.un||'UN',
          quantidade:it.qtd||0,
          fornecedor:it.fornecedor||''
        });
        addedP++;
      }
    }
  });

  impPreview=null;
  save();
  alert('Importação concluída!\nItens processados: '+list.length+'\nNovos produtos no catálogo: '+addedP+'\nNovos insumos: '+addedM);
  R();
}

/* ================= PRODUTOS & ESTOQUE ================= */
V.prod=()=>{
  if(dr)return prodForm();
  const flt=prodFilter.trim().toLowerCase();
  const filtered=flt?S.prods.filter(p=>p.nome.toLowerCase().includes(flt)||String(p.cod||'').toLowerCase().includes(flt)||String(p.cat||'').toLowerCase().includes(flt)):S.prods;
  const perPage=50,totPages=Math.max(1,Math.ceil(filtered.length/perPage));
  if(prodPage>totPages)prodPage=totPages;
  const pageItems=filtered.slice((prodPage-1)*perPage,prodPage*perPage);

  let impHtml=`<div class="card">
    <div class="row" style="justify-content:space-between">
      <div>
        <b>Importação Liberada de Planilhas (.XLS, .XLSX, .CSV)</b>
        <div class="mu" style="margin-top:4px">Compatível com relatórios de Posição de Estoque (ERP Êxitho/Dessis), planilhas com cabeçalhos mesclados ou tabelas simples.</div>
      </div>
      <span class="pill ok">Leitura Automática Ativa</span>
    </div>
    <div class="row" style="margin-top:12px">
      <label>Selecionar arquivo de estoque/produtos
        <input id="fileProdutos" type="file" accept=".xls,.xlsx,.csv,.txt" onchange="if(this.files[0])handleSheetFile(this.files[0]).catch(e=>alert(e.message))">
      </label>
      ${S.dre?`<div class="badge-tag">Rateio DRE ativo: +${P(S.cfg.ind)} indiretos e ${P(S.cfg.trib)} tributos já aplicados no preço</div>`:`<button class="b g" onclick="go('cfg')">Vincular DRE Contábil (PDF) para rateio de custos</button>`}
    </div>`;

  if(impPreview){
    impHtml+=`<div class="box-highlight">
      <div class="row" style="justify-content:space-between">
        <div>
          <b>Pré-visualização: ${esc(impPreview.fileName)}</b><br>
          <span class="mu">Linhas lidas: <b>${impPreview.totalLinhas}</b> · Itens únicos consolidados: <b>${impPreview.unicos}</b> · Itens com custo > R$ 0,00: <b>${impPreview.comCusto}</b></span>
        </div>
        <button class="b g" onclick="impPreview=null;R()">Cancelar</button>
      </div>
      <div class="row" style="margin-top:12px">
        <label>Destino da importação
          <select id="impDestino">
            <option value="ambos" selected>Produtos e Insumos (Recomendado)</option>
            <option value="produtos">Somente Catálogo de Produtos</option>
            <option value="insumos">Somente Tabela de Insumos</option>
          </select>
        </label>
        <label style="flex-direction:row;align-items:center;gap:6px;padding-bottom:8px">
          <input type="checkbox" id="impOnlyCost"> Importar somente itens com custo maior que zero (${impPreview.comCusto})
        </label>
        <label style="flex-direction:row;align-items:center;gap:6px;padding-bottom:8px">
          <input type="checkbox" id="impReplace"> Substituir catálogo atual antes de importar
        </label>
        <button class="b okb" onclick="confirmImportSheet()">Confirmar Importação (${impPreview.unicos} itens)</button>
      </div>
      <div class="sc" style="margin-top:10px;max-height:220px">
        <table>
          <tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Local / Grupo</th><th>Custo Unit.</th><th>Qtd. Estoque</th></tr>
          ${impPreview.items.slice(0,15).map(x=>`<tr><td>${esc(x.cod||'—')}</td><td>${esc(x.nome)}</td><td>${esc(x.un)}</td><td>${esc(x.local||'—')}</td><td>${R$(x.custo)}</td><td>${x.qtd}</td></tr>`).join('')}
        </table>
      </div>
      <small class="mu">Exibindo os primeiros 15 registros consolidados de ${impPreview.unicos}.</small>
    </div>`;
  }
  impHtml+=`</div>`;

  return `${impHtml}
  <div class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:12px">
      <div class="row" style="flex:1">
        ${isA()||role=='manager'?'<button class="b" onclick="newP()">+ Novo produto</button>':''}
        <label style="flex:1;min-width:220px">Buscar produto (${filtered.length} no catálogo)
          <input value="${esc(prodFilter)}" placeholder="Digite código, nome ou categoria..." oninput="prodFilter=this.value;prodPage=1;R()">
        </label>
      </div>
      <div class="row">
        <button class="b g" onclick="prodPage=Math.max(1,prodPage-1);R()" ${prodPage<=1?'disabled':''}>Anterior</button>
        <span class="mu">Pág. ${prodPage} de ${totPages}</span>
        <button class="b g" onclick="prodPage=Math.min(${totPages},prodPage+1);R()" ${prodPage>=totPages?'disabled':''}>Próxima</button>
      </div>
    </div>
    <div class="sc">
      <table>
        <tr><th>Cód.</th><th>Produto</th><th>Categoria</th>${adm()?'<th>Custo Base</th><th>Rateio Indir.</th><th>Custo Total</th>':''}<th>Preço Mín.</th><th>Preço Médio</th><th>Preço Máx.</th><th></th></tr>
        ${pageItems.map(p=>{
          const f=fx(p);
          return`<tr>
            <td>${esc(p.cod||'—')}</td>
            <td><b>${esc(p.nome)}</b>${p.un?`<br><small class="mu">Un: ${esc(p.un)} · Estoque: ${esc(p.quantidade??0)}</small>`:''}</td>
            <td>${esc(p.cat)}</td>
            ${adm()?`<td>${R$(f.c.mat+f.c.mo)}</td><td>${R$(f.c.ind)}</td><td><b>${R$(f.c.tot)}</b></td>`:''}
            <td>${R$(f.min)}</td>
            <td><b class="ok">${R$(f.med)}</b></td>
            <td>${R$(f.max)}</td>
            <td>${isA()||role=='manager'?`<button class="b g" onclick="editP(${p.id})">Composição</button> <button class="b g" onclick="dupP(${p.id})">Duplicar</button> <button class="b d" onclick="deleteProduct(${p.id})">Excluir</button>`:''}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="10" class="mu">Nenhum produto encontrado.</td></tr>'}
      </table>
    </div>
  </div>`;
};

const newP=()=>{dr={id:Date.now(),cod:'',nome:'',cat:'Fachadas',horas:1,comp:[]};R()};
const editP=id=>{dr=JSON.parse(JSON.stringify(S.prods.find(p=>p.id==id)));R()};
const dupP=id=>{const p=JSON.parse(JSON.stringify(S.prods.find(p=>p.id==id)));p.id=Date.now();p.nome+=' (cópia)';S.prods.push(p);save();R()};
function deleteProduct(id){const p=S.prods.find(x=>x.id==id);if(!p)return;if(!confirm(`Excluir o produto “${p.nome}” do catálogo?`))return;S.prods=S.prods.filter(x=>x.id!=id);if(pos.pid==id)pos.pid='';save();R()}
function prodForm(){
  const c=cost(dr),cats=['Fachadas','Letreiros','Luminosos','Adesivos','Lonas','Placas','Totens','Displays','Comunicação interna','Impressão digital','Projetos especiais','Importados'];
  return`<div class="card"><div class="f">
    <label>Código<input value="${esc(dr.cod||'')}" onchange="dr.cod=this.value"></label>
    <label>Nome<input value="${esc(dr.nome)}" onchange="dr.nome=this.value"></label>
    <label>Categoria<select onchange="dr.cat=this.value">${cats.map(x=>`<option ${x==dr.cat?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Horas de mão de obra<input type="number" step="0.1" value="${dr.horas||0}" onchange="dr.horas=+this.value;R()"></label>
  </div></div>
  <div class="card sc"><b>Ficha técnica</b><table><tr><th>Material</th><th>Qtd líquida</th><th>Perda %</th><th>Qtd bruta</th><th>Custo</th><th></th></tr>${(dr.comp||[]).map((r,i)=>{const m=S.mats.find(x=>x.id==r.m),br=r.q/(1-(r.perda||0)/100);return`<tr><td><select onchange="dr.comp[${i}].m=+this.value;R()">${S.mats.slice(0,300).map(x=>`<option value="${x.id}" ${x.id==r.m?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></td><td><input type="number" step="0.001" style="width:90px" value="${r.q}" onchange="dr.comp[${i}].q=+this.value;R()"> ${m?esc(m.un):''}</td><td><input type="number" step="0.1" style="width:70px" value="${r.perda||0}" onchange="dr.comp[${i}].perda=Math.min(99,+this.value);R()"></td><td>${br.toFixed(3)}</td><td>${R$(m?br*m.custo:0)}</td><td><button class="b g" onclick="dr.comp.splice(${i},1);R()">×</button></td></tr>`}).join('')}</table><button class="b g" style="margin-top:8px" onclick="if(!S.mats.length)return alert('Cadastre um insumo antes');dr.comp.push({m:S.mats[0].id,q:1,perda:0});R()">+ Material</button></div>
  <div class="grid"><div class="k"><small>Materiais</small><b>${R$(c.mat)}</b></div><div class="k"><small>Mão de obra</small><b>${R$(c.mo)}</b></div><div class="k"><small>Indiretos / DRE (${P(S.cfg.ind)})</small><b>${R$(c.ind)}</b></div><div class="k"><small>Custo industrial total</small><b>${R$(c.tot)}</b></div></div>
  <div class="row"><button class="b" onclick="saveP()">Salvar</button><button class="b g" onclick="dr=null;R()">Cancelar</button></div>${err?`<div class="msg er">${err}</div>`:''}`;
}
function saveP(){if(!dr.nome.trim()){err='Informe o nome.';return R()}const i=S.prods.findIndex(p=>p.id==dr.id);i<0?S.prods.push(dr):S.prods[i]=dr;dr=null;err='';save();R()}

/* ================= SIMULADOR ================= */
V.sim=()=>`<div class="card"><div class="f"><label>Produto<select id="sp" oninput="simO()">${S.prods.slice(0,500).map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label><label>Margem desejada %<input id="sg" type="number" value="${S.cfg.mMed}" oninput="simO()"></label><label>Tributos %<input id="st" type="number" value="${S.cfg.trib}" oninput="simO()"></label><label>Comissão %<input id="sc" type="number" value="${S.cfg.com}" oninput="simO()"></label><label>Custo de materiais ±%<input id="sm" type="number" value="0" oninput="simO()"></label><label>Quantidade<input id="sq" type="number" value="1" oninput="simO()"></label><label>Desconto %<input id="sd" type="number" value="0" oninput="simO()"></label><label>Preço personalizado (unit.)<input id="sx" type="number" step="0.01" oninput="simO()"></label></div></div><div id="so" class="grid"></div><p class="mu">A simulação não altera os dados oficiais do produto e já considera o rateio de custos indiretos (${P(S.cfg.ind)}).</p>`;
function simO(){const el=$('#sp');if(!el)return;const p=S.prods.find(x=>x.id==el.value);if(!p)return;const c=cost(p),f=n=>+$('#'+n).value||0,mat=c.mat*(1+f('sm')/100),mo=c.mo,tot=(mat+mo)*(1+S.cfg.ind/100),v=f('st')+f('sc')+S.cfg.taxa,d=1-(v+f('sg'))/100;
if(d<=0){$('#so').innerHTML='<div class="msg er">Percentuais + margem somam 100% ou mais: preço matematicamente inválido.</div>';return}
const sug=r2(tot/d);let pr=(f('sx')||sug)*(1-f('sd')/100);const q=f('sq')||1,rec=pr*q,lucro=rec-rec*v/100-tot*q,contrib=rec-rec*v/100-(mat+mo)*q;
const k=(a,b,c2)=>`<div class="k"><small>${a}</small><b class="${c2||''}">${b}</b></div>`;
$('#so').innerHTML=k('Preço sugerido',R$(sug))+k('Preço aplicado (unit.)',R$(pr))+k('Receita',R$(rec))+k('Lucro estimado',R$(luc),lucro<0?'er':'ok')+k('Margem sobre venda',P(rec?lucro/rec*100:0))+k('Markup (×)',(tot?pr/tot:0).toFixed(2).replace('.',','))+k('Margem de contribuição',R$(contrib))}

/* ================= ORÇAMENTOS / PDV ================= */
V.pdv=()=>{
  const p=S.prods.find(x=>x.id==pos.pid),f=p&&fx(p);
  let h=`<div class="card"><div class="f"><label>Cliente (opcional)<input id="clienteOrc" value="${esc(pos.cliente||'')}" onchange="pos.cliente=this.value"></label><label>Produto<select onchange="pos.pid=+this.value;R()"><option value="">Selecione…</option>${S.prods.slice(0,500).map(x=>`<option value="${x.id}" ${x.id==pos.pid?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></label>`;
  if(p){
    const pr=pos.mode=='custom'?+pos.custom||0:f[pos.mode],below=pr<f.min-.004,mid=!below&&pr<f.med-.004,m=met(pr,f.c);
    h+=`<label>Quantidade<input type="number" min="1" value="${pos.q}" onchange="pos.q=Math.max(1,+this.value)"></label></div>
    <div class="tri" style="margin:12px 0">${['min','med','max'].map(k=>`<div><small>${{min:'Mínimo',med:'Médio',max:'Máximo'}[k]}</small><b>${R$(f[k])}</b><button class="b ${pos.mode==k?'':'g'}" onclick="pos.mode='${k}';R()">Aplicar</button></div>`).join('')}</div>
    <div class="row"><label>Preço personalizado<input type="number" step="0.01" value="${pos.custom}" onchange="pos.custom=this.value;pos.mode='custom';R()"></label><span class="pill ${below?'er':mid?'wa':'ok'}">${below?'CRÍTICO: abaixo do mínimo':mid?'Atenção: abaixo do recomendado':'Preço normal'}</span></div>
    ${adm()?`<p class="mu">Custo industrial ${R$(f.c.tot)} (base ${R$(f.c.mat+f.c.mo)} + rateio ${R$(f.c.ind)}) · markup ${m.markup.toFixed(2).replace('.',',')}× · margem ${P(m.margem*100)} · lucro un. ${R$(m.lucro)}</p>`:''}
    ${below?`<div class="msg wa">Venda abaixo do mínimo exige justificativa${role=='seller'?' e PIN de gerente/administrador':''}.<div class="row" style="margin-top:6px"><label>Justificativa<input value="${esc(pos.just)}" onchange="pos.just=this.value"></label>${role=='seller'?`<label>PIN do gerente<input type="password" style="width:100px" onchange="pos.pin=this.value"></label>`:''}</div></div>`:''}
    <button class="b" style="margin-top:10px" onclick="addC(${pr},${below})">Adicionar ao carrinho</button>`;
  }else h+='</div>';
  h+=err?`<div class="msg er">${err}</div>`:'';h+='</div>';
  const tot=cart.reduce((a,i)=>a+i.preco*i.q,0),luc=cart.reduce((a,i)=>a+i.lucro,0);
  h+=`<div class="card sc"><b>Carrinho</b>${cart.length?`<table><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr>${cart.map((i,n)=>`<tr><td>${esc(i.nome)}</td><td>${i.q}</td><td>${R$(i.preco)}</td><td>${R$(i.preco*i.q)}</td><td><button class="b g" onclick="cart.splice(${n},1);R()">×</button></td></tr>`).join('')}</table><p><b>Total ${R$(tot)}</b>${adm()?` · lucro ${R$(luc)} · margem ponderada ${P(tot?luc/tot*100:0)}`:''}</p><div class="row"><label>Pagamento<select id="pg"><option>Dinheiro</option><option>PIX</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência</option></select></label><button class="b" onclick="makeQuote()">Gerar orçamento</button><button class="b g" onclick="exportCurrentQuote()">Excel</button><button class="b g" onclick="fin()">Registrar venda</button></div>`:'<p class="mu">Carrinho vazio.</p>'}</div>`;
  return h;
};
function addC(pr,below){const p=S.prods.find(x=>x.id==pos.pid),f=fx(p);err='';if(!(pr>0)){err='Informe um preço válido.';return R()}
if(below){if(!pos.just.trim()){err='Justificativa obrigatória.';return R()}if(role=='seller'&&pos.pin!=S.cfg.pin){err='PIN de autorização inválido.';return R()}
S.auth.push({data:new Date().toISOString(),por:role=='seller'?'Gerente/Admin (PIN)':role,produto:p.nome,original:f.min,concedido:pr,just:pos.just})}
cart.push({pid:p.id,nome:p.nome,q:pos.q,preco:pr,custo:r2(f.c.tot),mat:f.c.mat,mo:f.c.mo,min:f.min,med:f.med,par:{trib:S.cfg.trib,com:S.cfg.com,taxa:S.cfg.taxa,mMin:S.cfg.mMin,mMed:S.cfg.mMed,mMax:S.cfg.mMax},lucro:(pr-pr*vp()/100-f.c.tot)*pos.q});
pos.pin='';pos.just='';save();R()}
function fin(){const cliente=($('#clienteOrc')?.value||pos.cliente||'').trim();const num=S.seq++;const tot=r2(cart.reduce((a,i)=>a+i.preco*i.q,0));S.sales.push({num,data:new Date().toISOString(),vend:role,cliente,pag:$('#pg').value,total:tot,st:'ok',itens:cart.map(i=>({...i,lucro:r2(i.lucro)}))});cart=[];pos.cliente='';save();alert('Venda registrada.');go('ven')}

const isoDay=d=>new Date(d).toLocaleDateString('sv-SE');
const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
function downloadText(name,text,type='text/csv;charset=utf-8'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿',text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
function printDoc(title,body){const w=window.open('','_blank','width=900,height=700');if(!w){alert('Permita a abertura de janelas para gerar o PDF.');return}w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px Arial,sans-serif;color:#17243c;margin:32px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ddd;padding:9px;text-align:left}th{background:#f4f6fa}.total{text-align:right;font-size:19px;margin-top:18px}.meta{color:#56647b}@media print{button{display:none}}</style><h1>${esc(title)}</h1>${body}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></html>`);w.document.close()}
function quoteHtml(q){return `<p class="meta">Orçamento nº ${q.num} · ${new Date(q.data).toLocaleString('pt-BR')} · Cliente: <b>${esc(q.cliente||'Não informado')}</b></p><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>${q.itens.map(i=>`<tr><td>${esc(i.nome)}</td><td>${i.q}</td><td>${R$(i.preco)}</td><td>${R$(i.preco*i.q)}</td></tr>`).join('')}</tbody></table><p class="total"><b>Total: ${R$(q.total)}</b></p><p class="meta">Documento de orçamento, sem valor fiscal.</p>`}
function exportQuote(q){const rows=[['Orçamento',q.num],['Data',new Date(q.data).toLocaleString('pt-BR')],['Cliente',q.cliente||''],[],['Produto','Quantidade','Valor unitário','Subtotal'],...q.itens.map(i=>[i.nome,i.q,i.preco,r2(i.q*i.preco)]),[],['Total',q.total]];downloadText(`orcamento-${q.num}.csv`,rows.map(r=>r.map(csvCell).join(';')).join('\n'))}
function makeQuote(){if(!cart.length){err='Adicione pelo menos um produto ao orçamento.';return R()}const q={num:S.qseq++,data:new Date().toISOString(),cliente:($('#clienteOrc')?.value||'').trim(),itens:cart.map(i=>({...i})),total:r2(cart.reduce((a,i)=>a+i.preco*i.q,0)),status:'Aberto'};S.quotes.push(q);save();printDoc(`Orçamento ${q.num}`,quoteHtml(q));alert(`Orçamento ${q.num} salvo no histórico.`);R()}
function exportQuotes(){const rows=[['Nº','Data','Cliente','Produtos','Total','Status'],...S.quotes.map(q=>[q.num,new Date(q.data).toLocaleString('pt-BR'),q.cliente,q.itens.map(i=>i.nome+' ×'+i.q).join(' | '),q.total,q.status])];downloadText('orcamentos.csv',rows.map(r=>r.map(csvCell).join(';')).join('\n'))}
function openQuote(n){const q=S.quotes.find(x=>x.num==n);if(q)printDoc(`Orçamento ${q.num}`,quoteHtml(q))}
function exportCurrentQuote(){if(!cart.length){alert('Carrinho vazio.');return}const q={num:'rascunho',data:new Date().toISOString(),cliente:($('#clienteOrc')?.value||'').trim(),itens:cart,total:r2(cart.reduce((a,i)=>a+i.preco*i.q,0))};exportQuote(q)}

/* ================= VENDAS ================= */
let vf={ini:'',fim:'',produto:'',cliente:''};
function salesFiltered(){return S.sales.filter(s=>(role!='seller'||s.vend=='seller')&&(!vf.ini||isoDay(s.data)>=vf.ini)&&(!vf.fim||isoDay(s.data)<=vf.fim)&&(!vf.cliente||(s.cliente||'').toLowerCase().includes(vf.cliente.toLowerCase()))&&(!vf.produto||s.itens.some(i=>i.nome.toLowerCase().includes(vf.produto.toLowerCase())))).slice().reverse()}
function exportSales(kind){const l=salesFiltered();if(kind==='pdf'){const body=`<p class="meta">Vendas filtradas · ${l.length} registro(s)</p><table><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Produtos</th><th>Total</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>${l.map(s=>`<tr><td>${s.num}</td><td>${new Date(s.data).toLocaleString('pt-BR')}</td><td>${esc(s.cliente||'—')}</td><td>${s.itens.map(i=>esc(i.nome)+' ×'+i.q).join(', ')}</td><td>${R$(s.total)}</td><td>${esc(s.pag)}</td><td>${s.st=='ok'?'Válida':'Estornada'}</td></tr>`).join('')}</tbody></table>`;printDoc('Relatório de vendas',body);return}const rows=[['Nº','Data','Cliente','Produtos','Total','Pagamento','Status'],...l.map(s=>[s.num,new Date(s.data).toLocaleString('pt-BR'),s.cliente||'',s.itens.map(i=>i.nome+' ×'+i.q).join(' | '),s.total,s.pag,s.st])];downloadText('vendas.csv',rows.map(r=>r.map(csvCell).join(';')).join('\n'))}
V.ven=()=>{const l=salesFiltered();return `<div class="card"><div class="f"><label>Data inicial<input type="date" value="${vf.ini}" onchange="vf.ini=this.value;R()"></label><label>Data final<input type="date" value="${vf.fim}" onchange="vf.fim=this.value;R()"></label><label>Produto<input value="${esc(vf.produto)}" onchange="vf.produto=this.value;R()"></label><label>Cliente<input value="${esc(vf.cliente)}" onchange="vf.cliente=this.value;R()"></label></div><div class="row" style="margin-top:12px"><button class="b g" onclick="vf={ini:'',fim:'',produto:'',cliente:''};R()">Limpar filtros</button><button class="b" onclick="exportSales('pdf')">Exportar PDF</button><button class="b g" onclick="exportSales('excel')">Exportar Excel</button><span class="mu">${l.length} venda(s)</span></div></div><div class="card sc"><table><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Total</th>${adm()?'<th>Custo reg.</th><th>Lucro</th><th>Margem</th>':''}<th>Pgto</th><th>Status</th><th></th></tr>${l.map(s=>{const c=s.itens.reduce((a,i)=>a+i.custo*i.q,0),lu=s.itens.reduce((a,i)=>a+i.lucro,0);return`<tr><td>${s.num}</td><td>${new Date(s.data).toLocaleString('pt-BR')}</td><td>${esc(s.cliente||'—')}</td><td>${s.itens.map(i=>esc(i.nome)+' ×'+i.q).join(', ')}</td><td>${R$(s.total)}</td>${adm()?`<td>${R$(c)}</td><td class="${lu<0?'er':''}">${R$(lu)}</td><td>${P(s.total?lu/s.total*100:0)}</td>`:''}<td>${esc(s.pag)}</td><td class="${s.st=='ok'?'ok':'er'}">${s.st=='ok'?'Válida':'Estornada'}</td><td>${adm()&&s.st=='ok'?`<button class="b g" onclick="est(${s.num})">Estornar</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="12" class="mu">Nenhuma venda encontrada com esses filtros.</td></tr>'}</table></div><div class="card"><div class="row" style="justify-content:space-between"><b>Orçamentos recentes</b><button class="b g" onclick="exportQuotes()">Exportar orçamentos em Excel</button></div><div class="sc"><table><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Total</th><th></th></tr>${S.quotes.slice().reverse().map(q=>`<tr><td>${q.num}</td><td>${new Date(q.data).toLocaleString('pt-BR')}</td><td>${esc(q.cliente||'—')}</td><td>${q.itens.map(i=>esc(i.nome)+' ×'+i.q).join(', ')}</td><td>${R$(q.total)}</td><td><button class="b g" onclick="openQuote(${q.num})">Gerar PDF</button><button class="b g" onclick="exportQuote(S.quotes.find(x=>x.num==${q.num}))">Excel</button></td></tr>`).join('')||'<tr><td colspan="6" class="mu">Nenhum orçamento gerado.</td></tr>'}</table></div></div>`};
function est(n){if(confirm('Estornar a venda '+n+'? O registro será mantido como estornado.')){const s=S.sales.find(x=>x.num==n);s.st='estornada';s.estData=new Date().toISOString();save();R()}}

/* ================= LEITOR DE DRE DA CONTABILIDADE EM PDF ================= */
function parseBRLValue(str){
  const matches=str.match(/\(?\-?\s*\d{1,3}(?:\.\d{3})*,\d{2}\)?/g);
  if(!matches||!matches.length)return null;
  let raw=matches[matches.length-1].trim();
  const neg=raw.startsWith('(')||raw.startsWith('-');
  raw=raw.replace(/[()\-\s.]/g,'').replace(',','.');
  const val=parseFloat(raw);
  if(!Number.isFinite(val))return null;
  return neg?-Math.abs(val):val;
}

function analyzeDreText(fullText,fileName){
  const lines=fullText.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  let receitaBruta=0,deducoes=0,receitaLiquida=0,cmv=0,despesasOp=0,despesasFin=0,folha=0,lucroLiquido=0;
  const contasDetectadas=[];

  const rxRecBruta=/(receita\s+operacional\s+bruta|receita\s+bruta|faturamento\s+bruto|vendas\s+de\s+produtos|receita\s+de\s+vendas)/i;
  const rxDeducoes=/(dedu[cç][oõ]es\s+da\s+receita|impostos\s+sobre\s+vendas|tributos\s+sobre\s+faturamento|devolu[cç][oõ]es\s+e\s+abatimentos|simples\s+nacional|icms|pis|cofins|iss)/i;
  const rxRecLiq=/(receita\s+operacional\s+l[ií]quida|receita\s+l[ií]quida)/i;
  const rxCmv=/(custo\s+das\s+mercadorias|custo\s+dos\s+produtos|custo\s+dos\s+servi[cç]os|cmv|cpv|csv|custos\s+operacionais\s+diretos)/i;
  const rxDespOp=/(despesas\s+operacionais|despesas\s+administrativas|despesas\s+gerais|despesas\s+comerciais|despesas\s+fixas)/i;
  const rxFolha=/(sal[aá]rios|ordenados|folha\s+de\s+pagamento|encargos\s+sociais|pr[oó]-labore|inss|fgts)/i;
  const rxDespFin=/(despesas\s+financeiras|tarifas\s+banc[aá]rias|juros\s+passivos)/i;
  const rxLucro=/(lucro\s+l[ií]quido|resultado\s+l[ií]quido|resultado\s+do\s+exerc[ií]cio|preju[ií]zo\s+l[ií]quido)/i;

  for(const line of lines){
    const val=parseBRLValue(line);
    if(val===null||val===0)continue;
    const absVal=Math.abs(val);

    if(!receitaBruta&&rxRecBruta.test(line)){
      receitaBruta=absVal;
      contasDetectadas.push({conta:'Receita Operacional Bruta',linha:line,valor:absVal});
    }else if(!receitaLiquida&&rxRecLiq.test(line)){
      receitaLiquida=absVal;
      contasDetectadas.push({conta:'Receita Operacional Líquida',linha:line,valor:absVal});
    }else if(!deducoes&&rxDeducoes.test(line)&&!/dedu[cç][oõ]es\s+da\s+receita\s+bruta\s*$/i.test(line)){
      deducoes=absVal;
      contasDetectadas.push({conta:'Deduções / Impostos s/ Venda',linha:line,valor:absVal});
    }else if(!cmv&&rxCmv.test(line)){
      cmv=absVal;
      contasDetectadas.push({conta:'Custo Direto (CMV / CPV)',linha:line,valor:absVal});
    }else if(!despesasOp&&rxDespOp.test(line)){
      despesasOp=absVal;
      contasDetectadas.push({conta:'Despesas Operacionais / Fixas',linha:line,valor:absVal});
    }else if(rxFolha.test(line)){
      folha+=absVal;
    }else if(!despesasFin&&rxDespFin.test(line)){
      despesasFin=absVal;
      contasDetectadas.push({conta:'Despesas Financeiras',linha:line,valor:absVal});
    }else if(!lucroLiquido&&rxLucro.test(line)){
      lucroLiquido=val;
      contasDetectadas.push({conta:'Resultado Líquido do Exercício',linha:line,valor:val});
    }
  }

  if(!receitaBruta&&receitaLiquida)receitaBruta=receitaLiquida+deducoes;
  if(!receitaLiquida&&receitaBruta)receitaLiquida=Math.max(0,receitaBruta-deducoes);
  if(!despesasOp&&folha>0)despesasOp=folha;

  const pctTrib=receitaBruta>0?r2((deducoes/receitaBruta)*100):S.cfg.trib;
  const baseRateio=cmv>0?cmv:(receitaLiquida>0?receitaLiquida:1);
  const pctIndiretos=baseRateio>0?r2((despesasOp/baseRateio)*100):S.cfg.ind;
  const pctTaxaFin=receitaBruta>0&&despesasFin>0?r2((despesasFin/receitaBruta)*100):S.cfg.taxa;

  const perMatch=fullText.match(/(\d{2}\/\d{2}\/\d{4}\s*(?:a|até|\-)\s*\d{2}\/\d{2}\/\d{4}|exerc[ií]cio\s*\d{4}|compet[eê]ncia\s*\d{2}\/\d{4})/i);

  return{
    fileName,
    periodo:perMatch?perMatch[0]:new Date().toLocaleDateString('pt-BR'),
    receitaBruta,
    deducoes,
    receitaLiquida,
    cmv,
    despesasOp,
    despesasFin,
    lucroLiquido,
    pctTrib,
    pctIndiretos,
    pctTaxaFin,
    contasDetectadas,
    rawText:fullText
  };
}

async function handleDrePdf(file){
  if(!file)return;
  if(!window.pdfjsLib)throw new Error('Leitor de PDF não carregado. Verifique sua conexão com a internet.');
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let fullText='';

  for(let pageNum=1;pageNum<=pdf.numPages;pageNum++){
    const page=await pdf.getPage(pageNum);
    const content=await page.getTextContent();
    const rowsMap=new Map();
    for(const item of content.items){
      const y=Math.round(item.transform[5]/4)*4;
      if(!rowsMap.has(y))rowsMap.set(y,[]);
      rowsMap.get(y).push({x:item.transform[4],str:item.str});
    }
    const sortedYs=[...rowsMap.keys()].sort((a,b)=>b-a);
    for(const y of sortedYs){
      const lineItems=rowsMap.get(y).sort((a,b)=>a.x-b.x);
      fullText+=lineItems.map(i=>i.str).join(' ')+'\n';
    }
  }

  if(!fullText.trim())throw new Error('O PDF parece ser uma imagem digitalizada sem texto selecionável.');
  drePreview=analyzeDreText(fullText,file.name);
  R();
}

function updateDrePreviewField(field,val){
  if(!drePreview)return;
  drePreview[field]=parseNumberFlex(val)||0;
  if(drePreview.receitaBruta>0){
    drePreview.receitaLiquida=Math.max(0,drePreview.receitaBruta-drePreview.deducoes);
    drePreview.pctTrib=r2((drePreview.deducoes/drePreview.receitaBruta)*100);
    if(drePreview.despesasFin>0)drePreview.pctTaxaFin=r2((drePreview.despesasFin/drePreview.receitaBruta)*100);
  }
  const base=drePreview.cmv>0?drePreview.cmv:(drePreview.receitaLiquida||1);
  drePreview.pctIndiretos=r2((drePreview.despesasOp/base)*100);
  R();
}

function applyDreToPricing(){
  if(!drePreview)return;
  S.dre={...drePreview};
  S.cfg.ind=Math.max(0,Math.min(500,drePreview.pctIndiretos));
  S.cfg.trib=Math.max(0,Math.min(60,drePreview.pctTrib));
  if(drePreview.despesasFin>0)S.cfg.taxa=Math.max(0,Math.min(30,drePreview.pctTaxaFin));
  drePreview=null;
  save();
  alert('DRE aplicada à formação de preço!\nRateio de Custos Indiretos: '+P(S.cfg.ind)+'\nTributos sobre Venda: '+P(S.cfg.trib)+'\nTaxa Financeira: '+P(S.cfg.taxa)+'\n\nTodos os produtos do catálogo já refletem essa estrutura de custos.');
  R();
}

/* ================= CONFIGURAÇÕES & DRE ================= */
V.cfg=()=>{
  if(!isA())return`<div class="card"><div class="msg wa"><b>Acesso restrito</b><br>Somente administradores podem visualizar ou alterar a DRE e os parâmetros de formação de preço.</div></div>`;
  const c=S.cfg,F=(k,l)=>`<label>${l}<input id="c_${k}" type="${k=='pin'?'text':'number'}" step="0.01" value="${c[k]}"></label>`;

  let dreSection=`<div class="card">
    <div class="row" style="justify-content:space-between">
      <div>
        <b>Importar DRE da Contabilidade (PDF) — Composição de Custos por Produto</b>
        <div class="mu" style="margin-top:4px">Faça upload da Demonstração do Resultado do Exercício em PDF para calcular automaticamente o rateio de custos fixos/indiretos e tributos sobre cada produto.</div>
      </div>
      ${S.dre?`<span class="pill ok">DRE Ativa (${esc(S.dre.fileName)})</span>`:`<span class="pill wa">Nenhuma DRE importada</span>`}
    </div>

    <div class="row" style="margin-top:12px">
      <label>Arquivo DRE Contábil (.PDF)
        <input id="fileDrePdf" type="file" accept=".pdf" onchange="if(this.files[0])handleDrePdf(this.files[0]).catch(e=>alert(e.message))">
      </label>
      ${S.dre?`<button class="b g" onclick="drePreview={...S.dre};R()">Revisar valores da DRE atual</button>`:''}
    </div>`;

  if(drePreview){
    dreSection+=`<div class="box-highlight">
      <div class="row" style="justify-content:space-between">
        <div><b>Conferência dos Dados Extraídos da DRE (${esc(drePreview.fileName)})</b><br><small class="mu">Você pode ajustar qualquer valor abaixo caso alguma linha do PDF tenha nomenclatura específica.</small></div>
        <button class="b g" onclick="drePreview=null;R()">Fechar</button>
      </div>
      <div class="f" style="margin-top:12px">
        <label>Receita Bruta (R$)<input type="number" step="0.01" value="${drePreview.receitaBruta}" onchange="updateDrePreviewField('receitaBruta',this.value)"></label>
        <label>Deduções / Tributos s/ Venda (R$)<input type="number" step="0.01" value="${drePreview.deducoes}" onchange="updateDrePreviewField('deducoes',this.value)"></label>
        <label>Custo Direto CMV / CPV (R$)<input type="number" step="0.01" value="${drePreview.cmv}" onchange="updateDrePreviewField('cmv',this.value)"></label>
        <label>Despesas Operacionais / Fixas (R$)<input type="number" step="0.01" value="${drePreview.despesasOp}" onchange="updateDrePreviewField('despesasOp',this.value)"></label>
        <label>Despesas Financeiras (R$)<input type="number" step="0.01" value="${drePreview.despesasFin}" onchange="updateDrePreviewField('despesasFin',this.value)"></label>
      </div>
      <div class="grid" style="margin-top:12px">
        <div class="k"><small>Rateio Custos Indiretos (Desp. Op. ÷ CMV)</small><b class="ok">${P(drePreview.pctIndiretos)}</b></div>
        <div class="k"><small>Carga Tributária Efetiva (Deduções ÷ Rec. Bruta)</small><b>${P(drePreview.pctTrib)}</b></div>
        <div class="k"><small>Custo Financeiro (Desp. Fin. ÷ Rec. Bruta)</small><b>${P(drePreview.pctTaxaFin)}</b></div>
      </div>
      <div class="row">
        <button class="b okb" onclick="applyDreToPricing()">Aplicar Índices da DRE no Custo dos Produtos</button>
      </div>
      ${drePreview.contasDetectadas.length?`<details style="margin-top:10px"><summary class="mu" style="cursor:pointer">Ver contas identificadas automaticamente no PDF (${drePreview.contasDetectadas.length})</summary><ul style="font-size:12px;color:var(--mu)">${drePreview.contasDetectadas.map(x=>`<li><b>${esc(x.conta)}:</b> ${R$(x.valor)} <small>(${esc(x.linha)})</small></li>`).join('')}</ul></details>`:''}
    </div>`;
  }else if(S.dre){
    dreSection+=`<div class="grid" style="margin-top:12px">
      <div class="k"><small>Receita Bruta (DRE)</small><b>${R$(S.dre.receitaBruta)}</b></div>
      <div class="k"><small>Custo Direto CMV/CPV</small><b>${R$(S.dre.cmv)}</b></div>
      <div class="k"><small>Despesas Operacionais</small><b>${R$(S.dre.despesasOp)}</b></div>
      <div class="k"><small>Rateio Indireto Aplicado</small><b class="ok">${P(S.cfg.ind)}</b></div>
    </div>`;
  }
  dreSection+=`</div>`;

  return`${dreSection}
  <div class="card">
    <b>Parâmetros de Formação de Preço e Rateio</b>
    <div class="f" style="margin-top:10px">
      ${F('trib','Tributos s/ venda %')}
      ${F('com','Comissão %')}
      ${F('taxa','Taxa de cartão/financeira %')}
      ${F('mMin','Margem mínima %')}
      ${F('mMed','Margem recomendada %')}
      ${F('mMax','Margem máxima %')}
      ${F('ind','Custos indiretos / Rateio DRE (% s/ custo direto)')}
      ${F('hora','Custo da hora de MO (R$)')}
      ${F('pin','PIN de autorização')}
    </div>
    <div class="row" style="margin-top:12px">
      <button class="b" onclick="saveC()">Salvar parâmetros</button>
      <button class="b g" onclick="if(confirm('Apagar todos os dados deste navegador?')){S=null;localStorage.removeItem(K);location.reload()}">Restaurar configurações padrão</button>
    </div>
    ${err?`<div class="msg er">${err}</div>`:''}
  </div>
  <p class="mu">Fórmula de composição: Custo Total Produto = (Materiais + Mão de Obra) × (1 + Rateio Indiretos DRE %) · Preço de Venda = Custo Total ÷ (1 − Tributos % − Comissão % − Taxa % − Margem %).</p>`;
};

function saveC(){
  const n={};for(const k of Object.keys(S.cfg))n[k]=k=='pin'?$('#c_'+k).value:+$('#c_'+k).value;
  if(n.trib+n.com+n.taxa+Math.max(n.mMin,n.mMed,n.mMax)>=100){err='Percentuais sobre a venda + margem não podem chegar a 100%.';return R()}
  if(!(n.mMin<=n.mMed&&n.mMed<=n.mMax)){err='Use mínima ≤ recomendada ≤ máxima.';return R()}
  S.cfg=n;err='';save();R();
}

async function bootstrap() {
  if (typeof sb === 'undefined') {
    document.body.innerHTML = '<p style="padding:20px;color:red">Erro: SDK do Supabase não encontrado no index.html.</p>';
    return;
  }

  // 1. Verifica se há usuário logado no Supabase
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    return authScreen();
  }

  // 2. Busca o perfil e permissões do usuário logado
  let { data: prof, error: pErr } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();

  // Se o usuário acabou de ser criado no Auth e ainda não tem linha em profiles, cria como vendedor padrão
  if (!prof && !pErr) {
    const novoPerfil = {
      id: session.user.id,
      nome: session.user.email.split('@')[0],
      email: session.user.email,
      role: 'seller',
      bloq: false,
      telas: DEF_SCR.seller
    };
    await sb.from('profiles').insert(novoPerfil);
    prof = novoPerfil;
  }

  if (!prof || prof.bloq) {
    await sb.auth.signOut();
    alert('Sua conta está bloqueada ou sem permissão de acesso.');
    return authScreen();
  }

  me = prof;
  role = prof.role;

  // 3. Se for administrador, carrega a lista de todos os usuários para a aba de acessos
  if (isA()) {
    const { data: allUsers } = await sb.from('profiles').select('*');
    if (allUsers) U = allUsers;
  }

  // 4. Baixa os dados financeiros/produtos da empresa na nuvem
  const { data: cloud } = await sb.from('dashboard_data').select('payload').eq('organization_id', ORG_ID).maybeSingle();
  if (cloud && cloud.payload) {
    S = { ...S, ...cloud.payload };
    S.quotes = S.quotes || [];
    S.qseq = S.qseq || 1;
    S.dre = S.dre || null;
  }

  // 5. Renderiza o sistema
  R();
}

bootstrap();
