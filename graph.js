/* Growth Atlas: live, interactive knowledge graph. No third-party dependencies. */
(function(){
"use strict";
const canvas=document.getElementById("atlasGraphCanvas");
const viewport=document.getElementById("atlasGraphViewport");
const info=document.getElementById("atlasGraphDetail");
const input=document.getElementById("atlasGraphSearch");
const legend=document.getElementById("atlasGraphLegend");
if(!canvas||!viewport||!info||!input||!legend)return;
const ctx=canvas.getContext("2d");
if(!ctx){info.textContent="当前浏览器不支持 Canvas 图谱";return}
const COLORS={center:"#e5edff",study:"#85afff",research:"#c6a1f3",build:"#69cfb7",club:"#f3c67e",personal:"#f0a4c1"};
const CLUSTERS=[
 {key:"study",label:"学习",ax:-235,ay:-150},
 {key:"research",label:"科研",ax:82,ay:-205},
 {key:"build",label:"项目",ax:255,ay:-12},
 {key:"club",label:"社团",ax:145,ay:225},
 {key:"personal",label:"生活",ax:-220,ay:178}
];
const THEMES={
 research:[
 ["演化计算研究",/演化|hyper.?heuristic|onemax|leadingones|\\brls\\b/i],
 ["APAC26",/apac.?26|qwen3|\\bh200\\b/i],
 ["论文阅读",/论文|文献|paper|journal|research talk/i],
 ["导师联系",/oliveto|导师|课题组|组会|教授/i],
 ["AI 模型研究",/qwen|\\bllm\\b|大模型|人工智能模型/i]
 ],
 build:[
 ["Codex 工程",/codex|代码智能体/i],
 ["Growth Atlas",/growth atlas|成长日历|成长图谱/i],
 ["DDL Reminder",/ddl|deadline|提醒工具|桌面挂件/i],
 ["AI Agent",/agent|subagent|mcp|skill/i],
 ["GitHub",/github|部署|网页|静态网站/i]
 ],
 club:[
 ["天文社",/天文社|astronomy|社团/i],
 ["JWST 明信片",/jwst|明信片/i],
 ["社旗设计",/社旗|旗帜|logo|社徽/i],
 ["望远镜与观测",/望远镜|观测|日珥|器材/i],
 ["社团网站",/公众号|社团网站|社团邮箱|校内邮箱/i]
 ],
 personal:[
 ["时间管理",/时间管理|ddl|截止|规划|待办|任务/i],
 ["健康与作息",/睡眠|健康|咖啡|压力|焦虑|流感|感冒/i],
 ["香港徒步",/香港|徒步|麦理浩|行山|东坝/i],
 ["留学规划",/gre|ielts|toefl|留学|申请季|奖学金/i],
 ["人际关系",/朋友|人际|亲密|社交|友谊/i]
 ]
};
const CROSS=[
 ["AI/HPC","APAC26"],["AI/HPC","AI 模型研究"],["演化计算","演化计算研究"],
 ["科研写作","论文阅读"],["科研写作","导师联系"],["AI Agent 与工具","AI Agent"],
 ["AI Agent 与工具","Codex 工程"],["系统工程","GitHub"],
 ["天文社","望远镜与观测"],["天文社","JWST 明信片"],
 ["时间管理","DDL Reminder"],["Growth Atlas","时间管理"]
];
let nodes=[],links=[],lookup=new Map(),selected=null,hovered=null,drag=null;
let width=0,height=0,scale=1,panX=0,panY=0,raf=0,ticks=0,showing=false;
const media=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)");
const reduced=!!(media&&media.matches);
const nodeId=(cat,label)=>cat+"|"+label;
function records(){try{return typeof data!=="undefined"&&Array.isArray(data)?data:[]}catch(e){return []}}
function textOf(e){return [e.title||"",e.domain||"",e.detail||""].join(" ")}
function countNode(id,label,category,kind,recordsList,ax,ay){
 const n={id,label,category,kind,records:recordsList,count:recordsList.length,x:ax,y:ay,ax,ay,vx:0,vy:0,manual:false,
 r:kind==="root"?15:kind==="category"?10:Math.max(4.2,Math.min(7.1,4.6+Math.log2(recordsList.length+1)*.65))};
 nodes.push(n);lookup.set(id,n);return n
}
function addLink(a,b,kind){
 if(!lookup.has(a)||!lookup.has(b))return;
 if(links.some(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a)))return;
 links.push({a,b,kind:kind||"tree"});
}
function build(){
 const prev=lookup;
 const prevSelected=selected?selected.id:null;
 nodes=[];links=[];lookup=new Map();
 const items=records().filter(e=>e&&e.category&&e.date);
 countNode("root","个人成长",null,"root",items,0,0);
 for(const cluster of CLUSTERS){
   const list=items.filter(e=>e.category===cluster.key);
   if(!list.length)continue;
   const catId="cat:"+cluster.key;
   countNode(catId,cluster.label,cluster.key,"category",list,cluster.ax,cluster.ay);
   addLink("root",catId);
   const leaves=[];
   if(cluster.key==="study"){
     const groups=new Map();
     for(const e of list){
       let name=String(e.domain||"综合");
       try{if(typeof canonicalDomain==="function")name=canonicalDomain(name,e.title||"")}catch(ex){}
       if(!groups.has(name))groups.set(name,[]);
       groups.get(name).push(e);
     }
     Array.from(groups.entries()).sort((a,b)=>b[1].length-a[1].length).slice(0,13).forEach(([label,matching])=>leaves.push({label,list:matching}));
   }else{
     for(const item of THEMES[cluster.key]){
       const matching=list.filter(e=>item[1].test(textOf(e)));
       if(matching.length)leaves.push({label:item[0],list:matching});
     }
     const used=new Set(leaves.flatMap(t=>t.list));
     const ungrouped=list.filter(e=>!used.has(e));
     if(ungrouped.length && leaves.length<4){
       const byDomain=new Map();
       for(const e of ungrouped){
         const domain=String(e.domain||"").trim();
         if(!domain||["综合","项目工作","其他","个人事务"].includes(domain)||domain.length>15)continue;
         if(!byDomain.has(domain))byDomain.set(domain,[]);
         byDomain.get(domain).push(e);
       }
       Array.from(byDomain.entries()).sort((a,b)=>b[1].length-a[1].length).slice(0,4-leaves.length).forEach(([label,matching])=>leaves.push({label,list:matching}));
     }
   }
   const centerAngle=Math.atan2(cluster.ay,cluster.ax);
   leaves.forEach((leaf,i)=>{
     const spread=leaves.length<=1?0:(i/(leaves.length-1)-.5)*2.85;
     const angle=centerAngle+spread;
     const distance=125+(i%3)*24;
     const ax=cluster.ax+Math.cos(angle)*distance;
     const ay=cluster.ay+Math.sin(angle)*distance;
     const id=nodeId(cluster.key,leaf.label);
     const node=countNode(id,leaf.label,cluster.key,"leaf",leaf.list,ax,ay);
     const before=prev.get(id);
     if(before){node.x=before.x;node.y=before.y;node.manual=before.manual}
     addLink(catId,id);
   });
 }
 for(const pair of CROSS){
   const found=nodes.filter(n=>n.kind==="leaf"&&n.label===pair[0]);
   const targets=nodes.filter(n=>n.kind==="leaf"&&n.label===pair[1]);
   if(found[0]&&targets[0])addLink(found[0].id,targets[0].id,"cross");
 }
 const ext=prev.get("root");if(ext){const root=lookup.get("root");root.x=0;root.y=0}
 selected=prevSelected?lookup.get(prevSelected)||null:null;
 hovered=null;ticks=0;
 showDetail();
 updateLegend();
}
function updateLegend(){
 legend.replaceChildren();
 const showAll=document.createElement("button");
 showAll.type="button";showAll.className="atlas-graph-chip";showAll.textContent="全部连接";
 showAll.setAttribute("aria-pressed",String(!selected));
 showAll.addEventListener("click",()=>choose(null,true));
 legend.append(showAll);
 for(const cat of CLUSTERS){
   if(!lookup.has("cat:"+cat.key))continue;
   const btn=document.createElement("button");
   btn.type="button";btn.className="atlas-graph-chip";
   btn.style.setProperty("--graph-category-color",COLORS[cat.key]);
   btn.setAttribute("aria-pressed",String(selected?.id==="cat:"+cat.key));
   const dot=document.createElement("i");dot.setAttribute("aria-hidden","true");
   btn.append(dot,document.createTextNode(cat.label));
   btn.addEventListener("click",()=>choose(lookup.get("cat:"+cat.key),true));
   legend.append(btn);
 }
}
function showDetail(){
 info.replaceChildren();
 const box=document.createElement("div");
 const heading=document.createElement("div");heading.className="atlas-graph-detail-title";
 const body=document.createElement("div");body.className="atlas-graph-detail-summary";
 if(!selected){
   heading.textContent="探索你的知识网络";
   body.textContent="点击节点查看相关活动；点选不同分类，可以追踪学科、科研、工程、社团和生活之间的联系。";
 }else{
   heading.textContent=selected.label;
   const uniqueDates=new Set(selected.records.map(e=>e.date)).size;
   body.textContent=selected.count+" 条相关记录 · "+uniqueDates+" 个记录日期";
 }
 box.append(heading,body);
 if(selected&&selected.records.length){
   const group=document.createElement("div");group.className="atlas-graph-detail-list";
   const latest=[...selected.records].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4);
   for(const e of latest){
     const btn=document.createElement("button");btn.type="button";
     btn.className="atlas-graph-entry";
     btn.textContent=e.date+" · "+String(e.title||"未命名").slice(0,24);
     btn.title="跳转到该日期";
     btn.addEventListener("click",()=>{
       try{
         if(typeof chosen!=="undefined"&&typeof dateView!=="undefined"&&typeof setPane==="function"){
           chosen=e.date;
           const d=new Date(e.date+"T12:00:00");
           dateView=new Date(d.getFullYear(),d.getMonth(),1);
           setPane("calendar");
           document.querySelector(".section-head")?.scrollIntoView({behavior:"smooth",block:"start"});
         }
       }catch(ex){}
     });
     group.append(btn);
   }
   box.append(group);
 }
 info.append(box);
}
function choose(node,centerIt){
 selected=node||null;hovered=null;updateLegend();showDetail();
 if(node&&centerIt){
   panX=-node.x*scale;panY=-node.y*scale;
 }
 request();
}
function graphVisible(){return document.getElementById("pane-insights")?.classList.contains("active")}
function measure(){
 const rect=viewport.getBoundingClientRect();
 if(!rect.width||!rect.height)return;
 const newW=rect.width,newH=rect.height;
 if(!width||!height){
   scale=Math.min(1.1,Math.max(.58,Math.min(newW/920,newH/610)));
   if(newW<500)scale=.68;
 }else if(Math.abs(width-newW)>3){
   panX*=newW/width;panY*=newH/height;
 }
 width=newW;height=newH;
 const dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(width*dpr);
 canvas.height=Math.round(height*dpr);
 canvas.style.width=width+"px";canvas.style.height=height+"px";
 request();
}
function request(){
 if(!graphVisible()||raf)return;
 showing=true;
 raf=window.requestAnimationFrame(frame);
}
function physics(){
 const interaction=!!drag;
 for(const n of nodes){
   if(n.kind==="root"||n.manual||(interaction&&drag?.node===n))continue;
   n.vx+=(n.ax-n.x)*.018;
   n.vy+=(n.ay-n.y)*.018;
 }
 for(let i=0;i<nodes.length;i++){
  const a=nodes[i];
  for(let j=i+1;j<nodes.length;j++){
   const b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,dd=Math.max(28,Math.sqrt(dx*dx+dy*dy));
   const strength=Math.min(.8,950/(dd*dd));
   const fx=dx/dd*strength,fy=dy/dd*strength;
   if(a.kind!=="root"&&!a.manual){a.vx+=fx;a.vy+=fy}
   if(b.kind!=="root"&&!b.manual){b.vx-=fx;b.vy-=fy}
  }
 }
 for(const link of links){
   if(link.kind!=="tree")continue;
   const a=lookup.get(link.a),b=lookup.get(link.b);
   if(!a||!b)continue;
   const dx=b.x-a.x,dy=b.y-a.y;
   const dist=Math.max(1,Math.sqrt(dx*dx+dy*dy));
   const wanted=a.kind==="root"?218:137;
   const pull=(dist-wanted)*.0085;
   const fx=dx/dist*pull,fy=dy/dist*pull;
   if(a.kind!=="root"&&!a.manual){a.vx+=fx*.35;a.vy+=fy*.35}
   if(b.kind!=="root"&&!b.manual){b.vx-=fx;b.vy-=fy}
 }
 for(const n of nodes){
   if(n.kind==="root"||n.manual||(drag&&drag.node===n))continue;
   n.vx*=.76;n.vy*=.76;
   n.x+=n.vx;n.y+=n.vy;
 }
}
function adjacent(active){
 const ids=new Set([active.id]);
 for(const l of links){if(l.a===active.id)ids.add(l.b);if(l.b===active.id)ids.add(l.a)}
 return ids
}
function paint(){
 if(!width||!height)return;
 const dpr=Math.min(2,window.devicePixelRatio||1);
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,width,height);
 ctx.translate(width/2+panX,height/2+panY);ctx.scale(scale,scale);
 const focus=hovered||selected,visible=focus?adjacent(focus):null;
 ctx.save();
 for(const link of links){
  const a=lookup.get(link.a),b=lookup.get(link.b);
  if(!a||!b)continue;
  const important=visible&&(visible.has(a.id)&&visible.has(b.id))&&(focus.id===a.id||focus.id===b.id);
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  ctx.strokeStyle=important?"rgba(171,200,255,.88)":link.kind==="cross"?"rgba(154,163,198,.17)":"rgba(142,158,198,.25)";
  ctx.lineWidth=important?1.65:link.kind==="cross"?.65:.9;
  ctx.stroke();
 }
 ctx.restore();
 for(const n of nodes){
   const lit=!visible||visible.has(n.id);
   const isHot=focus&&focus.id===n.id;
   const color=COLORS[n.category||"center"];
   ctx.save();
   ctx.globalAlpha=lit?1:.16;
   ctx.shadowColor=color;ctx.shadowBlur=lit?(isHot?26:13):0;
   ctx.beginPath();ctx.arc(n.x,n.y,n.r+(isHot?2.6:0),0,Math.PI*2);
   ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;
   if(n.kind==="root"||n.kind==="category"){
    ctx.beginPath();ctx.arc(n.x,n.y,n.r+7,0,2*Math.PI);
    ctx.strokeStyle=color;ctx.globalAlpha=(lit?.24:.06);ctx.lineWidth=1;ctx.stroke();
    ctx.globalAlpha=lit?1:.16;
   }
   const fontSize=n.kind==="root"?19:n.kind==="category"?16:12;
   ctx.font=(n.kind==="leaf"?"400 ":"600 ")+fontSize+'px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
   ctx.textAlign="center";ctx.textBaseline="middle";
   ctx.fillStyle=n.kind==="root"?"#fff":lit?"#e8edfa":"#b1b7c9";
   ctx.shadowColor="#111521";ctx.shadowBlur=6;
   ctx.fillText(n.label,n.x,n.y+n.r+(n.kind==="leaf"?14:19));
   ctx.restore();
 }
}
function frame(){
 raf=0;
 if(!graphVisible()){showing=false;return}
 if(!reduced&&!drag&&ticks<155){physics();ticks++}
 paint();
 if((!reduced&&ticks<155)||drag)request();else showing=false;
}
function toWorld(clientX,clientY){
 const r=canvas.getBoundingClientRect();
 return {x:(clientX-r.left-width/2-panX)/scale,y:(clientY-r.top-height/2-panY)/scale};
}
function hit(point){
 for(let i=nodes.length-1;i>=0;i--){
  const n=nodes[i],dx=n.x-point.x,dy=n.y-point.y;
  if(dx*dx+dy*dy<Math.pow(Math.max(13,n.r+8),2))return n;
 }
 return null;
}
canvas.addEventListener("pointerdown",e=>{
 if(!graphVisible())return;
 const node=hit(toWorld(e.clientX,e.clientY));
 drag={node,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
 if(!graphVisible())return;
 const point=toWorld(e.clientX,e.clientY);
 if(drag){
   const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;
   if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;
   if(drag.moved){
     if(drag.node&&drag.node.kind!=="root"){
       drag.node.x+=dx/scale;drag.node.y+=dy/scale;
       drag.node.manual=true;
     }else{panX+=dx;panY+=dy}
     request();
   }
   drag.lastX=e.clientX;drag.lastY=e.clientY;return;
 }
 const node=hit(point);
 if(node!==hovered){hovered=node;canvas.style.cursor=node?"pointer":"grab";request()}
});
canvas.addEventListener("pointerup",e=>{
 if(!drag)return;
 if(!drag.moved)choose(drag.node,true);
 drag=null;request();
});
canvas.addEventListener("pointercancel",()=>{drag=null;request()});
canvas.addEventListener("pointerleave",()=>{if(!drag){hovered=null;request()}});
canvas.addEventListener("wheel",e=>{
 if(!graphVisible())return;
 e.preventDefault();
 const r=canvas.getBoundingClientRect();
 const x=e.clientX-r.left-width/2,y=e.clientY-r.top-height/2;
 const old=scale;
 scale=Math.max(.35,Math.min(2.4,scale*Math.exp(-e.deltaY*.0012)));
 panX=x-(x-panX)*(scale/old);
 panY=y-(y-panY)*(scale/old);
 request()
},{passive:false});
function reset(){
 nodes.forEach(n=>{n.manual=false;n.x=n.ax;n.y=n.ay;n.vx=0;n.vy=0});
 panX=0;panY=0;scale=Math.min(1.1,Math.max(.58,Math.min(width/920,height/610)));
 if(width<500)scale=.68;
 selected=null;hovered=null;ticks=0;
 updateLegend();showDetail();request();
}
document.getElementById("atlasGraphZoomIn")?.addEventListener("click",()=>{scale=Math.min(2.4,scale*1.2);request()});
document.getElementById("atlasGraphZoomOut")?.addEventListener("click",()=>{scale=Math.max(.35,scale/1.2);request()});
document.getElementById("atlasGraphReset")?.addEventListener("click",reset);
input.addEventListener("input",()=>{
 const q=input.value.trim().toLowerCase();
 if(!q){selected=null;hovered=null;showDetail();updateLegend();request();return}
 const match=nodes.find(n=>n.label.toLowerCase().includes(q));
 if(match)choose(match,false);
});
input.addEventListener("keydown",e=>{if(e.key==="Escape"){input.value="";choose(null,false)}});
if("ResizeObserver" in window)new ResizeObserver(()=>{if(graphVisible())measure()}).observe(viewport);
window.addEventListener("resize",()=>{if(graphVisible())measure()});
window.AtlasGraph={
 activate(){measure();ticks=0;request()},
 refresh(){build();if(graphVisible())measure()}
};
build();
if(graphVisible())window.AtlasGraph.activate();
})();
