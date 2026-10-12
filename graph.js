/* Growth Atlas graph — Obsidian-inspired, data-grounded.
   Circles = study topics, daily activities, recorded dates, domains and groups.
   Edges = explicit event/topic/date/domain relationships only. No invented semantic links. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const canvas = $("atlasGraphCanvas"), viewport=$("atlasGraphViewport");
const detail=$("atlasGraphDetail"), search=$("atlasGraphSearch");
if(!canvas||!viewport||!detail||!search)return;
const ctx=canvas.getContext("2d");
if(!ctx){detail.textContent="此浏览器不支持 Canvas 图谱";return}
const categories=[
 {key:"study",label:"学习",color:"#7da8ff",angle:3.72},
 {key:"research",label:"科研",color:"#be91eb",angle:4.92},
 {key:"build",label:"工程",color:"#6ebdaa",angle:.09},
 {key:"club",label:"社团",color:"#e1b36b",angle:1.39},
 {key:"personal",label:"生活",color:"#de879f",angle:2.31}
];
const categoryMap=Object.fromEntries(categories.map(c=>[c.key,c]));
const settings={dates:true,labels:false,local:false,depth:2,nodeSize:1,repel:1,linkDist:1,activeGroup:"all"};
let graph={nodes:[],edges:[],map:new Map(),neighbors:new Map(),rawCount:0};
let selected=null,hovered=null,mouseDown=null,frameId=0,steps=0;
let width=0,height=0,zoom=1,panX=0,panY=0;
let lastSignature="",viewReady=false,needsFit=true,activePointer=null;
const prefersReduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||false;
const palette={date:"#8d97ac",note:"#aab1bd",topic:"#f6f6f8",domain:"#e5e8ed"};
function records(){try{return Array.isArray(data)?data:[]}catch(e){return []}}
const hash=str=>{let h=2166136261;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);return h>>>0};
const rnd=(id,salt)=>((hash(id+"-"+salt)%10000)/10000);
function validTopic(s){return s&&s.length>1&&s.length<=55&&!/^(其他|等等|以及|etc|研究|记录|工作)$/.test(s)}
function pieces(text){
 let s=String(text||"").replace(/\s+/g," ").trim();
 if(!s)return [];
 let xs=s.split(/[、；;，,。｜|]+|\s+[+＋]\s+/).map(v=>v.trim().replace(/^[：:\-—·•\d.)\s]+|[：:\-—·•\s]+$/g,"")).filter(validTopic);
 if(!xs.length&&s.length>1)xs=[s.slice(0,52)];
 return [...new Set(xs)].slice(0,9);
}
function categoryOf(e){return categoryMap[e.category]||categoryMap.personal}
function collect(){
 const rows=records().filter(e=>e&&e.date&&categoryMap[e.category]&&e.title);
 const ns=new Map(),es=new Map();
 const node=(id,label,type,cat,source)=>{
  if(ns.has(id)){const n=ns.get(id);if(source&&n.records.indexOf(source)<0)n.records.push(source);return n}
  const base=categoryMap[cat]||categoryMap.study;
  const phase=base.angle,radial=225;
  let radius=type==="category"?radial:type==="domain"?radial+85:type==="date"?380:type==="note"?355:375;
  let angle=phase+(rnd(id,"angle")-.5)*(type==="category"?.06:type==="domain"?.75:1.45);
  if(type==="date")angle=(rnd(id,"date-angle")*2*Math.PI);
  const px=Math.cos(angle)*radius+(rnd(id,"nx")-.5)*65;
  const py=Math.sin(angle)*radius*.72+(rnd(id,"ny")-.5)*70;
  let n={id,label,type,cat,records:source?[source]:[],x:px,y:py,vx:0,vy:0,
   ax:Math.cos(phase)*205,ay:Math.sin(phase)*150,degree:0,r:2,pinned:false};
  ns.set(id,n);return n
 };
 const link=(a,b,kind)=>{
  if(a===b||!ns.has(a)||!ns.has(b))return;
  const id=a<b?a+"~"+b:b+"~"+a;
  if(!es.has(id))es.set(id,{a,b,kind});
 };
 for(const c of categories){if(rows.some(e=>e.category===c.key))node("c:"+c.key,c.label,"category",c.key)}
 const dateMap=new Map();
 rows.forEach((e,i)=>{
   const cat=e.category,c=categoryMap[cat];
   const rid="n:"+(e.id||[e.date,cat,e.title,i].join("|"));
   const note=node(rid,String(e.title||"活动").slice(0,70),"note",cat,e);
   const group="c:"+cat;
   const categoryNode=ns.get(group);
   if(categoryNode&&!categoryNode.records.includes(e))categoryNode.records.push(e);
   let parent=group;
   if(cat==="study"){
      let domain=String(e.domain||"综合");
      try{if(typeof canonicalDomain==="function")domain=canonicalDomain(domain,e.title)}catch(x){}
      const did="d:"+domain;
      node(did,domain,"domain",cat,e);
      link(group,did,"hierarchy");
      parent=did;
   }else if(e.domain&&String(e.domain).length>=3&&String(e.domain).length<16&&!/^(科研项目|软件与工具|生活记录|项目工作|个人事务|综合)$/.test(String(e.domain))){
     let domain=String(e.domain).trim();
     const did="d:"+cat+":"+domain;
     node(did,domain,"domain",cat,e);
     link(group,did,"hierarchy");
     parent=did;
   }
   link(note.id,parent,"category");
   // Individual themes are reconstructed from titles, not generated or guessed.
   const parts=pieces(e.title);
   for(const topic of parts){
      const slug=topic.toLocaleLowerCase("zh-CN").replace(/\s+/g," ");
      if(slug===String(e.title).toLocaleLowerCase("zh-CN")&&parts.length===1){
        // A single-topic event already has its own note node. Avoid a duplicate dot.
        continue;
      }
      const id="t:"+slug;
      const topicNode=node(id,topic,"topic",cat,e);
      link(note.id,topicNode.id,"topic");
      if(topicNode.cat!==cat){topicNode.cat=topicNode.records.length>1?"shared":cat;topicNode.ax=0;topicNode.ay=0;}
   }
   if(settings.dates){
      const id="dt:"+e.date;
      const day=node(id,e.date,"date",cat,e);
      dateMap.set(e.date,day);
      link(note.id,day.id,"date");
   }
 });
 const nodes=[...ns.values()], edges=[...es.values()];
 const degree=new Map(nodes.map(n=>[n.id,0]));
 edges.forEach(e=>{degree.set(e.a,degree.get(e.a)+1);degree.set(e.b,degree.get(e.b)+1)});
 for(const n of nodes){
   n.degree=degree.get(n.id)||0;
   const base=n.type==="category"?5.8:n.type==="domain"?4.4:n.type==="date"?2.1:n.type==="note"?2.5:1.9;
   n.r=Math.min(11.5,(base+Math.sqrt(n.degree)*.55)*settings.nodeSize);
 }
 const adj=new Map(nodes.map(n=>[n.id,new Set()]));
 edges.forEach(e=>{adj.get(e.a).add(e.b);adj.get(e.b).add(e.a)});
 return {nodes,edges,map:ns,neighbors:adj,rawCount:rows.length};
}
function signature(){const rows=records();let s=rows.length+":"+settings.dates;for(const e of rows)s+="|"+e.id+"-"+e.date+"-"+e.category+"-"+e.domain+"-"+e.title;return String(hash(s))}
function sync(force=false){
 const sig=signature();
 if(!force&&sig===lastSignature)return;
 const old=graph.map;
 graph=collect();lastSignature=sig;steps=0;needsFit=true;
 for(const n of graph.nodes){
  const o=old.get(n.id);if(!o)continue;
  if(Math.abs(o.x)<2000&&Math.abs(o.y)<2000){n.x=o.x;n.y=o.y;n.pinned=o.pinned}
 }
 selected=selected?graph.map.get(selected.id)||null:null;
 hovered=null;
 updateCount();showDetail();updateChips();request();
}
function active(){return $("pane-insights")?.classList.contains("active")}
function create(tag,cls,txt){const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el}
function updateCount(){
 const n=$("atlasGraphMeta");if(n)n.textContent=graph.nodes.length+" 个节点 · "+graph.edges.length+" 条连接";
 const k=$("atlasGraphCounter");if(k)k.textContent=graph.nodes.length+" nodes / "+graph.edges.length+" links";
}
function updateChips(){
 const root=$("atlasGraphLegend");if(!root)return;
 root.replaceChildren();
 for(const g of [{key:"all",label:"全部",color:"#d9dbe4"},...categories]){
  if(g.key!=="all"&&!graph.nodes.some(n=>n.cat===g.key))continue;
  const b=create("button","atlas-graph-chip");b.type="button";
  const dot=create("i");dot.style.setProperty("--graph-category-color",g.color);dot.style.background=g.color;
  b.append(dot,document.createTextNode(g.label));
  b.setAttribute("aria-pressed",String(settings.activeGroup===g.key));
  b.addEventListener("click",()=>{settings.activeGroup=g.key;updateChips();request()});
  root.append(b);
 }
}
function showDetail(){
 const body=$("atlasGraphDetail");if(!body)return;
 body.replaceChildren();
 const t=create("div","atlas-graph-detail-title",selected?selected.label:"点击节点查看关联记录");
 const sum=create("div","atlas-graph-detail-summary",selected?
  selected.records.length+" 条相关活动 · "+new Set(selected.records.map(e=>e.date)).size+" 个记录日期 · "+typeName(selected.type):
  "一个点代表一条活动、一个知识点、日期或学科；连线来自实际记录的包含、日期与归属关系。");
 body.append(t,sum);
 if(!selected)return;
 const list=create("div","atlas-graph-detail-list");
 const unique=new Map();selected.records.forEach(e=>unique.set(e.id||e.date+"_"+e.title,e));
 [...unique.values()].sort((a,b)=>String(b.date).localeCompare(a.date)).slice(0,7).forEach(e=>{
  const button=create("button","atlas-graph-entry",e.date+" · "+String(e.title).slice(0,35));button.type="button";
  button.addEventListener("click",()=>{
   if(typeof setPane!=="function")return;
   const d=new Date(e.date+"T12:00:00");
   chosen=e.date;dateView=new Date(d.getFullYear(),d.getMonth(),1);
   setPane("calendar");document.querySelector(".section-head")?.scrollIntoView({behavior:"smooth"});
  });
  list.append(button);
 });
 body.append(list);
}
function typeName(type){return {note:"活动记录",topic:"知识点",domain:"学科或方向",category:"活动领域",date:"记录日期"}[type]||"节点"}
function neighborhood(seed,depth){
 if(!seed)return null;
 const reached=new Set([seed.id]), front=[seed.id];
 for(let d=0;d<depth;d++){
   const current=[...front];front.length=0;
   for(const id of current)for(const other of graph.neighbors.get(id)||[])if(!reached.has(other)){reached.add(other);front.push(other)}
 }
 return reached
}
function allowed(n){
 if(settings.activeGroup!=="all"&&n.cat!==settings.activeGroup&&n.type!=="date")return false;
 if(settings.local&&selected&&!neighborhood(selected,settings.depth).has(n.id))return false;
 return true
}
function visibleGraph(){
 const nodes=graph.nodes.filter(allowed),ids=new Set(nodes.map(n=>n.id));
 return {nodes,edges:graph.edges.filter(l=>ids.has(l.a)&&ids.has(l.b)),ids}
}
function focusNode(n,refit=true){
 selected=n;hovered=null;showDetail();request();
 if(refit&&n){panX=-n.x*zoom;panY=-n.y*zoom}
}
function measure(){
 if(!active())return;
 const rect=viewport.getBoundingClientRect();
 if(!rect.width||!rect.height)return;
 const prevW=width,prevH=height;width=rect.width;height=rect.height;
 const ratio=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
 canvas.style.width=width+"px";canvas.style.height=height+"px";
 if(!viewReady){viewReady=true;needsFit=true}else if(prevW&&prevH){panX*=width/prevW;panY*=height/prevH}
 request();
}
function fit(){
 let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
 graph.nodes.forEach(n=>{if(!allowed(n))return;minx=Math.min(minx,n.x);maxx=Math.max(maxx,n.x);miny=Math.min(miny,n.y);maxy=Math.max(maxy,n.y)});
 if(!isFinite(minx))return;
 const dx=Math.max(200,maxx-minx),dy=Math.max(170,maxy-miny);
 zoom=Math.max(.33,Math.min(1.65,Math.min((width-105)/dx,(height-85)/dy)));
 panX=-((minx+maxx)/2)*zoom;panY=-((miny+maxy)/2)*zoom;
 needsFit=false;
}
function physics(){
 const ns=graph.nodes,es=graph.edges;
 const size=80,grid=new Map();
 for(let i=0;i<ns.length;i++){
   const n=ns[i],cellX=Math.floor(n.x/size),cellY=Math.floor(n.y/size),id=cellX+","+cellY;
   if(!grid.has(id))grid.set(id,[]);grid.get(id).push(i);
 }
 const force=settings.repel*38;
 for(let i=0;i<ns.length;i++){
  const a=ns[i];if(a.pinned||mouseDown?.node===a)continue;
  let fx=0,fy=0,cellX=Math.floor(a.x/size),cellY=Math.floor(a.y/size);
  for(let gx=cellX-2;gx<=cellX+2;gx++)for(let gy=cellY-2;gy<=cellY+2;gy++){
   for(const j of grid.get(gx+","+gy)||[]){
    if(i===j)continue;const b=ns[j],dx=a.x-b.x,dy=a.y-b.y,dist2=dx*dx+dy*dy+20;
    const f=Math.min(.14,force/dist2);fx+=dx*f;fy+=dy*f;
   }
  }
  a.vx+=fx*.4;a.vy+=fy*.4;
  // Weak group affinity, without rigid radial rings.
  a.vx+=(a.ax-a.x)*.0018;a.vy+=(a.ay-a.y)*.0018;
 }
 for(const l of es){
   const a=graph.map.get(l.a),b=graph.map.get(l.b);
   if(!a||!b)continue;
   const dx=b.x-a.x,dy=b.y-a.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
   const rest=(l.kind==="date"?78:l.kind==="topic"?67:l.kind==="hierarchy"?118:95)*settings.linkDist;
   const k=l.kind==="topic"?.0065:.005;
   const f=Math.max(-2,Math.min(2,(dist-rest)*k));
   const xx=dx/dist*f,yy=dy/dist*f;
   if(!a.pinned&&a!==mouseDown?.node){a.vx+=xx;a.vy+=yy}
   if(!b.pinned&&b!==mouseDown?.node){b.vx-=xx;b.vy-=yy}
 }
 for(const n of ns){
  if(n.pinned||n===mouseDown?.node)continue;
  n.vx*=.77;n.vy*=.77;
  n.x=Math.max(-1500,Math.min(1500,n.x+n.vx));n.y=Math.max(-1100,Math.min(1100,n.y+n.vy));
 }
}
function paint(){
 if(!width||!height)return;
 const ratio=Math.min(window.devicePixelRatio||1,2);
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
 ctx.translate(width/2+panX,height/2+panY);ctx.scale(zoom,zoom);
 const visible=visibleGraph();
 const focus=hovered||selected;
 const neighbor=focus?neighborhood(focus,settings.local?settings.depth:1):null;
 const focusEdges=new Set();
 if(focus)for(const l of visible.edges)if(l.a===focus.id||l.b===focus.id)focusEdges.add(l);
 const baseAlpha=focus?.11:.30;
 for(const l of visible.edges){
   const a=graph.map.get(l.a),b=graph.map.get(l.b);
   const lit=focusEdges.has(l);
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
   ctx.strokeStyle=lit?"rgba(213,219,237,.94)":l.kind==="hierarchy"?"rgba(157,159,181,.18)":l.kind==="date"?"rgba(162,165,190,.11)":"rgba(157,162,184,"+baseAlpha+")";
   ctx.lineWidth=(lit?1.5:.53)/zoom;ctx.stroke();
 }
 // Very small dots are intentional; labels are revealed only for hubs and on hover.
 for(const n of visible.nodes){
   const light=!neighbor||neighbor.has(n.id),chosen=n===selected||n===hovered;
   const color=categoryMap[n.cat]?.color||palette[n.type]||palette.topic;
   ctx.globalAlpha=light?1:.10;
   ctx.beginPath();ctx.arc(n.x,n.y,(n.r+(chosen?2:0))/Math.sqrt(Math.max(.7,zoom)),0,Math.PI*2);
   ctx.fillStyle=n.type==="date"?"#89909e":color;
   if(chosen){ctx.shadowColor=color;ctx.shadowBlur=15/zoom}
   ctx.fill();ctx.shadowBlur=0;
   const showLabel=chosen||n.type==="category"||((settings.labels||zoom>1.25)&&(n.type==="domain"||n.degree>=3))||(selected&&neighbor?.has(n.id)&&zoom>.8);
   if(showLabel){
     ctx.font=(chosen||n.type==="category"?"600 ":"400 ")+(chosen?13:n.type==="category"?12:10)/zoom+"px -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif";
     ctx.textAlign="center";ctx.textBaseline="middle";
     ctx.fillStyle=light?"#eaebf3":"#656b7a";
     ctx.shadowColor="#1d1e26";ctx.shadowBlur=5/zoom;
     ctx.fillText(n.label,n.x,n.y+(n.r+12)/Math.max(.7,zoom));ctx.shadowBlur=0;
   }
 }
 ctx.globalAlpha=1;
}
function renderFrame(){
 frameId=0;if(!active())return;
 if(!prefersReduced&&steps<240&&!mouseDown?.moving){physics();steps++}
 if(needsFit&&steps>=18)fit();
 paint();
 if((!prefersReduced&&steps<240)||mouseDown?.moving)request();
}
function request(){if(active()&&!frameId)frameId=requestAnimationFrame(renderFrame)}
function point(e){
 const rect=canvas.getBoundingClientRect();
 return {x:(e.clientX-rect.left-width/2-panX)/zoom,y:(e.clientY-rect.top-height/2-panY)/zoom};
}
function hit(e){
 const p=point(e),visible=graph.nodes.filter(allowed);
 for(let i=visible.length-1;i>=0;i--){
  const n=visible[i],dx=n.x-p.x,dy=n.y-p.y;
  if(dx*dx+dy*dy<Math.pow(Math.max(10/zoom,n.r+5/zoom),2))return n
 }
 return null
}
function select(n){selected=n;hovered=null;showDetail();request()}
canvas.addEventListener("pointerdown",e=>{
 if(!active())return;
 activePointer=e.pointerId;
 const node=hit(e);
 mouseDown={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,node,moving:false};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
 if(mouseDown&&activePointer===e.pointerId){
   const dx=e.clientX-mouseDown.lastX,dy=e.clientY-mouseDown.lastY;
   if(Math.hypot(e.clientX-mouseDown.x,e.clientY-mouseDown.y)>4)mouseDown.moving=true;
   if(mouseDown.moving){
      if(mouseDown.node){mouseDown.node.x+=dx/zoom;mouseDown.node.y+=dy/zoom;mouseDown.node.pinned=true}
      else{panX+=dx;panY+=dy}
      steps=Math.max(steps,150);request();
   }
   mouseDown.lastX=e.clientX;mouseDown.lastY=e.clientY;
 }else{
   const n=hit(e);
   if(n!==hovered){hovered=n;canvas.style.cursor=n?"pointer":"grab";request();
     const tip=$("atlasGraphTooltip");
     if(tip){tip.hidden=!n;if(n){tip.textContent=n.label+" · "+n.records.length+" 条记录";const r=viewport.getBoundingClientRect();tip.style.left=Math.min(width-130,Math.max(5,e.clientX-r.left+12))+"px";tip.style.top=Math.max(4,e.clientY-r.top-31)+"px"}}
   }
 }
});
canvas.addEventListener("pointerup",e=>{
 if(!mouseDown||activePointer!==e.pointerId)return;
 if(!mouseDown.moving)select(mouseDown.node);
 mouseDown=null;activePointer=null;request();
});
canvas.addEventListener("pointercancel",()=>{mouseDown=null;activePointer=null;request()});
canvas.addEventListener("pointerleave",()=>{if(!mouseDown){hovered=null;const t=$("atlasGraphTooltip");if(t)t.hidden=true;request()}});
canvas.addEventListener("wheel",e=>{
 if(!active())return;
 e.preventDefault();
 const rect=canvas.getBoundingClientRect(),px=e.clientX-rect.left-width/2,py=e.clientY-rect.top-height/2;
 const z=zoom;zoom=Math.max(.25,Math.min(3.4,zoom*Math.exp(-e.deltaY*.001)));
 panX=px-(px-panX)*zoom/z;panY=py-(py-panY)*zoom/z;needsFit=false;request();
},{passive:false});
function zoomBy(f){zoom=Math.max(.25,Math.min(3.4,zoom*f));needsFit=false;request()}
$("atlasGraphZoomIn")?.addEventListener("click",()=>zoomBy(1.22));
$("atlasGraphZoomOut")?.addEventListener("click",()=>zoomBy(.82));
$("atlasGraphReset")?.addEventListener("click",()=>{
 settings.activeGroup="all";settings.local=false;selected=null;hovered=null;
 graph.nodes.forEach(n=>n.pinned=false);
 needsFit=true;steps=240;updateChips();showDetail();updateControls();request();
});
$("atlasGraphFit")?.addEventListener("click",()=>{needsFit=true;steps=240;request()});
search.addEventListener("input",()=>{
 const q=search.value.toLocaleLowerCase("zh-CN").trim();
 const match=q?graph.nodes.find(n=>n.label.toLocaleLowerCase("zh-CN").includes(q)):null;
 if(match){selected=match;settings.activeGroup="all";updateChips();panX=-match.x*zoom;panY=-match.y*zoom;needsFit=false}
 if(!q)selected=null;
 showDetail();request()
});
search.addEventListener("keydown",e=>{if(e.key==="Escape"){search.value="";selected=null;showDetail();request()}});
function updateControls(){
 const local=$("atlasGraphLocalToggle"),dates=$("atlasGraphDatesToggle"),labels=$("atlasGraphLabelsToggle"),depth=$("atlasGraphDepth");
 if(local)local.checked=settings.local;
 if(dates)dates.checked=settings.dates;
 if(labels)labels.checked=settings.labels;
 if(depth){depth.value=String(settings.depth);depth.disabled=!settings.local}
 for(const [id,key] of [["atlasGraphRepel","repel"],["atlasGraphDistance","linkDist"],["atlasGraphNodeSize","nodeSize"]])if($(id))$(id).value=String(settings[key]);
 const mode=$("atlasGraphMode");if(mode)mode.textContent=settings.local?"局部图谱":"全局图谱";
}
$("atlasGraphSettings")?.addEventListener("click",()=>{
 const panel=$("atlasGraphOptions");if(panel){panel.hidden=!panel.hidden;$("atlasGraphSettings").setAttribute("aria-expanded",String(!panel.hidden))}
});
$("atlasGraphLocalToggle")?.addEventListener("change",e=>{settings.local=e.target.checked;if(settings.local&&!selected)selected=graph.nodes.find(n=>n.type==="domain")||graph.nodes[0]||null;needsFit=true;steps=240;updateControls();showDetail();request()});
$("atlasGraphDatesToggle")?.addEventListener("change",e=>{settings.dates=e.target.checked;sync(true);steps=240;needsFit=true;request()});
$("atlasGraphLabelsToggle")?.addEventListener("change",e=>{settings.labels=e.target.checked;request()});
$("atlasGraphDepth")?.addEventListener("input",e=>{settings.depth=Number(e.target.value);needsFit=true;request()});
for(const [id,key,min,max] of [["atlasGraphRepel","repel",.3,2.6],["atlasGraphDistance","linkDist",.4,2.2],["atlasGraphNodeSize","nodeSize",.5,2.1]]){
 $(id)?.addEventListener("input",e=>{
  settings[key]=Math.max(min,Math.min(max,Number(e.target.value)||1));
  if(key==="nodeSize")graph.nodes.forEach(n=>{n.r=(n.r/(Number(n.lastSize)||1))*settings.nodeSize;n.lastSize=settings.nodeSize});
  else steps=0;
  request();
 })
}
document.addEventListener("keydown",e=>{if(!active()||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
 if(e.key==="+")zoomBy(1.2);else if(e.key==="-")zoomBy(.84);
 else if(e.key==="Escape"){selected=null;settings.local=false;updateControls();showDetail();request()}
});
if("ResizeObserver" in window)new ResizeObserver(()=>{if(active())measure()}).observe(viewport);
window.addEventListener("resize",()=>{if(active())measure()});
window.AtlasGraph={
 activate(){sync();measure();if(!prefersReduced&&steps===0)request();else{steps=240;request()}},
 refresh(){sync()}
};
sync(true);
updateControls();
if(active())window.AtlasGraph.activate();
})();