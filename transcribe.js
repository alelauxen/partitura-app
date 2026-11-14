// Transcrição: notas do Basic Pitch -> partitura (melodia + 2ª voz opcional)
(function(root){
const LET='CDEFGAB', SEMI=[0,2,4,5,7,9,11];
const MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
// tonalidades maiores por armadura (fifths) -> tônica em pc
const MAJ_TONIC={'-6':6,'-5':1,'-4':8,'-3':3,'-2':10,'-1':5,'0':0,'1':7,'2':2,'3':9,'4':4,'5':11,'6':6};
const KEYNAME={'-6':'Sol♭','-5':'Ré♭','-4':'Lá♭','-3':'Mi♭','-2':'Si♭','-1':'Fá','0':'Dó','1':'Sol','2':'Ré','3':'Lá','4':'Mi','5':'Si','6':'Fá♯'};
const MINNAME={'-6':'Mi♭','-5':'Si♭','-4':'Fá','-3':'Dó','-2':'Sol','-1':'Ré','0':'Lá','1':'Mi','2':'Si','3':'Fá♯','4':'Dó♯','5':'Sol♯','6':'Ré♯'};
const METERS={'6/8':{B:6,grp:3,beats:6,val:8},'3/4':{B:6,grp:2,beats:3,val:4},'4/4':{B:8,grp:2,beats:4,val:4},'2/4':{B:4,grp:2,beats:2,val:4},'3/8':{B:3,grp:3,beats:3,val:8},'12/8':{B:12,grp:3,beats:12,val:8}};

function corr(a,b){const n=a.length;let ma=0,mb=0;for(let i=0;i<n;i++){ma+=a[i];mb+=b[i]}ma/=n;mb/=n;let s=0,sa=0,sb=0;for(let i=0;i<n;i++){s+=(a[i]-ma)*(b[i]-mb);sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2}return s/Math.sqrt(sa*sb+1e-12)}

// 1) limpeza + melodia (voz mais aguda), suprimindo harmônicos de oitava
function extractMelody(notes,opts={}){
  const minDur=opts.minDur||0.09;
  if(opts.mel){const mel=cleanVoice(opts.mel.filter(n=>n.d>=minDur).map(n=>({...n})));const rest=notes.filter(n=>!mel.some(m=>Math.abs(m.t-n.t)<0.05&&m.p===n.p));return {mel,rest}}
  let ns=notes.filter(n=>n.d>=minDur&&n.p<=96&&n.p>=36).map(n=>({...n}));
  // remove harmônicos: nota que tem outra 12/19/24 semitons abaixo começando junto e mais forte
  ns=ns.filter(n=>!ns.some(m=>m!==n&&[12,19,24].includes(n.p-m.p)&&Math.abs(m.t-n.t)<0.09&&
      Math.min(m.t+m.d,n.t+n.d)-Math.max(m.t,n.t)>0.5*n.d&&n.a<0.9*m.a));
  if(!ns.length)return {mel:[],rest:[]};
  const end=Math.max(...ns.map(n=>n.t+n.d)),dt=0.01,T=Math.ceil(end/dt);
  const owner=new Int32Array(T).fill(-1);
  ns.sort((a,b)=>a.t-b.t);
  // amplitude máxima local para ignorar notas fracas
  for(let k=0;k<T;k++){
    const t=k*dt;let best=-1,amax=0;
    for(let i=0;i<ns.length;i++){const n=ns[i];if(n.t>t)break;if(n.t+n.d>t&&n.a>amax)amax=n.a}
    for(let i=0;i<ns.length;i++){const n=ns[i];if(n.t>t)break;if(n.t+n.d>t&&n.a>=0.6*amax&&(best<0||n.p>ns[best].p))best=i}
    owner[k]=best;
  }
  const cnt=new Map();for(let k=0;k<T;k++)if(owner[k]>=0)cnt.set(owner[k],(cnt.get(owner[k])||0)+1);
  let mel=ns.filter((n,i)=>(cnt.get(i)||0)*dt>=0.5*n.d);
  mel.sort((a,b)=>a.t-b.t);
  // remove sobreposições: corta na próxima entrada; une fragmentos iguais muito curtos
  const out=[];
  for(const n of mel){
    const prev=out[out.length-1];
    if(prev&&n.t<prev.t+0.06){ if(n.p>prev.p)out[out.length-1]=n; continue }
    if(prev&&prev.t+prev.d>n.t)prev.d=n.t-prev.t;
    out.push({...n});
  }
  cleanVoice(out);
  const rest=ns.filter(n=>!out.some(m=>m.t===n.t&&m.p===n.p));
  return {mel:out,rest};
}

// melodia principal direto da "ativação" de notas do modelo (caminho de Viterbi):
// segue a voz mais forte e contínua, ignorando acompanhamento e harmônicos
function frameTime(f){const N=Math.floor(22050/256)*2,ns=22050*2-256;const off=(256/22050)*(N-ns/256)+0.0018;return f*256/22050-off*Math.floor(f/N)}
function melodyFromFrames(fr,on,opts={}){
  const T=fr.length;if(!T)return [];
  const K0=15,K1=75,NK=K1-K0+1,SIL=NK; // notas 36..96 + silêncio
  const silG=opts.silence??0.3,jump=opts.jump??0.35,jumpK=opts.jumpK??0.6,silC=opts.silC??0.25;
  let prev=new Float64Array(NK+1),cur=new Float64Array(NK+1);
  const back=new Int16Array(T*(NK+1));
  for(let t=0;t<T;t++){
    const F=fr[t];
    // melhor estado anterior (para transições)
    let bi=0,bv=-1e18;for(let j=0;j<=NK;j++)if(prev[j]>bv){bv=prev[j];bi=j}
    for(let k=0;k<=NK;k++){
      const g=k===SIL?silG:F[K0+k];
      let best=prev[k],arg=k; // ficar
      if(k===SIL){ if(bv-silC>best){best=bv-silC;arg=bi} }
      else{
        if(prev[SIL]-silC>best){best=prev[SIL]-silC;arg=SIL}
        for(let j=Math.max(0,k-12);j<=Math.min(NK-1,k+12);j++){if(j===k)continue;const v=prev[j]-jump-jumpK*Math.abs(j-k)/12;if(v>best){best=v;arg=j}}
        // salto grande (> oitava)
        if(bi!==SIL&&Math.abs(bi-k)>12){const v=bv-jump-jumpK*1.5;if(v>best){best=v;arg=bi}}
      }
      cur[k]=best+g;back[t*(NK+1)+k]=arg;
    }
    [prev,cur]=[cur,prev];
  }
  let k=0,bv=-1e18;for(let j=0;j<=NK;j++)if(prev[j]>bv){bv=prev[j];k=j}
  const path=new Int16Array(T);for(let t=T-1;t>=0;t--){path[t]=k;k=back[t*(NK+1)+k]}
  // segmentos + divisão de notas repetidas pelas entradas (onsets)
  const out=[];let t=0;const onT=opts.onset??0.85,minGap=Math.round((opts.minGap??0.2)*86);
  while(t<T){
    const s=path[t];let e=t;while(e+1<T&&path[e+1]===s)e++;
    if(s!==SIL){
      const p=K0+s;const cuts=[t];
      const dip=opts.dip??1,W=Math.round(0.25*86);
      const sm=i=>{let s=0,c=0;for(let j=Math.max(t,i-2);j<=Math.min(e,i+2);j++){s+=fr[j][p];c++}return s/c};
      for(let i=t+minGap;i<=e-minGap;i++){
        if(i-cuts[cuts.length-1]<minGap)continue;
        const o=on[i][p];
        if(o>onT&&o>=on[i-1][p]&&o>=on[i+1][p]){cuts.push(i);continue}
        if(dip<1){const v=sm(i);if(v<=sm(i-1)&&v<=sm(i+1)){
          let ml=0,mr=0;for(let j=Math.max(t,i-W);j<i;j++)ml=Math.max(ml,sm(j));for(let j=i+1;j<=Math.min(e,i+W);j++)mr=Math.max(mr,sm(j));
          if(v<dip*Math.min(ml,mr))cuts.push(i);}}
      }
      // usa também as entradas de notas detectadas na mesma altura (notas repetidas)
      if(opts.notes){const t0=frameTime(t),t1=frameTime(e);
        opts.notes.forEach(n=>{if(n.p-21===p&&n.t>t0+0.12&&n.t<t1-0.12){const fi=Math.round(n.t*86.13);if(cuts.every(c=>Math.abs(c-fi)>=minGap))cuts.push(fi)}});
        cuts.sort((x,y)=>x-y);}
      cuts.push(e+1);
      for(let c=0;c+1<cuts.length;c++){
        const a=cuts[c],b=cuts[c+1];let amp=0;for(let i=a;i<b;i++)amp+=fr[i][p];
        const t0=frameTime(a),t1=frameTime(b);
        if(t1-t0>=0.06)out.push({t:t0,d:t1-t0,p:p+21,a:amp/(b-a)});
      }
    }
    t=e+1;
  }
  return out;
}

// limpeza típica de voz: oitava errada isolada e fragmentos de vibrato
function cleanVoice(out){
  // a) nota isolada a ~1 oitava dos vizinhos (que estão próximos entre si) -> traz para a oitava deles
  for(let i=0;i<out.length;i++){
    const a=out[i-1],b=out[i],c=out[i+1];
    const ref=a&&c?(Math.abs(a.p-c.p)<=5?(a.p+c.p)/2:null):(a||c)?(a||c).p:null;
    if(ref==null)continue;
    if(Math.abs(b.p-ref)>=9){const opts=[b.p-24,b.p-12,b.p+12,b.p+24];const best=opts.reduce((x,y)=>Math.abs(y-ref)<Math.abs(x-ref)?y:x);if(Math.abs(best-ref)<Math.abs(b.p-ref)-6)b.p=best}
  }
  // a2) notas muito abaixo da tessitura da melodia (acompanhamento) e "piscadas" curtas isoladas
  if(out.length>4){
    const ps=out.map(n=>n.p).sort((x,y)=>x-y);const med=ps[Math.floor(ps.length/2)];
    for(let i=out.length-1;i>=0;i--){
      const n=out[i],a=out[i-1],c=out[i+1];
      const low=(n.p<med-10&&n.d<0.8)||(n.p<med-6&&n.d<0.8&&a&&c&&a.p-n.p>4&&c.p-n.p>4);
      const blip=n.d<0.22&&a&&c&&Math.abs(n.p-a.p)>4&&Math.abs(n.p-c.p)>4;
      if(low||blip){if(a&&a.t+a.d>=n.t-0.05&&!low)a.d=n.t+n.d-a.t;out.splice(i,1)}
    }
  }
  // b) fragmentos curtos colados (vibrato/deslize): junta na nota vizinha
  for(let pass=0;pass<2;pass++){
    for(let i=out.length-1;i>0;i--){
      const p=out[i-1],n=out[i];const gap=n.t-(p.t+p.d);
      const short=Math.min(n.d,p.d)<0.16;
      if(gap<0.04&&(n.p===p.p&&short||Math.abs(n.p-p.p)<=1&&short)){
        // mantém a altura da mais longa
        const keep=n.d>p.d?n.p:p.p;p.d=n.t+n.d-p.t;p.p=keep;p.a=Math.max(p.a,n.a);out.splice(i,1);
      }
    }
  }
  return out;
}

// 2) unidade de tempo (colcheia) por ajuste aos intervalos entre entradas
function estimateUnit(mel){
  const iois=[];for(let i=0;i+1<mel.length;i++){const d=mel[i+1].t-mel[i].t;if(d>0.08&&d<3)iois.push(d)}
  if(iois.length<3)return 0.4;
  let best=null;
  for(let u=0.14;u<=0.9;u+=0.002){
    let c=0;for(const d of iois){const r=d/u,k=Math.max(1,Math.round(r));c+=Math.abs(r-k)/Math.sqrt(k)}
    c=c/iois.length+0.035*(iois.reduce((a,d)=>a+Math.max(1,Math.round(d/u)),0)/iois.length);
    if(!best||c<best.c)best={u,c};
  }
  return best.u;
}

// 3) quantização adaptativa (acompanha variações de andamento)
function quantize(mel,u0){
  let u=u0,q=0;const ev=[];
  for(let i=0;i<mel.length;i++){
    const n=mel[i];
    if(i>0){const d=n.t-mel[i-1].t;const k=Math.max(1,Math.round(d/u));q+=k;const est=d/k;if(Math.abs(est-u)/u<0.25)u=0.85*u+0.15*est}
    ev.push({q,n,u});
  }
  // durações: até a próxima entrada, mas com pausa se a nota acabou bem antes
  for(let i=0;i<ev.length;i++){
    const e=ev[i],next=ev[i+1];
    const lenSec=e.n.d;const room=next?next.q-e.q:Math.max(1,Math.round(lenSec/e.u));
    let L=Math.max(1,Math.round(lenSec/e.u));
    if(room-L<=1||L>room)L=room; // pequenas folgas viram legato
    e.len=L;
  }
  return ev;
}

// 4) tonalidade (Krumhansl) a partir das durações da melodia
function estimateKey(mel){
  const h=new Array(12).fill(0);mel.forEach(n=>h[n.p%12]+=n.d);
  let best=null;
  for(const f of Object.keys(MAJ_TONIC)){
    if(Math.abs(+f)>5&&+f!==-6)continue;
    const t=MAJ_TONIC[f];
    const cm=corr(h,MAJ.map((_,i)=>MAJ[(i-t+12)%12]));
    const cr=corr(h,MIN.map((_,i)=>MIN[(i-(t+9)%12+12)%12]));
    // peso das notas fora da escala dessa armadura
    const sc=[0,2,4,5,7,9,11].map(x=>(x+t)%12);let outw=0,tot=0;for(let i=0;i<12;i++){tot+=h[i];if(!sc.includes(i))outw+=h[i]}
    const c=Math.max(cm,cr)-8*outw/(tot||1);
    if(!best||c>best.c)best={f:+f,c,minor:cr>cm};
  }
  return best;
}
function spell(p,f){
  const pc=((p%12)+12)%12,o=Math.floor(p/12)-1;
  // escala da tonalidade
  const t=MAJ_TONIC[f];const scale=[];
  // letras da tonalidade maior a partir da armadura
  const sharps='FCGDAEB',flats='BEADGCF';const alt={};LET.split('').forEach(l=>alt[l]=0);
  if(f>0)for(let i=0;i<f;i++)alt[sharps[i]]=1; if(f<0)for(let i=0;i<-f;i++)alt[flats[i]]=-1;
  for(const l of LET){const s=((SEMI[LET.indexOf(l)]+alt[l])%12+12)%12;if(s===pc){let oo=o;if(l==='C'&&alt[l]===-1)oo=o+1;if(l==='B'&&alt[l]===1)oo=o-1;return {l,a:alt[l],o:oo}}}
  // cromática: sustenido em tom com #, bemol em tom com b
  for(const l of LET){const base=SEMI[LET.indexOf(l)];
    if(f>=0&&(base+1)%12===pc)return {l,a:1,o:l==='B'?o-1:o};
    if(f<0&&(base-1+12)%12===pc)return {l,a:-1,o:l==='C'?o+1:o};}
  for(const l of LET){if(SEMI[LET.indexOf(l)]===pc)return {l,a:0,o}}
}

// 5) compasso + anacruse
function scoreMeter(ev,M,off){
  let s=0,tot=0;
  for(const e of ev){const pos=(e.q+off)%M.B;const w=Math.min(e.len,M.B);tot+=w;
    if(pos===0)s+=w*1.0;else if(pos%M.grp===0)s+=w*0.35;}
  return s/(tot||1);
}
function estimateMeter(ev){
  // periodicidade dos acentos: autocorrelação + força de fase do tempo forte
  const Q=ev[ev.length-1].q+ev[ev.length-1].len;const w=new Float64Array(Q+24);
  ev.forEach(e=>w[e.q]+=Math.log(1+e.len));
  const ac=L=>{let s=0,n=0;for(let i=0;i+L<Q;i++){s+=w[i]*w[i+L];n++}return n?s/n:0};
  const ph=B=>{let best=0,bo=0;for(let o=0;o<B;o++){let s=0,t=0;for(let i=0;i<Q;i++){t+=w[i];if((i+o)%B===0)s+=w[i]}const v=t?s/t*B:0;if(v>best){best=v;bo=o}}return {v:best,o:bo}};
  const p6=ph(6),p8=ph(8);
  const s6=(ac(6)+1e-6)/(ac(8)+1e-6)*(p6.v+1e-6)/(p8.v+1e-6);
  let m;
  if(s6>1){
    const c3=ev.filter(e=>e.len===3).length,c2=ev.filter(e=>e.len===2).length;
    m=(ac(3)>ac(2)*1.1||c3>c2)?'6/8':'3/4';
  } else m='4/4';
  return {m,off:bestOffset(ev,m)};
}
function bestOffset(ev,m){const M=METERS[m];let b=0,bs=-1;for(let off=0;off<M.B;off++){const s=scoreMeter(ev,M,off);if(s>bs){bs=s;b=off}}return b}

// 6) monta compassos com pausas e ligaduras
function pieces(L,maxLen,grp){
  const allowed=(grp===3?[12,6,3,2,1]:[8,6,4,3,2,1]).filter(x=>x<=maxLen);
  const out=[];let r=L;while(r>0){const x=allowed.find(a=>a<=r);out.push(x);r-=x}return out;
}
function buildMeasures(ev,f,m,off,voice2){
  const M=METERS[m];const items=[];
  const first=ev.length?ev[0].q:0;
  let cursor=first;
  for(const e of ev){
    if(e.q>cursor) items.push({r:true,q:cursor,len:e.q-cursor});
    items.push({r:false,q:e.q,len:e.len,p:spell(e.n.p,f),midi:e.n.p,x:e.x?e.x.map(p=>spell(p,f)):[],t:''});
    cursor=e.q+e.len;
  }
  // posição absoluta no compasso: pos=q-first+off
  const measures=[];let cur=[],curStart=null;
  const pick=(M.B-off)%M.B; // tamanho da anacruse
  function barOf(q){const a=q-first+off;return Math.floor(a/M.B)}
  function push(item,start,len,tie){
    const b=barOf(start);
    while(measures.length<=b)measures.push([]);
    measures[b].push({...item,len,tie,start});
  }
  for(const it of items){
    let s=it.q,L=it.len;
    while(L>0){
      const a=s-first+off;const rem=M.B-(a%M.B);const take=Math.min(L,rem);
      const ps=pieces(take,M.B,M.grp);
      ps.forEach((x,i)=>{const last=(L-take===0)&&i===ps.length-1;push(it,s,x,!it.r&&!last);s+=x});
      L-=take;
    }
  }
  // primeiro compasso: se off>0, é anacruse (começa no meio)
  const res=measures.map((ms,i)=>ms.map(n=>({r:n.r,p:n.p?{...n.p}:null,x:(n.x||[]).map(z=>({...z})),d:n.len,tie:n.tie,t:''})));
  // completa o último compasso com pausa
  const last=res[res.length-1];if(last){const s=last.reduce((a,n)=>a+n.d,0);const need=(res.length===1&&off?M.B-off:M.B)-s; if(res.length>1&&need>0)pieces(need,M.B,M.grp).forEach(x=>last.push({r:true,p:null,x:[],d:x,tie:false,t:''}))}
  // remove compasso inicial vazio de anacruse
  return {measures:res.filter(ms=>ms.length),pickup:off>0};
}

// 2ª voz: nota mais aguda abaixo da melodia que começa junto
function addVoice2(ev,rest){
  for(const e of ev){
    const c=rest.filter(m=>Math.abs(m.t-e.n.t)<0.1&&m.p<e.n.p-1&&m.p>=e.n.p-12&&m.d>0.5*Math.min(e.n.d,m.d+0.01));
    if(c.length){c.sort((a,b)=>b.p-a.p);e.x=[c[0].p]}
  }
}


// cifra: acorde mais provável em cada compasso (usa todas as notas, não só a melodia)
const SHARPN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],FLATN=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const TPL=[['',[0,4,7]],['m',[0,3,7]],['7',[0,4,7,10]]];
function estimateChords(ev,notes,f,m,off){
  const M=METERS[m];const first=ev.length?ev[0].q:0;
  const bars=new Map();
  ev.forEach(e=>{const b=Math.floor((e.q-first+off)/M.B);if(!bars.has(b))bars.set(b,[]);bars.get(b).push(e)});
  const tonic=MAJ_TONIC[f];const diat=[0,2,4,5,7,9,11].map(x=>(x+tonic)%12);
  const names=f<0?FLATN:SHARPN;const out={};
  const keys=[...bars.keys()].sort((a,b)=>a-b);
  keys.forEach((b,i)=>{
    const es=bars.get(b);const t0=es[0].n.t-0.05;
    const nb=keys[i+1]!=null?bars.get(keys[i+1])[0].n.t:es[es.length-1].n.t+es[es.length-1].n.d;
    const h=new Array(12).fill(0);let low=null;
    notes.forEach(n=>{const ov=Math.min(n.t+n.d,nb)-Math.max(n.t,t0);if(ov>0.05&&n.p<=96){h[n.p%12]+=ov*n.a;if(!low||n.p<low.p&&ov>0.2)low=n}});
    if(low)h[low.p%12]*=1.5;
    let best=null;
    for(let r=0;r<12;r++)for(const [q,iv] of TPL){
      const tones=iv.map(x=>(x+r)%12);let s=0;for(let pc=0;pc<12;pc++)s+=tones.includes(pc)?h[pc]:-0.6*h[pc];
      if(q==='7')s-=0.08*Math.max(...h);
      if(tones.every(t=>diat.includes(t))||(q==='7'&&r===(tonic+7)%12))s*=1.12;
      if(!best||s>best.s)best={s,n:names[r]+q};
    }
    out[b]=best?best.n:'';
  });
  return out;
}

function transcribe(notes,opts={}){
  const {mel,rest}=extractMelody(notes,opts);
  if(mel.length<2)return null;
  const u=opts.unit||estimateUnit(mel);
  const ev=quantize(mel,u);
  if(opts.voice2)addVoice2(ev,rest);
  const key=opts.fifths!=null?{f:opts.fifths}:estimateKey(mel);
  let meter=opts.meter&&opts.meter!=='auto'?opts.meter:null,off;
  if(!meter){const b=estimateMeter(ev);meter=b.m;off=b.off}else off=bestOffset(ev,meter);
  const {measures,pickup}=buildMeasures(ev,key.f,meter,off);
  const ch=estimateChords(ev,notes,key.f,meter,off);const k0=Math.min(...Object.keys(ch).map(Number));
  const chords=measures.map((_,i)=>(i===0&&pickup)?'':(ch[i+k0]||''));
  const bpm=60/(u*(METERS[meter].val===8?3:2));
  return {measures,chords,pickup,fifths:key.f,keyName:key.minor?MINNAME[key.f]+' menor':KEYNAME[key.f]+' maior',meter,unit:u,bpm,melody:mel,events:ev};
}
const API={melodyFromFrames,transcribe,extractMelody,estimateUnit,quantize,estimateKey,spell,METERS,KEYNAME};
if(typeof module!=='undefined')module.exports=API; else root.TR=API;
})(this);
