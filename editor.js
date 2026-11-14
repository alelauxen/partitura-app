// Editor de partituras — modelo, desenho (VexFlow), edição, som e exportação
(function(){
const $=id=>document.getElementById(id);
const VF=Vex.Flow;
const LETTERS='CDEFGAB',SEMI={C:0,D:2,E:4,F:5,G:7,A:9,B:11},PT={C:'Dó',D:'Ré',E:'Mi',F:'Fá',G:'Sol',A:'Lá',B:'Si'};
const VFKEY={'-7':'Cb','-6':'Gb','-5':'Db','-4':'Ab','-3':'Eb','-2':'Bb','-1':'F','0':'C','1':'G','2':'D','3':'A','4':'E','5':'B','6':'F#','7':'C#'};
const MAJN={'-7':'Dó♭','-6':'Sol♭','-5':'Ré♭','-4':'Lá♭','-3':'Mi♭','-2':'Si♭','-1':'Fá','0':'Dó','1':'Sol','2':'Ré','3':'Lá','4':'Mi','5':'Si','6':'Fá♯','7':'Dó♯'};
const MINN={'-7':'Lá♭','-6':'Mi♭','-5':'Si♭','-4':'Fá','-3':'Dó','-2':'Sol','-1':'Ré','0':'Lá','1':'Mi','2':'Si','3':'Fá♯','4':'Dó♯','5':'Sol♯','6':'Ré♯','7':'Lá♯'};
const DUR={1:['16',0],2:['8',0],3:['8',1],4:['q',0],6:['q',1],8:['h',0],12:['h',1],16:['w',0],24:['w',1]};
const DUR_NAME={1:'semicolcheia',2:'colcheia',3:'colcheia pontuada',4:'semínima',6:'semínima pontuada',8:'mínima',12:'mínima pontuada',16:'semibreve',24:'semibreve pontuada'};
const PIECES=[24,16,12,8,6,4,3,2,1];
function keyAlt(f){const a={C:0,D:0,E:0,F:0,G:0,A:0,B:0};const s='FCGDAEB',b='BEADGCF';if(f>0)for(let i=0;i<f;i++)a[s[i]]=1;if(f<0)for(let i=0;i<-f;i++)a[b[i]]=-1;return a}
const name=p=>PT[p.l]+(p.a<0?'♭':p.a>0?'♯':'')+p.o;
const midi=p=>12*(p.o+1)+SEMI[p.l]+p.a;
const clone=o=>JSON.parse(JSON.stringify(o));
function cap(meter){const [n,d]=meter.split('/').map(Number);return n*16/d}
function beatUnit(meter){const [n,d]=meter.split('/').map(Number);return (d===8&&n%3===0)?6:16/d}
function pieces(L){const out=[];let r=L;while(r>0){const x=PIECES.find(a=>a<=r);out.push(x);r-=x}return out}
function restsFor(L,auto){return pieces(L).map(d=>({r:true,p:null,x:[],d,tie:false,auto:!!auto}))}
function emptyStaff(L){return restsFor(L,true)}

// ---------- tonalidade por nome
const MAJ={C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7};
const MAJ_EQ={'D#':-3,'G#':-4,'A#':-2,'E#':-1,'B#':0,Fb:4};
const MIN={A:0,E:1,B:2,'F#':3,'C#':4,'G#':5,'D#':6,'A#':7,D:-1,G:-2,C:-3,F:-4,Bb:-5,Eb:-6,Ab:-7};
const MIN_EQ={Db:4,Gb:3,Cb:2,'E#':-4,'B#':-3,Fb:1};
function parseKey(str){
  let s=(str||'').trim();if(!s)return null;
  const low=s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  let minor=/menor|minor/.test(low);
  const pt={do:'C',re:'D',mi:'E',fa:'F',sol:'G',la:'A',si:'B'};
  let letter=null,rest='';
  const m1=low.match(/^(do|re|mi|fa|sol|la|si)\s*(.*)$/);
  if(m1){letter=pt[m1[1]];rest=m1[2]}else{const m2=s.match(/^([A-Ga-g])\s*(.*)$/);if(!m2)return null;letter=m2[1].toUpperCase();rest=m2[2]}
  let acc='';let r=rest.toLowerCase().trim();
  if(/^(#|♯)/.test(r)){acc='#';r=r.slice(1)}else if(/^sustenido/.test(r)){acc='#';r=r.slice(9)}
  else if(/^♭/.test(r)){acc='b';r=r.slice(1)}else if(/^bemol/.test(r)){acc='b';r=r.slice(5)}else if(/^b(\s|$|m)/.test(r)){acc='b';r=r.slice(1)}
  r=r.trim();if(/^m($|\s|enor|in)/.test(r))minor=true;if(/^maior|^major/.test(r))minor=false;
  const k=letter+acc;
  let f,eq=false;
  if(minor){if(k in MIN)f=MIN[k];else if(k in MIN_EQ){f=MIN_EQ[k];eq=true}}
  else{if(k in MAJ)f=MAJ[k];else if(k in MAJ_EQ){f=MAJ_EQ[k];eq=true}}
  if(f==null)return null;
  return {fifths:f,minor,eq,label:(minor?MINN[f]+' menor':MAJN[f]+' maior')};
}
function keyLabel(f,minor){return minor?MINN[f]+' menor':MAJN[f]+' maior'}

// ---------- estado
let S=null;           // partitura atual
let ORIG=null;        // versão "aplicada" (referência para cores e Original)
let hist=[],fut=[];
let sel=null;         // {s,m,i,h}
let pencil=false,palette=4,dotOn=false;
let hits=[],drawn={},layout=null;
const listeners={};
function snap(){hist.push(JSON.stringify(S));if(hist.length>150)hist.shift();fut=[];upd()}
function save(){try{localStorage.setItem('editor-score',JSON.stringify({S,ORIG}))}catch(e){}}

function blank(opts){
  const st=opts.staves==='piano'?[{clef:'treble'},{clef:'bass'}]:opts.staves==='bass'?[{clef:'bass'}]:[{clef:'treble'}];
  const C=cap(opts.meter);
  return {title:opts.title||'Sem título',fifths:opts.fifths,minor:!!opts.minor,meter:opts.meter,bpm:opts.bpm||80,staves:st,
    measures:Array.from({length:opts.measures||8},()=>({chord:'',st:st.map(()=>emptyStaff(C))}))};
}
function measureCap(m){const M=S.measures[m];if(M.pickup)return M.pickupLen||cap(S.meter);return cap(S.meter)}
function ev(s,m,i){return S.measures[m]&&S.measures[m].st[s]&&S.measures[m].st[s][i]}
function cur(){return sel?ev(sel.s,sel.m,sel.i):null}
function heads(n){return n&&!n.r?[n.p,...n.x]:[]}
function order(s){const o=[];S.measures.forEach((M,m)=>M.st[s].forEach((n,i)=>o.push([m,i])));return o}
function nextEv(s,m,i){if(i+1<S.measures[m].st[s].length)return [m,i+1];for(let k=m+1;k<S.measures.length;k++)if(S.measures[k].st[s].length)return [k,0];return null}
function prevEv(s,m,i){if(i>0)return [m,i-1];for(let k=m-1;k>=0;k--){const L=S.measures[k].st[s].length;if(L)return [k,L-1]}return null}
function samePitch(a,b){return a&&b&&!a.r&&!b.r&&a.p.l===b.p.l&&a.p.a===b.p.a&&a.p.o===b.p.o}
function tiedSame(a,b){return a&&a.tie&&samePitch(a,b)}
const sameP=(a,b)=>a&&b&&a.l===b.l&&a.a===b.a&&a.o===b.o;
function sortedHeads(n){return heads(n).slice().sort((a,b)=>midi(a)-midi(b))}
// a nota de altura p, no evento a, continua soando no evento b? (ligadura nota a nota)
function headTie(p,a,b){return !!(a&&b&&a.tie&&!a.r&&!b.r&&heads(a).some(q=>sameP(q,p))&&heads(b).some(q=>sameP(q,p)))}
function anyCommon(a,b){return !!(a&&b&&!a.r&&!b.r&&heads(a).some(p=>heads(b).some(q=>sameP(p,q))))}
function isEdited(s,m,i){
  const n=ev(s,m,i);if(!ORIG)return false;const OM=ORIG.measures[m];if(!OM||!OM.st[s])return true;
  const o=OM.st[s][i];if(!o)return true;return JSON.stringify({r:n.r,p:n.p,x:n.x,d:n.d,tie:n.tie})!==JSON.stringify({r:o.r,p:o.p,x:o.x,d:o.d,tie:o.tie});
}

// ---------- operações
function stepP(p,dir){const KA=keyAlt(S.fifths);let li=LETTERS.indexOf(p.l)+dir,o=p.o;if(li>6){li=0;o++}if(li<0){li=6;o--}const l=LETTERS[li];const q={l,a:KA[l],o};const mm=midi(q);if(mm<24||mm>108)return p;return q}
function chain(s,m,i){ // notas ligadas com mesma altura
  const out=[[m,i]];let a=[m,i];
  for(;;){const p=prevEv(s,a[0],a[1]);if(!p)break;if(tiedSame(ev(s,p[0],p[1]),ev(s,a[0],a[1]))){out.unshift(p);a=p}else break}
  a=[m,i];for(;;){const nx=nextEv(s,a[0],a[1]);if(!nx)break;if(tiedSame(ev(s,a[0],a[1]),ev(s,nx[0],nx[1]))){out.push(nx);a=nx}else break}
  return out.map(([x,y])=>ev(s,x,y));
}
function setPitchAll(fn){const n=cur();if(!n||n.r)return;chain(sel.s,sel.m,sel.i).forEach(e=>{if(!e.r){fn(e);e.unc=false}})}
function hp(n,h){return h===0?n.p:n.x[h-1]}
function setDur(s,m,i,nd){ // muda só esta nota; o compasso pode ficar com tempo faltando/sobrando (aviso)
  const n=ev(s,m,i);if(!n||!DUR[nd])return;n.d=nd;n.auto=false;n.unc=false;
}
function measureLen(s,m){return S.measures[m].st[s].reduce((a,e)=>a+e.d,0)}
function onlyAuto(s,m){const L=S.measures[m].st[s];return L.length>0&&L.every(e=>e.r&&e.auto)}
function fmtLen(u){if(DUR_NAME[u])return (u===1||u===2||u===3?'1 ':'1 ')+DUR_NAME[u];const b=u/beatUnit(S.meter);const t=Math.round(b*100)/100;return String(t).replace('.',',')+(t===1?' tempo':' tempos')}
function fmtBeats(u){const b=u/beatUnit(S.meter);const w=Math.floor(b),f=b-w;const fr=Math.abs(f-.5)<.01?'½':Math.abs(f-.25)<.01?'¼':Math.abs(f-.75)<.01?'¾':Math.abs(f-1/3)<.02?'⅓':Math.abs(f-2/3)<.02?'⅔':f>0.01?'+':'';return (w||!fr?w:'')+fr}
function balance(s,m){const len=measureLen(s,m),C=measureCap(m);if(onlyAuto(s,m))return 0;if(m===0&&S.measures[0].pickup)return 0;return len-C}
function normalize(s,m){ // garante figuras representáveis (divide com ligadura se preciso)
  const L=S.measures[m].st[s];const out=[];
  L.forEach(e=>{if(DUR[e.d])out.push(e);else{const ps=pieces(e.d);ps.forEach((d,k)=>out.push(e.r?{r:true,p:null,x:[],d,tie:false}:{...clone(e),d,tie:k<ps.length-1?true:e.tie}))}});
  if(!out.length)out.push(...emptyStaff(measureCap(m)));
  S.measures[m].st[s]=out;
}
function defaultPitch(s){const clef=S.staves[s].clef;const KA=keyAlt(S.fifths);return clef==='bass'?{l:'D',a:KA.D,o:3}:{l:'B',a:KA.B,o:4}}

// ---------- desenho
const BEAM3=['6/8','3/8','9/8','12/8'];
function minW(m){let w=0;S.staves.forEach((_,s)=>{const L=S.measures[m].st[s];const ww=L.reduce((a,e)=>a+Math.max(({1:20,2:22,3:28,4:26,6:32,8:34,12:40,16:42,24:48}[e.d]||24)+(e.x&&e.x.length?4:0),e.t?e.t.length*7+8:0),0);w=Math.max(w,ww)});return w+34}
function render(){
  const sc_=$('score');let host=$('svgHost');
  if(!host){sc_.innerHTML='<div id="svgHost"></div><div id="touchLayer"></div>';host=$('svgHost');bindTouch()}
  const W=Math.max(300,sc_.clientWidth-10);
  const ns=S.staves.length;const STG=100;const rowH=40+ns*STG+(ns>1?0:10);
  const HEAD=58+Math.abs(S.fifths)*10,TIME=24;
  const mins=S.measures.map((_,m)=>minW(m));
  const rows=[];let cur_=[],used=0;
  S.measures.forEach((_,m)=>{if(cur_.length&&used+mins[m]>W-14){rows.push(cur_);cur_=[];used=0}used+=mins[m]+(cur_.length===0?HEAD+(rows.length===0?TIME:0):0);cur_.push(m)});
  if(cur_.length)rows.push(cur_);
  host.innerHTML='';
  const r=new VF.Renderer(host,VF.Renderer.Backends.SVG);r.resize(W,rows.length*rowH+20);
  const ctx=r.getContext();hits=[];drawn={};layout={rows,rowH,staves:[]};
  const grp=BEAM3.includes(S.meter)?new VF.Fraction(3,8):new VF.Fraction(2,8);
  const KA0=keyAlt(S.fifths);
  const tieList=[];
  rows.forEach((row,ri)=>{
    const y0=ri*rowH+34;const hd=HEAD+(ri===0?TIME:0);
    const sum=row.reduce((a,m)=>a+mins[m],0);let scale=(W-14-hd)/sum;if(ri===rows.length-1)scale=Math.min(scale,1.5);
    let x=ns>1?12:4;
    row.forEach((m,k)=>{
      const w=mins[m]*scale+(k===0?hd:0);
      const staves=S.staves.map((sd,s)=>{const st=new VF.Stave(x,y0+s*STG,w);
        if(k===0){st.addClef(sd.clef).addKeySignature(VFKEY[S.fifths]);if(ri===0)st.addTimeSignature(S.meter)}
        if(m===S.measures.length-1)st.setEndBarType(VF.Barline.type.END);
        if(k===0&&s===0)st.setMeasure(m+1-(S.measures[0].pickup?1:0)||'');
        return st});
      if(staves.length>1&&k===0)VF.Stave.formatBegModifiers(staves);
      staves.forEach(st=>st.setContext(ctx).draw());
      S.staves.forEach((sd,s)=>{const bal=balance(s,m);if(bal){const st=staves[s];ctx.save();ctx.setFont('Arial',11,'bold');ctx.setFillStyle(bal<0?'#e65100':'#c62828');
        ctx.fillText('⚠ '+(bal<0?'−':'+')+fmtBeats(Math.abs(bal)),st.getX()+(k===0?hd-40:8),st.getYForLine(0)-(s===0&&S.measures[m].chord?26:12));ctx.restore()}});
      if(staves.length>1){
        if(k===0){new VF.StaveConnector(staves[0],staves[staves.length-1]).setType('brace').setContext(ctx).draw();new VF.StaveConnector(staves[0],staves[staves.length-1]).setType('singleLeft').setContext(ctx).draw()}
        new VF.StaveConnector(staves[0],staves[staves.length-1]).setType(m===S.measures.length-1?'boldDoubleRight':'singleRight').setContext(ctx).draw();
      }
      const voices=[],beamsAll=[];
      S.staves.forEach((sd,s)=>{
        const L=S.measures[m].st[s];const state={...KA0};const accMemo={};
        const notes=L.map((n,i)=>{
          const [dur,dot]=DUR[n.d]||['q',0];let sn;
          if(n.r){const full=L.length===1;sn=new VF.StaveNote({clef:sd.clef,keys:[sd.clef==='bass'?'d/3':'b/4'],duration:dur+'r',align_center:full});sn.__ord=[0]}
          else{
            const hs=heads(n).map((p,h)=>({p,h})).sort((a,b)=>midi(a.p)-midi(b.p));
            sn=new VF.StaveNote({clef:sd.clef,keys:hs.map(z=>z.p.l.toLowerCase()+(z.p.a<0?'b':z.p.a>0?'#':'')+'/'+z.p.o),duration:dur,auto_stem:true});
            hs.forEach((z,kk)=>{const key=z.p.l+z.p.o;const curA=key in accMemo?accMemo[key]:state[z.p.l];if(z.p.a!==curA){sn.addModifier(new VF.Accidental(z.p.a<0?'b':z.p.a>0?'#':'n'),kk);accMemo[key]=z.p.a}});
            sn.__ord=hs.map(z=>z.h);
          }
          if(dot)VF.Dot.buildAndAttach([sn],{all:true});
          const ed=isEdited(s,m,i);const c=n.unc?'#d32f2f':ed?'#2e7d32':(n.r?'#777':'#1a1a1a');sn.setStyle({fillStyle:c,strokeStyle:c});
          if(sel&&sel.s===s&&sel.m===m&&sel.i===i){if(n.r)sn.setStyle({fillStyle:'#1565c0',strokeStyle:'#1565c0'});else sn.__ord.forEach((h,kk)=>{const cc=h===sel.h?'#1565c0':'#64b5f6';sn.setKeyStyle(kk,{fillStyle:cc,strokeStyle:cc})})}
          if(n.t){const la=new VF.Annotation(n.t.replace(/-$/,' -')).setFont('Georgia',12).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM);la.setStyle({fillStyle:'#1a1a1a',strokeStyle:'#1a1a1a'});sn.addModifier(la,0)}
          if(s===0&&i===0&&S.measures[m].chord){const ca=new VF.Annotation(S.measures[m].chord).setFont('Arial',13,'bold').setVerticalJustification(VF.Annotation.VerticalJustify.TOP);ca.setStyle({fillStyle:'#1a1a1a',strokeStyle:'#1a1a1a'});sn.addModifier(ca,0)}
          drawn[s+','+m+','+i]=sn;sn.__row=ri;return sn;
        });
        // completa com notas invisíveis para alinhar pautas de tamanhos diferentes
        const maxLen=Math.max(...S.measures[m].st.map(LL=>LL.reduce((x,e)=>x+e.d,0)));let pad=maxLen-L.reduce((x,e)=>x+e.d,0);
        const ghosts=[];for(const g of [16,8,4,2,1])while(pad>=g){ghosts.push(new VF.GhostNote({duration:{16:'w',8:'h',4:'q',2:'8',1:'16'}[g]}));pad-=g}
        const v=new VF.Voice({num_beats:maxLen||1,beat_value:16}).setMode(VF.Voice.Mode.SOFT);v.addTickables([...notes,...ghosts]);voices.push(v);
        beamsAll.push(VF.Beam.generateBeams(notes.filter(n=>!n.isRest()),{groups:[grp]}));
      });
      const fm=new VF.Formatter();voices.forEach(v=>fm.joinVoices([v]));
      const nsx=Math.max(...staves.map(st=>st.getNoteStartX()));staves.forEach(st=>st.setNoteStartX(nsx));
      fm.format(voices,Math.max(30,staves[0].getX()+staves[0].getWidth()-nsx-14));
      voices.forEach((v,s)=>v.draw(ctx,staves[s]));
      beamsAll.forEach(bs=>bs.forEach(b=>b.setContext(ctx).draw()));
      S.staves.forEach((sd,s)=>{
        const st=staves[s];layout.staves.push({row:ri,s,m,x0:st.getX(),x1:st.getX()+st.getWidth(),top:st.getYForLine(0),sp:st.getSpacingBetweenLines()});
        S.measures[m].st[s].forEach((n,i)=>{const sn=drawn[s+','+m+','+i];hits.push({s,m,i,row:ri,x:sn.getAbsoluteX()+6,ys:sn.getYs(),ord:sn.__ord,top:st.getYForLine(0)})});
      });
      x+=w;
    });
  });
  // ligaduras (mesma pauta), inclusive entre compassos e linhas
  S.staves.forEach((sd,s)=>{order(s).forEach(([m,i])=>{
    const n=ev(s,m,i);if(!n.tie||n.r)return;const nx=nextEv(s,m,i);if(!nx)return;const b=ev(s,nx[0],nx[1]);if(!b||b.r)return;
    const A=drawn[s+','+m+','+i],B=drawn[s+','+nx[0]+','+nx[1]];
    const sa=sortedHeads(n),sb=sortedHeads(b);let ia=[],ib=[];
    sa.forEach((p,k)=>{const j=sb.findIndex(q=>sameP(p,q));if(j>=0){ia.push(k);ib.push(j)}});
    if(!ia.length){ia=[sa.length-1];ib=[sb.length-1]} // nada em comum: ligadura de expressão pela nota de cima
    try{if(A.__row===B.__row)new VF.StaveTie({first_note:A,last_note:B,first_indices:ia,last_indices:ib}).setContext(ctx).draw();
      else{new VF.StaveTie({first_note:A,last_note:null,first_indices:ia,last_indices:ia}).setContext(ctx).draw();new VF.StaveTie({first_note:null,last_note:B,first_indices:ib,last_indices:ib}).setContext(ctx).draw()}}catch(e){}
  })});
  upd();save();
}

// ---------- toque na partitura
function locate(cx,cy){
  const svg=document.querySelector('#score svg');if(!svg)return null;
  const b=svg.getBoundingClientRect();const x=cx-b.left,y=cy-b.top;
  let best=null,bd=1e9;
  layout.staves.forEach(st=>{if(x<st.x0||x>st.x1)return;const mid=st.top+2*st.sp;const d=Math.abs(y-mid);if(d<bd&&d<st.sp*5){bd=d;best=st}});
  if(!best)return null;
  let hb=null,hd=1e9;hits.forEach(h=>{if(h.s!==best.s||h.m!==best.m)return;const d=Math.abs(h.x-x);if(d<hd){hd=d;hb=h}});
  // altura tocada
  const steps=Math.round((y-best.top)/(best.sp/2));
  const topRef=S.staves[best.s].clef==='bass'?{l:'A',o:3}:{l:'F',o:5};
  let li=LETTERS.indexOf(topRef.l),o=topRef.o;for(let k=0;k<steps;k++){li--;if(li<0){li=6;o--}}for(let k=0;k>steps;k--){li++;if(li>6){li=0;o++}}
  const l=LETTERS[li];const p={l,a:keyAlt(S.fifths)[l],o};
  let head=0;if(hb){let dy=1e9;hb.ys.forEach((yy,k)=>{const d=Math.abs(yy-y);if(d<dy){dy=d;head=hb.ord[k]}})}
  return {st:best,hit:hb,p,head};
}
let drag=null;
function onDown(cx,cy){
  const L=locate(cx,cy);if(!L||!L.hit)return false;
  const {s,m,i}=L.hit;
  if(pencil){
    snap();const d=dotOn?palette*1.5:palette;if(!DUR[d])return true;
    const Lst=S.measures[m].st[s];const nn={r:false,p:L.p,x:[],d,tie:false};
    let idx;
    if(onlyAuto(s,m)){S.measures[m].st[s]=[nn];idx=0}
    else{
      const mine=hits.filter(h=>h.s===s&&h.m===m);const last=mine[mine.length-1];
      const svgL=document.querySelector('#score svg').getBoundingClientRect().left;const x=cx-svgL;
      if(last&&x>last.x+16){Lst.push(nn);idx=Lst.length-1}        // toque depois da última nota: acrescenta
      else{const e=Lst[i];e.r=false;e.auto=false;e.p=L.p;e.x=e.x||[];e.d=d;idx=i} // toque numa nota/pausa: substitui
    }
    sel={s,m,i:idx,h:0};beep([L.p]);render();
    return true;
  }
  const already=sel&&sel.s===s&&sel.m===m&&sel.i===i;
  const nNow=ev(s,m,i);
  // perto da cabeça da nota? (evita mexer sem querer ao rolar a tela)
  const svgB=document.querySelector('#score svg').getBoundingClientRect();
  const onHead=L.hit.ys.some(yy=>Math.abs(yy-(cy-svgB.top))<=10)&&Math.abs(L.hit.x-(cx-svgB.left))<=14;
  if(!already||sel.h!==L.head){sel={s,m,i,h:L.head};render();if(nNow&&!nNow.r)beep(heads(nNow));return false}
  if(nNow&&!nNow.r&&onHead){drag={y:cy,acc:0,snapped:false,moved:false};return true}
  return false;
}
function onMove(cy){if(!drag)return;const dy=drag.y-cy;if(!drag.moved&&Math.abs(dy)<12)return;drag.moved=true;const st=Math.max(-14,Math.min(14,Math.trunc((dy-(dy>0?12:-12))/9)));if(st!==drag.acc){const d=st-drag.acc;for(let k=0;k<Math.abs(d);k++)step(Math.sign(d));drag.acc=st}}
function step(dir){const n=cur();if(!n||n.r)return;if(drag){if(!drag.snapped){snap();drag.snapped=true}}else snap();const h=sel.h;setPitchAll(e=>{if(h===0)e.p=stepP(e.p,dir);else if(e.x[h-1])e.x[h-1]=stepP(e.x[h-1],dir)});render();beep([hp(cur(),sel.h)])}

// ---------- som
let AC=null,playing=[],timers=[],lit=[];
function ac(){if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();return AC}
const hz=m=>440*Math.pow(2,(m-69)/12);
function tone(m,t0,dur,vol){const a=ac(),o=a.createOscillator(),o2=a.createOscillator(),g=a.createGain(),g2=a.createGain();
  o.type='triangle';o2.type='sine';o.frequency.value=hz(m);o2.frequency.value=hz(m)*2;g2.gain.value=0.25;o2.connect(g2);g2.connect(g);o.connect(g);g.connect(a.destination);
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+0.03);g.gain.setValueAtTime(vol,t0+Math.max(0.04,dur-0.06));g.gain.linearRampToValueAtTime(0,t0+dur);
  o.start(t0);o2.start(t0);o.stop(t0+dur+0.05);o2.stop(t0+dur+0.05);playing.push(o,o2)}
function beep(ps){try{const a=ac();ps.forEach((p,i)=>tone(midi(p),a.currentTime+0.01,0.4,i?0.12:0.17))}catch(e){}}
function unlight(){lit.forEach(el=>el.classList.remove('playing'));lit=[]}
function light(keys){unlight();let first=null;keys.forEach(k=>{const sn=drawn[k];if(!sn)return;let el=null;try{el=sn.getSVGElement()}catch(e){}if(el){el.classList.add('playing');lit.push(el);first=first||el}});
  if(first){const box=$('editorArea');const r=first.getBoundingClientRect(),b=box.getBoundingClientRect();if(r.top<b.top+10||r.bottom>b.bottom-10)box.scrollBy({top:r.top-b.top-b.height*0.3,behavior:'smooth'})}}
function stop(){timers.forEach(clearTimeout);timers=[];unlight();playing.forEach(o=>{try{o.stop()}catch(e){}});playing=[]}
const NOTEPC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function chordMidis(nm){if(!nm)return[];let r=NOTEPC[nm[0].toUpperCase()],i=1;if(r==null)return[];if(nm[1]==='#'){r++;i=2}else if(nm[1]==='b'){r--;i=2}const q=nm.slice(i);
  const iv=/^m(?!aj)/.test(q)?(q.includes('7')?[0,3,7,10]:[0,3,7]):q.includes('7')?[0,4,7,10]:[0,4,7];const root=48+((r+12)%12);return [root-12,...iv.map(x=>root+x)]}
function play(fromSel){
  stop();const a=ac();const U=60/bpm()/beatUnit(S.meter);
  // linha do tempo em semicolcheias
  const starts=[];let mt=0;const events=[];
  S.measures.forEach((M,m)=>{const len=Math.max(measureCap(m),...M.st.map(L=>L.reduce((x,e)=>x+e.d,0)));starts.push(mt);
    M.st.forEach((L,s)=>{let t=0;L.forEach((n,i)=>{events.push({s,m,i,t:mt+t,n});t+=n.d})});mt+=len});
  let t0u=0;if(fromSel&&sel){const e=events.find(e=>e.s===sel.s&&e.m===sel.m&&e.i===sel.i);if(e)t0u=e.t}
  const base=a.currentTime+0.15;const withCh=$('chk').checked;
  S.measures.forEach((M,m)=>{if(withCh&&M.chord&&starts[m]>=t0u){const len=(starts[m+1]??mt)-starts[m];chordMidis(M.chord).forEach(x=>tone(x,base+(starts[m]-t0u)*U,len*U,0.035))}});
  const groups={};
  events.forEach(e=>{if(e.t<t0u)return;const tt=base+(e.t-t0u)*U;
    const p=prevEv(e.s,e.m,e.i);const pv=p?ev(e.s,p[0],p[1]):null;
    const nx0=nextEv(e.s,e.m,e.i);const nv0=nx0?ev(e.s,nx0[0],nx0[1]):null;
    if(!e.n.r)heads(e.n).forEach((pp,k)=>{
      if(e.t>t0u&&headTie(pp,pv,e.n))return; // continua soando da nota anterior (não toca de novo)
      let dur=e.n.d*U;let c=[e.m,e.i];
      for(;;){const nx=nextEv(e.s,c[0],c[1]);if(!nx)break;const a2=ev(e.s,c[0],c[1]),b2=ev(e.s,nx[0],nx[1]);if(headTie(pp,a2,b2)){dur+=b2.d*U;c=nx}else break}
      const legato=e.n.tie&&nv0&&!nv0.r&&!headTie(pp,e.n,nv0); // muda de nota, mas emenda (ligadura de expressão)
      tone(midi(pp),tt,dur*(legato?1.03:0.96),(k?0.11:0.16)*(e.s?0.8:1));
    });
    (groups[e.t]=groups[e.t]||[]).push(e.s+','+e.m+','+e.i)});
  Object.keys(groups).forEach(t=>{const d=Math.max(0,(base+(t-t0u)*U-a.currentTime)*1000);timers.push(setTimeout(()=>light(groups[t]),d))});
  timers.push(setTimeout(unlight,Math.max(0,(base+(mt-t0u)*U-a.currentTime)*1000)+200));
}
function bpm(){let v=Math.round(+$('tempo').value||0);v=Math.min(300,Math.max(20,v||80));$('tempo').value=v;S.bpm=v;return v}

// ---------- MusicXML
function musicxml(){
  const [bn,bv]=S.meter.split('/').map(Number);
  const T={1:['16th',0],2:['eighth',0],3:['eighth',1],4:['quarter',0],6:['quarter',1],8:['half',0],12:['half',1],16:['whole',0],24:['whole',1]};
  const pitch=p=>`<pitch><step>${p.l}</step>${p.a?`<alter>${p.a}</alter>`:''}<octave>${p.o}</octave></pitch>`;
  const esc=t=>String(t).replace(/[<&>]/g,'');
  let x=`<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="3.1"><work><work-title>${esc(S.title)}</work-title></work><part-list><score-part id="P1"><part-name>${S.staves.length>1?'Piano':'Música'}</part-name></score-part></part-list><part id="P1">`;
  S.measures.forEach((M,m)=>{
    x+=`<measure number="${m+1}"${M.pickup&&m===0?' implicit="yes"':''}>`;
    if(m===0){x+=`<attributes><divisions>4</divisions><key><fifths>${S.fifths}</fifths>${S.minor?'<mode>minor</mode>':''}</key><time><beats>${bn}</beats><beat-type>${bv}</beat-type></time>${S.staves.length>1?`<staves>${S.staves.length}</staves>`:''}`;
      S.staves.forEach((sd,s)=>x+=`<clef${S.staves.length>1?` number="${s+1}"`:''}><sign>${sd.clef==='bass'?'F':'G'}</sign><line>${sd.clef==='bass'?4:2}</line></clef>`);x+='</attributes>';
      if(m===0)x+=`<direction placement="above"><direction-type><metronome><beat-unit>${beatUnit(S.meter)===6?'quarter':'quarter'}</beat-unit>${beatUnit(S.meter)===6?'<beat-unit-dot/>':''}<per-minute>${S.bpm||80}</per-minute></metronome></direction-type><sound tempo="${beatUnit(S.meter)===6?(S.bpm||80)*1.5:(S.bpm||80)}"/></direction>`}
    if(M.chord){const c=M.chord;let st=c[0].toUpperCase(),al=0,i=1;if(c[1]==='#'){al=1;i=2}else if(c[1]==='b'){al=-1;i=2}const q=c.slice(i);
      if(/[A-G]/.test(st))x+=`<harmony><root><root-step>${st}</root-step>${al?`<root-alter>${al}</root-alter>`:''}</root><kind text="${esc(q)}">${/^m(?!aj)/.test(q)?(q.includes('7')?'minor-seventh':'minor'):q.includes('7')?'dominant':'major'}</kind></harmony>`}
    M.st.forEach((L,s)=>{
      if(s>0){const tot=M.st[s-1].reduce((a,e)=>a+e.d,0);x+=`<backup><duration>${tot}</duration></backup>`}
      L.forEach((n,i)=>{
        const [ty,dot]=T[n.d]||['quarter',0];const stf=S.staves.length>1?`<staff>${s+1}</staff>`:'';
        if(n.r){x+=`<note><rest/><duration>${n.d}</duration><voice>${s+1}</voice><type>${ty}</type>${dot?'<dot/>':''}${stf}</note>`;return}
        const p=prevEv(s,m,i),nx=nextEv(s,m,i);const pv=p?ev(s,p[0],p[1]):null,nv=nx?ev(s,nx[0],nx[1]):null;
        const sS=pv&&pv.tie&&!pv.r&&!anyCommon(pv,n),sB=n.tie&&nv&&!nv.r&&!anyCommon(n,nv);
        heads(n).forEach((pp,h)=>{
          const tS=headTie(pp,pv,n),tB=headTie(pp,n,nv);
          const ties=(tS?'<tie type="stop"/>':'')+(tB?'<tie type="start"/>':'');
          const nt=(tS?'<tied type="stop"/>':'')+(tB?'<tied type="start"/>':'')+(h===0&&sS?'<slur type="stop"/>':'')+(h===0&&sB?'<slur type="start"/>':'');
          let ly='';if(h===0&&n.t){const cont=/-$/.test(n.t);const pvL=pv&&pv.t&&/-$/.test(pv.t);const syl=cont?(pvL?'middle':'begin'):(pvL?'end':'single');ly=`<lyric number="1"><syllabic>${syl}</syllabic><text>${esc(n.t.replace(/-$/,''))}</text></lyric>`}
          x+=`<note>${h?'<chord/>':''}${pitch(pp)}<duration>${n.d}</duration>${ties}<voice>${s+1}</voice><type>${ty}</type>${dot?'<dot/>':''}${stf}${nt?`<notations>${nt}</notations>`:''}${ly}</note>`;
        });
      });
    });
    if(m===S.measures.length-1)x+='<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    x+='</measure>';
  });
  return x+'</part></score-partwise>';
}

// ---------- painel
function upd(){
  const n=cur();const note=n&&!n.r;
  const set=(id,on)=>{const e=$(id);if(e)e.disabled=!on};
  ['up','down','acc','add','flat','natural','sharp'].forEach(id=>set(id,note));
  set('del',note&&n.x.length);set('cyc',note&&n.x.length);
  const nx=sel?nextEv(sel.s,sel.m,sel.i):null;const nv=nx?ev(sel.s,nx[0],nx[1]):null;
  set('tie',note&&(n.tie||(nv&&!nv.r)));if($('tie'))$('tie').classList.toggle('on',!!(note&&n.tie));
  set('ok',!!(n&&n.unc));set('rest',!!n||pencil);set('erase',!!n&&!(n.auto&&onlyAuto(sel.s,sel.m)));set('insAfter',!!n);
  if($('rest'))$('rest').classList.toggle('on',!!(n&&n.r&&!pencil));
  ['flat','natural','sharp'].forEach((id,k)=>{if($(id))$(id).classList.toggle('on',!!(note&&hp(n,sel.h)&&hp(n,sel.h).a===[-1,0,1][k]&&hp(n,sel.h).a!==keyAlt(S.fifths)[hp(n,sel.h).l]))});
  set('playFrom',!!n);set('undo',hist.length>0);set('redo',fut.length>0);
  set('mAddAfter',!!sel);set('mDel',!!sel&&S.measures.length>1);set('chordIn',!!sel);set('staffDel',!!sel&&S.staves.length>1);set('staffAdd',S.staves.length<2);set('swapStaff',S.staves.length>1);
  if($('chordIn')&&sel&&document.activeElement!==$('chordIn'))$('chordIn').value=S.measures[sel.m].chord||'';
  document.querySelectorAll('.dur').forEach(b=>{const d=+b.dataset.d;const want=dotOn?d*1.5:d;b.classList.toggle('on',pencil?d===palette:!!(n&&(n.d===d||n.d===d*1.5)));b.disabled=!pencil&&!(n&&DUR[want])});
  $('dot').classList.toggle('on',pencil?dotOn:!!(n&&[3,6,12,24].includes(n.d)));
  $('pencil').classList.toggle('on',pencil);
  const el=$('info');
  if(!S){el.textContent='';return}
  if(!n){el.innerHTML=`<span style="color:#8fa0bd">${keyLabel(S.fifths,S.minor)} · ${S.meter}</span> · `+(pencil?'✏️ Entrada de notas: escolha a figura e toque C D E F G A B (ou toque na pauta, na altura da nota).':'Toque numa nota para editar · ✏️ para escrever');return}
  const mn=sel.m+1-(S.measures[0].pickup?1:0);const where=`${pencil?'✏️ ':''}${mn===0?'Anacruse':'Compasso '+mn}${S.staves.length>1?(sel.s===0?' · mão direita':' · mão esquerda'):''}`;
  const balS=S.staves.map((_,s)=>balance(s,sel.m));const bal=balS[sel.s];
  const warn=bal?` <span style="color:${bal<0?'#e65100':'#c62828'}">· ${bal<0?'falta':'sobra'} ${fmtLen(Math.abs(bal))} neste compasso</span>`:'';
  if(n.r){el.innerHTML=`${where} · <b>pausa</b> de ${DUR_NAME[n.d]||n.d}${warn}`;return}
  const hs=heads(n).map((p,h)=>({p,h})).sort((a,b)=>midi(b.p)-midi(a.p)).map(z=>z.h===sel.h?`<b>${name(z.p)}</b>`:name(z.p)).join(' + ');
  el.innerHTML=`${where} · ${hs} · ${DUR_NAME[n.d]||''}${n.t?' · “'+n.t.replace(/-$/,'')+'”':''}${n.unc?' <span style="color:#d32f2f">· leitura incerta</span>':''}${warn}`;
}
function on(id,fn){const e=$(id);if(e)e.onclick=fn}
function undo(){if(!hist.length)return;fut.push(JSON.stringify(S));S=JSON.parse(hist.pop());if(sel&&!cur())sel=null;render();flash('Desfeito')}
function redo(){if(!fut.length)return;hist.push(JSON.stringify(S));S=JSON.parse(fut.pop());if(sel&&!cur())sel=null;render();flash('Refeito')}
function bindAll(){bind();bindTabs()}
function bind(){
  on('up',()=>step(1));on('down',()=>step(-1));
  on('acc',()=>{const n=cur();if(!n||n.r)return;snap();const h=sel.h;setPitchAll(e=>{const p=hp(e,h);if(p)p.a=p.a===-1?0:p.a===0?1:-1});render();beep([hp(cur(),sel.h)])});
  on('add',()=>{const n=cur();if(!n||n.r)return;snap();setPitchAll(e=>{const low=heads(e).reduce((a,b)=>midi(b)<midi(a)?b:a);e.x.push(stepP(stepP(low,-1),-1))});sel.h=cur().x.length;render();beep(heads(cur()))});
  on('del',()=>{const n=cur();if(!n||n.r||!n.x.length)return;snap();const h=sel.h;setPitchAll(e=>{if(h===0)e.p=e.x.shift();else e.x.splice(h-1,1)});sel.h=0;render()});
  on('cyc',()=>{const n=cur();if(!n||n.r)return;sel.h=(sel.h+1)%heads(n).length;render();beep([hp(n,sel.h)])});
  on('ok',()=>{const n=cur();if(!n)return;snap();n.unc=false;render()});
  on('tie',()=>{const n=cur();if(!n||n.r)return;snap();n.tie=!n.tie;render()});
  on('rest',()=>{if(pencil){if(!sel)sel={s:0,m:0,i:0,h:0};snap();const d=dotOn?palette*1.5:palette;const nn={r:true,p:null,x:[],d:DUR[d]?d:4,tie:false};const {s:ss,m}=sel;const L=S.measures[m].st[ss];const c=cur();
      if(onlyAuto(ss,m)){S.measures[m].st[ss]=[nn];sel.i=0}else if(c&&c.r&&c.auto){Object.assign(c,nn,{auto:false})}else{L.splice(sel.i+1,0,nn);sel.i++}render();return}
    const n=cur();if(!n)return;snap();n.auto=false;if(n.r){n.r=false;n.p=defaultPitch(sel.s);n.x=[];beep([n.p])}else{n.r=true;n.p=null;n.x=[];n.tie=false;const pv=prevEv(sel.s,sel.m,sel.i);if(pv){const a=ev(sel.s,pv[0],pv[1]);if(a)a.tie=false}}render()});
  on('erase',()=>{const n=cur();if(!n)return;snap();const L=S.measures[sel.m].st[sel.s];const pv=prevEv(sel.s,sel.m,sel.i);if(pv){const a=ev(sel.s,pv[0],pv[1]);if(a&&!nextEv(sel.s,sel.m,sel.i))a.tie=false}
    L.splice(sel.i,1);if(!L.length){L.push(...emptyStaff(measureCap(sel.m)));sel.i=0}else sel.i=Math.min(sel.i,L.length-1);render()});
  on('insAfter',()=>{const n=cur();if(!n)return;snap();const L=S.measures[sel.m].st[sel.s];const d=DUR[n.d]?n.d:4;
    const nn={r:false,p:n.r?defaultPitch(sel.s):{...n.p},x:[],d,tie:false};if(onlyAuto(sel.s,sel.m)){S.measures[sel.m].st[sel.s]=[nn];sel.i=0}else{L.splice(sel.i+1,0,nn);sel.i++}sel.h=0;render();beep([nn.p])});
  on('undo',undo);on('redo',redo);
  on('prev',()=>nav(-1));on('next',()=>nav(1));
  on('swapStaff',()=>swapStaff(0));
  const setAcc=a=>{const n=cur();if(!n||n.r)return;snap();const h=sel.h;setPitchAll(e=>{const p=hp(e,h);if(p)p.a=a});render();beep([hp(cur(),sel.h)])};
  on('flat',()=>setAcc(-1));on('natural',()=>setAcc(0));on('sharp',()=>setAcc(1));
  document.querySelectorAll('.dur').forEach(b=>b.onclick=()=>{const d=+b.dataset.d;if(pencil){palette=d;upd();return}const n=cur();if(!n)return;const want=dotOn?d*1.5:d;if(!DUR[want])return;snap();if(n.auto){n.auto=false}setDur(sel.s,sel.m,sel.i,want);render()});
  on('dot',()=>{if(pencil){dotOn=!dotOn;upd();return}const n=cur();if(!n)return;snap();const isDot=[3,6,12,24].includes(n.d);const nd=isDot?n.d/1.5:n.d*1.5;if(DUR[nd])setDur(sel.s,sel.m,sel.i,nd);render()});
  on('pencil',()=>{pencil=!pencil;if(pencil&&!sel)sel={s:0,m:0,i:0,h:0};upd()});
  on('mAddAfter',()=>{if(!sel)return;snap();const C=cap(S.meter);S.measures.splice(sel.m+1,0,{chord:'',st:S.staves.map(()=>emptyStaff(C))});render()});
  on('mAddEnd',()=>{snap();const C=cap(S.meter);S.measures.push({chord:'',st:S.staves.map(()=>emptyStaff(C))});render()});
  on('mDel',()=>{if(!sel||S.measures.length<2)return;snap();S.measures.splice(sel.m,1);sel=null;render()});
  if($('chordIn'))$('chordIn').onchange=()=>{if(!sel)return;snap();S.measures[sel.m].chord=$('chordIn').value.trim().slice(0,12);render()};
  on('staffAdd',()=>{if(S.staves.length>=2)return;snap();const clef=S.staves[0].clef==='bass'?'treble':'bass';const C=cap(S.meter);
    if(clef==='treble'){S.staves.unshift({clef});S.measures.forEach((M,m)=>M.st.unshift(emptyStaff(measureCap(m))))}else{S.staves.push({clef});S.measures.forEach((M,m)=>M.st.push(emptyStaff(measureCap(m))))}sel=null;render()});
  on('staffDel',()=>{if(S.staves.length<2||!sel)return;snap();const s=sel.s;S.staves.splice(s,1);S.measures.forEach(M=>M.st.splice(s,1));sel=null;render()});
  on('playAll',()=>play(false));on('playFrom',()=>play(true));on('stop',stop);
  on('bpmDn',()=>{$('tempo').value=bpm()-2;bpm()});on('bpmUp',()=>{$('tempo').value=bpm()+2;bpm()});$('tempo').onchange=()=>{bpm();save()};
  on('trGo',()=>transpose(+$('trSel').value));on('trUp',()=>transpose(1));on('trDn',()=>transpose(-1));
  on('menuBtn2',()=>{});
  on('apply',()=>{if(!S)return;S.measures.forEach(M=>M.st.forEach(L=>L.forEach(e=>e.unc=false)));ORIG=clone(S);hist=[];render();let bad=0;S.measures.forEach((_,m)=>S.staves.forEach((_,s)=>{if(balance(s,m))bad++}));flash('Mudanças aplicadas.'+(bad?` Atenção: ${bad} compasso(s) com tempo faltando ou sobrando (marcados com ⚠).`:''))});
  on('revert',()=>{if(!ORIG)return;snap();S=clone(ORIG);sel=null;render();flash('Voltou para a última versão aplicada.')});
  on('copyXml',async()=>{const t=musicxml();$('out').style.display='block';$('outText').value=t;try{await navigator.clipboard.writeText(t);flash('MusicXML copiado! Cole no chat ou no MuseScore.')}catch(e){$('outText').focus();$('outText').select();flash('Copie o texto que apareceu abaixo da partitura.')}});
  on('saveJson',async()=>{const DL=await dl();if(!DL){flash('Salvar arquivo não está disponível aqui.');return}
    try{await DL.save({filename:(S.title||'partitura').replace(/[^\w\-À-ú ]+/g,'').trim().replace(/\s+/g,'_')+'.json',data:JSON.stringify({app:'partitura',v:1,score:S})});flash('Partitura salva (pasta Downloads).')}catch(e){flash(e&&e.code==='declined'?'Cancelado.':'Não foi possível salvar.')}});
  $('openJson').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const j=JSON.parse(await f.text());const sc=j.score||j;if(!sc.measures||!sc.staves)throw 0;load(sc,true);flash('Partitura aberta.')}catch(err){flash('Arquivo inválido.')}e.target.value=''};
  on('titleSave',()=>{});
  $('title').onchange=()=>{if(S){S.title=$('title').value;save()}};
}
function bindTouch(){
  const host=$('touchLayer');
  host.addEventListener('mousedown',e=>{if(onDown(e.clientX,e.clientY))e.preventDefault()});
  window.addEventListener('mousemove',e=>onMove(e.clientY));window.addEventListener('mouseup',()=>drag=null);
  host.addEventListener('touchstart',e=>{const t=e.touches[0];if(e.touches.length===1&&onDown(t.clientX,t.clientY))e.preventDefault()},{passive:false});
  window.addEventListener('touchmove',e=>{if(drag){e.preventDefault();onMove(e.touches[0].clientY)}},{passive:false});
  window.addEventListener('touchend',()=>drag=null);window.addEventListener('touchcancel',()=>drag=null);
}
function bindTabs(){
  let rt;window.addEventListener('resize',()=>{if(S&&$('app').style.display!=='none'){clearTimeout(rt);rt=setTimeout(render,150)}});
  const openD=v=>{$('drawer').style.display=v?'block':'none'};
  on('menuBtn',()=>{trOptions();openD(true)});on('shade',()=>openD(false));
  document.querySelectorAll('#drawer .mi').forEach(b=>b.addEventListener('click',()=>{if(b.id!=='bpmDn'&&b.id!=='bpmUp')setTimeout(()=>openD(false),50)}));
  on('goHome',()=>{openD(false);window.showHome&&window.showHome()});
  on('helpBtn',()=>{$('help').style.display='flex'});on('helpClose',()=>{$('help').style.display='none'});
  document.querySelectorAll('#keys [data-l]').forEach(b=>b.onclick=()=>enterLetter(b.dataset.l,false));
  // atalhos de teclado (estilo dos editores de partitura)
  window.addEventListener('keydown',e=>{
    if(!S||$('app').style.display==='none')return;
    const t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'))return;
    const k=e.key,ctrl=e.ctrlKey||e.metaKey;let h=true;
    if(ctrl&&(k==='z'||k==='Z')&&!e.shiftKey)undo();
    else if(ctrl&&(k==='y'||((k==='z'||k==='Z')&&e.shiftKey)))redo();
    else if(ctrl&&(k==='s'||k==='S'))$('saveJson').click();
    else if(ctrl)h=false;
    else if(e.altKey&&(k==='ArrowUp'||k==='ArrowDown'))swapStaff(k==='ArrowUp'?-1:1);
    else if(k==='ArrowUp'||k==='ArrowDown')stepN(k==='ArrowUp'?1:-1,e.ctrlKey||e.metaKey||e.shiftKey?7:1);
    else if(k==='ArrowRight')nav(1);else if(k==='ArrowLeft')nav(-1);
    else if(/^[a-gA-G]$/.test(k))enterLetter(k.toUpperCase(),e.shiftKey);
    else if(k==='n'||k==='N'){$('pencil').click()}
    else if(k>='3'&&k<='7'){const d={3:1,4:2,5:4,6:8,7:16}[k];const b=document.querySelector(`.dur[data-d="${d}"]`);if(b&&!b.disabled)b.click()}
    else if(k==='.')$('dot').click();
    else if(k==='0')$('rest').click();
    else if(k==='-')$('flat').click();else if(k==='=')$('natural').click();else if(k==='#')$('sharp').click();
    else if(k==='+')$('tie').click();
    else if(k==='Tab'){$('cyc').click()}
    else if(k==='Delete'||k==='Backspace')$('erase').click();
    else if(k==='k'||k==='K')$('ok').click();
    else if(k===' '){if(playing.length)stop();else play(!!sel)}
    else if(k==='Escape'){if(pencil){pencil=false;upd()}else{sel=null;render()}$('help').style.display='none';openD(false)}
    else if(k==='?'){$('help').style.display='flex'}
    else h=false;
    if(h)e.preventDefault();
  });
}
function swapStaff(dir){if(!S||S.staves.length<2)return;const s=sel?Math.max(0,Math.min(S.staves.length-1,sel.s+(dir||1)%S.staves.length)):0;const ns=dir?Math.max(0,Math.min(S.staves.length-1,(sel?sel.s:0)+dir)):(sel?1-sel.s:1);const m=sel?sel.m:0;sel={s:ns,m,i:0,h:0};render()}
function stepN(dir,n){const c=cur();if(!c||c.r)return;snap();const h=sel.h;for(let k=0;k<n;k++)setPitchAll(e=>{if(h===0)e.p=stepP(e.p,dir);else if(e.x[h-1])e.x[h-1]=stepP(e.x[h-1],dir)});render();beep([hp(cur(),sel.h)])}
// escreve nota por letra (como nos editores de partitura): oitava mais próxima da nota anterior
function nearest(letter,ref){const KA=keyAlt(S.fifths);let best=null;for(let o=1;o<=7;o++){const p={l:letter,a:KA[letter],o};const d=Math.abs(midi(p)-midi(ref));if(!best||d<best.d)best={p,d}}return best.p}
function refPitch(s,m,i){let c=[m,i];for(let k=0;k<400&&c;k++){const e=ev(s,c[0],c[1]);if(e&&!e.r&&e.p)return e.p;c=prevEv(s,c[0],c[1])}return defaultPitch(s)}
function enterLetter(letter,chordAdd){
  if(!S)return;if(!sel)sel={s:0,m:0,i:0,h:0};
  const n=cur();
  if(chordAdd){if(!n||n.r)return;snap();const p=nearest(letter,hp(n,0));const has=heads(n).some(q=>q.l===p.l&&q.o===p.o);if(!has){setPitchAll(e=>e.x.push({...p}));sel.h=cur().x.length}render();beep(heads(cur()));return}
  if(!pencil){if(!n)return;snap();if(n.r){n.r=false;n.auto=false;n.p=nearest(letter,refPitch(sel.s,sel.m,sel.i));n.x=[]}else{const p=nearest(letter,hp(n,sel.h));setPitchAll(e=>{if(sel.h===0)e.p=p;else e.x[sel.h-1]=p})}render();beep([hp(cur(),sel.h)]);return}
  snap();const d=dotOn?palette*1.5:palette;const {s,m}=sel;const L=S.measures[m].st[s];
  const p=nearest(letter,refPitch(s,m,sel.i));const nn={r:false,p,x:[],d:DUR[d]?d:4,tie:false};
  if(onlyAuto(s,m)){S.measures[m].st[s]=[nn];sel.i=0}
  else if(n&&n.r&&n.auto){Object.assign(n,nn,{auto:false});}
  else{
    // se o compasso já está completo, vai para o próximo
    if(sel.i===L.length-1&&measureLen(s,m)>=measureCap(m)&&m+1<S.measures.length){const L2=S.measures[m+1].st[s];if(onlyAuto(s,m+1))S.measures[m+1].st[s]=[nn];else L2.unshift(nn);sel={s,m:m+1,i:0,h:0}}
    else{L.splice(sel.i+1,0,nn);sel.i++}
  }
  sel.h=0;render();beep([p]);
}
// ---------- transpor
const TONIC={'-7':'Cb','-6':'Gb','-5':'Db','-4':'Ab','-3':'Eb','-2':'Bb','-1':'F','0':'C','1':'G','2':'D','3':'A','4':'E','5':'B','6':'F#','7':'C#'};
const PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function tonicPc(f){const t=TONIC[f];return (PC[t[0]]+(t[1]==='#'?1:t[1]==='b'?-1:0)+12)%12}
function newFifths(f,k){ // tom de destino com menos acidentes
  const pc=(tonicPc(f)+k+120)%12;let best=null;
  for(let g=-7;g<=7;g++)if(tonicPc(g)===pc){const sc=Math.abs(g)+(Math.abs(g)===6?(k>=0?(g>0?-.5:.5):(g<0?-.5:.5)):0);if(!best||sc<best.sc)best={g,sc}}
  return best.g;
}
function trPitch(p,steps,k){
  const m0=midi(p);let li=LETTERS.indexOf(p.l)+steps,o=p.o;while(li>6){li-=7;o++}while(li<0){li+=7;o--}
  const l=LETTERS[li];let a=m0+k-(12*(o+1)+SEMI[l]);
  if(a>2||a<-2){const q=m0+k;const KA=keyAlt(S.fifths);let best=null;for(const L2 of LETTERS)for(let a2=-1;a2<=1;a2++){const o2=Math.floor((q-SEMI[L2]-a2)/12)-1;if(12*(o2+1)+SEMI[L2]+a2===q){const sc=(a2===KA[L2]?0:1)+Math.abs(a2);if(!best||sc<best.sc)best={p:{l:L2,a:a2,o:o2},sc}}}return best.p}
  return {l,a,o};
}
function trChord(c,steps,k){
  return String(c||'').replace(/(^|\/)([A-G])([#b]?)/g,(all,pre,L,acc)=>{const p=trPitch({l:L,a:acc==='#'?1:acc==='b'?-1:0,o:4},steps,k);return pre+p.l+(p.a===1?'#':p.a===-1?'b':p.a===2?'##':p.a===-2?'bb':'')});
}
function transposeScore(sc,k,f0){
  const f1=newFifths(f0,k);
  const d=(LETTERS.indexOf(TONIC[f1][0])-LETTERS.indexOf(TONIC[f0][0])+70)%7;
  let st=d,bd=1e9;for(let n=-3;n<=3;n++){const c=d+7*n;const e=Math.abs(c-k*7/12);if(e<bd){bd=e;st=c}} // nº de letras ≈ tamanho do intervalo
  sc.measures.forEach(M=>{M.chord=trChord(M.chord,st,k);M.st.forEach(L=>L.forEach(n=>{if(n.r||!n.p)return;n.p=trPitch(n.p,st,k);n.x=(n.x||[]).map(p=>trPitch(p,st,k))}))});
  sc.fifths=f1;return sc;
}
function transpose(k){
  if(!S||!k)return;snap();const f0=S.fifths;
  const ok=[S,ORIG].filter(Boolean).every(x=>x.measures.every(M=>M.st.every(L=>L.every(n=>n.r||!n.p||(midi(n.p)+k>=24&&midi(n.p)+k<=108)))));
  if(!ok){hist.pop();flash('Não dá: algumas notas sairiam da extensão (Dó1 a Dó8).');return}
  transposeScore(S,k,f0);if(ORIG){const fo=ORIG.fifths;transposeScore(ORIG,k,fo)}
  render();const lab=keyLabel(S.fifths,S.minor);if($('keyInfo'))$('keyInfo').textContent=`${lab} · ${S.meter}`;trOptions();
  flash('Transposto para '+lab+'.');
}
function tonsLabel(k){const t=Math.abs(k)/2;const w=Math.floor(t),h=t-w;const txt=(w?w:'')+(h?(w?' e ½':'½'):'');return (k>0?'+':'−')+txt+(t>1?' tons':' tom')}
function trOptions(){const sel=$('trSel');if(!sel||!S)return;const cur=sel.value;sel.innerHTML='';
  for(let k=-12;k<=12;k++){if(!k)continue;const o=document.createElement('option');o.value=k;o.textContent=`${tonsLabel(k)}  →  ${keyLabel(newFifths(S.fifths,k),S.minor)}`;sel.appendChild(o)}
  sel.value=cur&&cur!=='0'?cur:'2';$('trNow').textContent=keyLabel(S.fifths,S.minor)}
function nav(d){if(!S)return;const s=sel?sel.s:0;const o=order(s);let k=sel?o.findIndex(([m,i])=>m===sel.m&&i===sel.i):-1;k=Math.min(o.length-1,Math.max(0,k+d));sel={s,m:o[k][0],i:o[k][1],h:0};render();const n=cur();if(n&&!n.r)beep(heads(n))}
function dl(){return Promise.resolve({save:async({filename,data})=>{const b=data instanceof Blob?data:new Blob([data],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);return {status:'saved'}}})}
function flash(t){const m=$('msg');m.textContent=t;m.style.display='block';clearTimeout(flash.t);flash.t=setTimeout(()=>m.style.display='none',t.length>40?4500:1600)}
function fixRange(sc){ // corrige notas fora da extensão (ex.: Dó-299 de versões antigas)
  sc.measures.forEach(M=>M.st.forEach((L,s)=>L.forEach(n=>{if(n.r||!n.p)return;const clef=(sc.staves[s]||{}).clef;
    const ok=p=>p&&typeof p.o==='number'&&midi(p)>=24&&midi(p)<=108;
    if(!ok(n.p))n.p=clef==='bass'?{l:'D',a:0,o:3}:{l:'B',a:0,o:4};n.x=(n.x||[]).filter(ok)})));
}
function load(sc,asApplied,orig){fixRange(sc);if(orig)fixRange(orig);S=sc;S.measures.forEach((M,m)=>M.st.forEach((_,s)=>normalize(s,m)));ORIG=orig?orig:(asApplied?clone(S):null);hist=[];sel=null;
  if(window.showApp)window.showApp();fut=[];
  $('title').value=S.title||'';$('tempo').value=S.bpm||80;
  $('keyInfo').textContent=`${keyLabel(S.fifths,S.minor)} · ${S.meter}`;render()}
window.ED={transpose,transposeScore,emptyStaff,blank,load,render,parseKey,keyLabel,get score(){return S},get hits(){return hits},get layout(){return layout},get sel(){return sel},cap,restsFor,musicxml,bind:bindAll,stop};
})();
