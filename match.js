// Identificador do repertório: compara o "desenho" da melodia (intervalos),
// sem depender do tom, do andamento nem de onde o trecho começa.
(function(root){
const SEMI={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const midiOf=p=>12*(p.o+1)+SEMI[p.l]+(p.a||0);

// melodia de uma partitura do editor: voz mais aguda da 1ª pauta, ligaduras somadas
function scoreMelody(S){
  const out=[];let tied=false;
  for(const M of S.measures||[]){
    const evs=(M.st&&M.st[0])||[];
    for(const e of evs){
      if(e.r||!e.p){tied=false;if(out.length)out[out.length-1].restAfter=true;continue}
      const p=Math.max(midiOf(e.p),...(e.x||[]).map(midiOf));
      const last=out[out.length-1];
      if(tied&&last&&last.p===p)last.d+=e.d;else out.push({p,d:e.d});
      tied=!!e.tie;
    }
  }
  return out;
}
// melodia de um áudio (saída do TR.melodyFromFrames): [{t,d,p}]
function audioMelody(mel){
  // tira "piscadas" (notas muito curtas) e notas fora da região da melodia (baixo do acompanhamento)
  let m=mel.filter(n=>n.d>=0.15).map(n=>({p:n.p,d:n.d}));
  const med=a=>{const s=[...a].sort((x,y)=>x-y);return s[s.length>>1]};
  m=m.filter((n,i)=>{const w=m.slice(Math.max(0,i-4),i+5).map(x=>x.p);return Math.abs(n.p-med(w))<10});
  return m;
}

// junta notas repetidas (sílabas ligadas costumam virar uma nota só no áudio)
function collapse(m){const o=[];for(const n of m){const l=o[o.length-1];if(l&&l.p===n.p)l.d+=n.d;else o.push({p:n.p,d:n.d})}return o}
function fold(i){while(i>9)i-=12;while(i<-9)i+=12;return i} // erros de oitava
function intervals(m){const c=collapse(m);const iv=[];for(let k=1;k<c.length;k++)iv.push(fold(c[k].p-c[k-1].p));return iv}

function sub(a,b){if(a===b)return 2;const d=Math.abs(a-b);if(d===1)return 0.6;if(Math.sign(a)===Math.sign(b)&&d<=3)return 0;return -1.2}
// alinhamento local (Smith-Waterman) com "nota perdida" (dois intervalos da partitura = um do áudio)
function align(q,r){
  const n=q.length,m=r.length;if(!n||!m)return 0;
  let P2=new Float32Array(m+1),P=new Float32Array(m+1),C=new Float32Array(m+1);let best=0;const G=1.1;
  for(let i=1;i<=n;i++){
    C[0]=0;
    for(let j=1;j<=m;j++){
      let v=P[j-1]+sub(q[i-1],r[j-1]);
      if(j>=2){const w=P[j-2]+(fold(r[j-2]+r[j-1])===q[i-1]?1.6:-1.4);if(w>v)v=w}   // nota a menos no áudio
      if(i>=2){const w=P2[j-1]+(fold(q[i-2]+q[i-1])===r[j-1]?1.6:-1.4);if(w>v)v=w}   // nota a mais no áudio
      v=Math.max(0,v,P[j]-G,C[j-1]-G);
      C[j]=v;if(v>best)best=v;
    }
    const t=P2;P2=P;P=C;C=t;
  }
  return best;
}

// ---------- comparação por harmonia (cromagrama): serve para coral e acompanhamento,
// onde a melodia principal é difícil de separar. Usa todas as vozes da partitura.
function scoreChroma(S){ // vetor de 12 classes de altura por semicolcheia
  let len=0;const T=[];
  (S.staves||[{}]).forEach((_,si)=>{let pos=0;for(const M of S.measures||[]){let p0=pos;for(const e of (M.st&&M.st[si])||[]){
      if(!e.r&&e.p){const ps=[e.p,...(e.x||[])].map(midiOf);for(let u=0;u<e.d;u++){const k=p0+u;(T[k]=T[k]||new Float32Array(12));for(const q of ps)T[k][q%12]+=1}}
      p0+=e.d}
    const cap=M.pickup?(M.pickupLen||p0-pos):Math.max(p0-pos,(M.st&&M.st[0]||[]).reduce((a,e)=>a+e.d,0));pos+=cap;len=Math.max(len,pos)}});
  for(let k=0;k<len;k++)if(!T[k])T[k]=new Float32Array(12);
  return T;
}
function audioChroma(fr,fps,hop){ // fr: ativações do Basic Pitch (88 notas por quadro)
  const step=hop*fps,out=[];
  for(let a=0;a+step<=fr.length;a+=step){const v=new Float32Array(12);const i0=Math.floor(a),i1=Math.floor(a+step);
    for(let t=i0;t<i1;t++){const F=fr[t];for(let i=0;i<F.length;i++){const x=F[i];if(x>0.15)v[(i+21)%12]+=x*x}}
    out.push(v)}
  return out;
}
function norm(v){let s=0;for(const x of v)s+=x*x;s=Math.sqrt(s);if(s<1e-6)return null;return v.map(x=>x/s)}
function resample(T,f){ // f = quadros de áudio por semicolcheia
  const n=Math.max(2,Math.round(T.length*f));const out=[];for(let j=0;j<n;j++){const a=j/f,b=(j+1)/f;const v=new Float32Array(12);
    for(let k=Math.floor(a);k<Math.min(T.length,Math.ceil(b));k++){const w=Math.min(b,k+1)-Math.max(a,k);for(let c=0;c<12;c++)v[c]+=T[k][c]*w}out.push(norm(v))}
  return out;
}
// alinhamento por DTW sem "parar no tempo" (inclinação entre 1/2 e 2); custo médio por quadro do áudio
function dtwCost(Q,R,shift){
  const n=Q.length,m=R.length;const INF=1e9;
  const c=(i,j)=>{const q=Q[i],r=R[j];if(!q)return 0.35;if(!r)return 0.8;let s=0;for(let k=0;k<12;k++)s+=q[k]*r[(k+shift)%12];return 1-s};
  let P2=new Float64Array(m).fill(INF),P=new Float64Array(m),C=new Float64Array(m);
  for(let j=0;j<m;j++)P[j]=c(0,j);
  for(let i=1;i<n;i++){
    for(let j=0;j<m;j++){const x=c(i,j);let v=INF;
      if(j>=1)v=Math.min(v,P[j-1]+x);
      if(j>=2)v=Math.min(v,P[j-2]+x);
      if(i>=2&&j>=1)v=Math.min(v,P2[j-1]+c(i-1,j)+x);
      C[j]=v}
    const t=P2;P2=P;P=C;C=t}
  let best=INF;for(let j=0;j<m;j++)best=Math.min(best,P[j]);
  return best/n;
}
const HOP=0.15;
function chromaSim(Qc,S,cache){
  const T=cache||scoreChroma(S);if(!T.length)return 0;
  // tons mais prováveis pelo perfil geral (para não testar os 12)
  const gq=new Float32Array(12),gr=new Float32Array(12);for(const v of Qc)if(v)for(let k=0;k<12;k++)gq[k]+=v[k];for(const v of T)for(let k=0;k<12;k++)gr[k]+=v[k];
  const nq=norm(gq),nr=norm(gr);if(!nq||!nr)return 0;
  const shifts=[...Array(12).keys()].map(sh=>{let s=0;for(let k=0;k<12;k++)s+=nq[k]*nr[(k+sh)%12];return [sh,s]}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]);
  let best=1e9;
  for(const d16 of [0.08,0.11,0.15,0.21,0.3,0.42]){const R=resample(T,d16/HOP);
    for(const sh of shifts)best=Math.min(best,dtwCost(Qc,R,sh))}
  return 1-best;
}
// compara um trecho com o repertório; devolve [{i,score,pct}] do melhor para o pior
function rank(queryMel,lib,Qc){
  const q=intervals(queryMel);
  const voiced=Qc?Qc.filter(Boolean).length:0;
  if(q.length<5&&voiced<20)return {err:'poucas notas',n:q.length,res:[]};
  const res=lib.map((it,i)=>{
    let mel=0;if(q.length>=5){const r=intervals(it.mel||scoreMelody(it.S));const s=align(q,r);mel=Math.max(0,Math.min(1,s/(2*Math.min(q.length,r.length))))}
    let ch=0;if(Qc&&it.S){const c=chromaSim(Qc,it.S,it._T||(it._T=scoreChroma(it.S)));ch=Math.max(0,Math.min(1,(c-0.6)/0.35))}
    const sc=Qc&&it.S?0.5*mel+0.5*ch:mel;
    return {i,score:sc,mel,ch,pct:Math.round(100*sc)}});
  res.sort((a,b)=>b.score-a.score);
  return {n:q.length,res};
}
const API={scoreMelody,audioMelody,intervals,align,rank,scoreChroma,audioChroma,chromaSim,norm,HOP};
if(typeof module!=='undefined')module.exports=API;else root.MATCH=API;
})(this);
