/**
 * Finds the minimum edge-crossing layout for the core graph,
 * subject to ZERO node overlaps.
 *
 * Steps:
 *   1. Build a clean starting layout (0 overlaps) by placing multi-party
 *      donors at their weighted party centroids + resolving overlaps.
 *   2. Run random-restart greedy search: for each candidate position of
 *      each core donor, ONLY accept it if it introduces 0 new node overlaps
 *      AND reduces total edge crossings.
 *   3. Repeat restarts until a 0-crossing, 0-overlap solution is found or
 *      the time budget is exhausted.
 *
 * Run: node scripts/exact_layout.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fundingData from '../src/data/funding.json' with { type: 'json' };
import { buildGraphFromFundingData, centerLayoutPositions } from '../src/lib/networkGraphBuild.js';
import {
  countLayoutOverlaps, donorRadius, partyHalfSize,
  resolveBodyOverlaps, separateCircleCircle, separateCircleRect, separateRectRect,
} from '../src/lib/networkGraphLayoutUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAYOUT_PATH  = join(__dirname, '../src/data/network-layout.json');
const CURATED_PATH = join(__dirname, '../src/data/network-layout-curated.json');
const RESTART_BUDGET = 2000;
const TIMEOUT_MS = 600_000;

// ── geometry ──────────────────────────────────────────────────────────────────
function cross2d(ox,oy,ax,ay,bx,by){return(ax-ox)*(by-oy)-(ay-oy)*(bx-ox);}
function segIntersects(ax,ay,bx,by,cx,cy,dx,dy){
  const d1=cross2d(cx,cy,dx,dy,ax,ay),d2=cross2d(cx,cy,dx,dy,bx,by);
  const d3=cross2d(ax,ay,bx,by,cx,cy),d4=cross2d(ax,ay,bx,by,dx,dy);
  return(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0)));
}

// ── graph ─────────────────────────────────────────────────────────────────────
const graph = buildGraphFromFundingData(fundingData.combined);
const { graphLinks, nodeById } = graph;
const savedLayout = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));
const nodeDataById = new Map(graph.cyElements.filter(el=>el.group==='nodes').map(el=>[el.data.id,el.data]));

const partyPositions = {};
nodeById.forEach(n => {
  if (n.type==='party' && savedLayout.positions[n.name])
    partyPositions[n.name] = savedLayout.positions[n.name];
});

// ── core graph (same derivation as before) ────────────────────────────────────
const degree = new Map();
nodeById.forEach((_,id)=>degree.set(id,0));
for(const l of graphLinks){degree.set(l.source,(degree.get(l.source)||0)+1);degree.set(l.target,(degree.get(l.target)||0)+1);}
const deg2=new Set([...degree.entries()].filter(([,d])=>d>=2).map(([id])=>id));
const adj=new Map();deg2.forEach(id=>adj.set(id,[]));
for(const l of graphLinks) if(deg2.has(l.source)&&deg2.has(l.target)){adj.get(l.source).push(l.target);adj.get(l.target).push(l.source);}
const vis=new Set();const comps=[];
for(const start of deg2){if(vis.has(start))continue;const c=[],s=[start];while(s.length){const n=s.pop();if(vis.has(n))continue;vis.add(n);c.push(n);for(const nb of adj.get(n))if(!vis.has(nb))s.push(nb);}comps.push(c);}
comps.sort((a,b)=>b.length-a.length);
const mainComp=new Set(comps[0]);

const segsByDonor=new Map();
for(const l of graphLinks){
  if(!mainComp.has(l.source)||!mainComp.has(l.target)) continue;
  const src=nodeById.get(l.source),tgt=nodeById.get(l.target);
  if(!src||!tgt) continue;
  const [donor,party]=src.type==='donor'?[src,tgt]:[tgt,src];
  if(donor.type!=='donor'||party.type!=='party') continue;
  const pp=partyPositions[party.name]; if(!pp) continue;
  if(!segsByDonor.has(donor.name)) segsByDonor.set(donor.name,[]);
  segsByDonor.get(donor.name).push({p:party.name,px:pp.x,py:pp.y});
}
for(const [d,segs] of segsByDonor) if(segs.length<2) segsByDonor.delete(d);
const coreDonors=[...segsByDonor.keys()];
coreDonors.sort((a,b)=>segsByDonor.get(b).length-segsByDonor.get(a).length);
console.log(`Core: ${coreDonors.length} donors, ${[...segsByDonor.values()].flat().length} edges`);

// ── node body helpers ─────────────────────────────────────────────────────────
function makeBody(node, id, p) {
  const data = nodeDataById.get(String(id));
  if (node.type==='party') {
    const {hw,hh}=partyHalfSize(data); return {id,name:node.name,type:'party',x:p.x,y:p.y,hw,hh,w:hw*2,h:hh*2};
  }
  const r=donorRadius(data); return {id,name:node.name,type:'donor',x:p.x,y:p.y,r,hw:r,hh:r,w:r*2,h:r*2};
}
function makeBodies(pos) {
  const b=[];
  nodeById.forEach((node,id)=>{const p=pos[node.name];if(p) b.push(makeBody(node,id,p));});
  return b;
}

// Check if placing donor `dname` at (x,y) overlaps any node in `bodies`
// (bodies already has the donor at its old position — we check as if it moved)
function overlapsAt(dname, x, y, bodies) {
  const id=[...nodeById.entries()].find(([,n])=>n.name===dname)?.[0];
  if(id==null) return false;
  const data=nodeDataById.get(String(id));
  const r=donorRadius(data);
  for(const b of bodies){
    if(b.name===dname) continue;
    if(b.type==='donor'){if(separateCircleCircle(x,y,r,b.x,b.y,b.r)) return true;}
    else {if(separateCircleRect(x,y,r,b.x,b.y,b.w,b.h)) return true;}
  }
  return false;
}

// ── crossing counters ─────────────────────────────────────────────────────────
function buildAllSegs(pos) {
  const s=[];
  for(const l of graphLinks){
    const src=nodeById.get(l.source),tgt=nodeById.get(l.target);
    if(!src||!tgt||src.type!=='donor'||tgt.type!=='party') continue;
    const dp=pos[src.name],pp=pos[tgt.name]; if(!dp||!pp) continue;
    s.push({dx:dp.x,dy:dp.y,px:pp.x,py:pp.y,d:src.name,p:tgt.name});
  }
  return s;
}
function countCrossings(segs){
  let n=0;
  for(let i=0;i<segs.length;i++) for(let j=i+1;j<segs.length;j++){
    const a=segs[i],b=segs[j];if(a.d===b.d||a.p===b.p) continue;
    if(segIntersects(a.dx,a.dy,a.px,a.py,b.dx,b.dy,b.px,b.py)) n++;
  }
  return n;
}
function crossingsForDonor(dname, x, y, allSegs) {
  const mine=allSegs.filter(s=>s.d===dname).map(s=>({...s,dx:x,dy:y}));
  let n=0;
  for(const ms of mine) for(const other of allSegs){
    if(other.d===dname||ms.p===other.p) continue;
    if(segIntersects(ms.dx,ms.dy,ms.px,ms.py,other.dx,other.dy,other.px,other.py)) n++;
  }
  return n;
}

// ── candidate positions ───────────────────────────────────────────────────────
const partyPts=Object.values(partyPositions);
const [pMinX,pMaxX]=[Math.min(...partyPts.map(p=>p.x))-120, Math.max(...partyPts.map(p=>p.x))+120];
const [pMinY,pMaxY]=[Math.min(...partyPts.map(p=>p.y))-120, Math.max(...partyPts.map(p=>p.y))+120];
const GRID=60;
const gridPts=[];
for(let gx=0;gx<=GRID;gx++) for(let gy=0;gy<=GRID;gy++)
  gridPts.push({x:pMinX+(pMaxX-pMinX)*gx/GRID,y:pMinY+(pMaxY-pMinY)*gy/GRID});

function smartPts(dname){
  const segs=segsByDonor.get(dname)||[];
  const pts=segs.map(s=>({x:s.px,y:s.py}));
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length, cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const extras=[{x:cx,y:cy}];
  for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++)
    for(let t=0.1;t<=0.9;t+=0.1) extras.push({x:pts[i].x*(1-t)+pts[j].x*t,y:pts[i].y*(1-t)+pts[j].y*t});
  for(const dx of [-180,-120,-70,70,120,180]) for(const dy of [-180,-120,-70,70,120,180]) extras.push({x:cx+dx,y:cy+dy});
  return extras;
}
const allCandidates=Object.fromEntries(coreDonors.map(d=>{
  const seen=new Set();const pts=[];
  for(const p of [...smartPts(d),...gridPts]){const k=`${Math.round(p.x/8)},${Math.round(p.y/8)}`;if(!seen.has(k)){seen.add(k);pts.push(p);}}
  return [d,pts];
}));

// ── build clean starting layout (0 node overlaps) ─────────────────────────────
// Place multi-party donors at weighted centroid of their connected parties,
// then run overlap resolution.
function buildCleanStart() {
  const pos = {...savedLayout.positions};

  // Place core donors at their weighted centroid (by link value)
  const donorWeights = new Map();
  for(const l of graphLinks){
    const src=nodeById.get(l.source),tgt=nodeById.get(l.target);
    if(!src||!tgt||src.type!=='donor'||tgt.type!=='party') continue;
    if(!coreDonors.includes(src.name)) continue;
    if(!donorWeights.has(src.name)) donorWeights.set(src.name,[]);
    donorWeights.get(src.name).push({party:tgt.name,value:l.value});
  }
  for(const d of coreDonors){
    const entries=donorWeights.get(d)||[];
    if(!entries.length) continue;
    let wx=0,wy=0,wsum=0;
    for(const {party,value} of entries){
      const p=partyPositions[party]; if(!p) continue;
      const w=Math.log1p(value); wx+=p.x*w; wy+=p.y*w; wsum+=w;
    }
    if(wsum) pos[d]={x:wx/wsum,y:wy/wsum};
  }

  // Resolve all node overlaps with parties pinned
  const bodies=makeBodies(pos);
  const pinned=new Set(bodies.filter(b=>b.type==='party').map(b=>b.id));
  for(let i=0;i<500;i++){
    resolveBodyOverlaps(bodies,4,pinned);
    for(const b of bodies) if(b.type==='party'){const p=pos[b.name];b.x=p.x;b.y=p.y;}
    if(countLayoutOverlaps(bodies)===0) break;
  }
  for(const b of bodies) pos[b.name]={x:b.x,y:b.y};
  return pos;
}

// ── greedy pass (only moves that maintain 0 overlaps) ─────────────────────────
function greedyPass(pos) {
  const allSegs=buildAllSegs(pos);
  coreDonors.sort((a,b)=>crossingsForDonor(b,pos[b]?.x,pos[b]?.y,allSegs)-crossingsForDonor(a,pos[a]?.x,pos[a]?.y,allSegs));

  for(const d of coreDonors){
    const curSegs=buildAllSegs(pos);
    if(crossingsForDonor(d,pos[d]?.x,pos[d]?.y,curSegs)===0) continue;

    const bodies=makeBodies(pos); // snapshot for overlap checking
    const baseline=countCrossings(curSegs);
    let bx=pos[d].x,by=pos[d].y,bc=baseline;

    for(const c of allCandidates[d]){
      // Reject if this position overlaps another node
      if(overlapsAt(d,c.x,c.y,bodies)) continue;
      pos[d]={x:c.x,y:c.y};
      const nc=countCrossings(buildAllSegs(pos));
      if(nc<bc){bc=nc;bx=c.x;by=c.y;}
      if(bc===0) break;
    }
    pos[d]={x:bx,y:by};
    if(bc===0&&countCrossings(buildAllSegs(pos))===0) break;
  }
  return countCrossings(buildAllSegs(pos));
}

function runGreedy(pos){
  let prev=Infinity;
  for(let pass=0;pass<8;pass++){const c=greedyPass(pos);if(c===0||c===prev) return c;prev=c;}
  return prev;
}

// ── main search ───────────────────────────────────────────────────────────────
const cleanStart = buildCleanStart();
const startOverlaps = countLayoutOverlaps(makeBodies(cleanStart));
const startCrossings = countCrossings(buildAllSegs(cleanStart));
console.log(`Clean start: ${startCrossings} crossings, ${startOverlaps} overlaps`);

let bestCrossings = startCrossings;
let bestPos = {...cleanStart};

const START = Date.now();

// Pass 0: greedy from clean start
{
  const pos={...cleanStart};
  const c=runGreedy(pos);
  const ol=countLayoutOverlaps(makeBodies(pos));
  if(c<=bestCrossings){bestCrossings=c;bestPos={...pos};}
  console.log(`  Greedy from clean start: ${c} crossings, ${ol} overlaps`);
  if(bestCrossings===0) {/* done */}
}

// Restarts
for(let r=0;r<RESTART_BUDGET&&bestCrossings>0&&Date.now()-START<TIMEOUT_MS;r++){
  const pos={...cleanStart};
  // Randomly perturb core donors from the clean start
  for(const d of coreDonors){
    const cands=allCandidates[d];
    pos[d]=cands[Math.floor(Math.random()*cands.length)];
  }
  // Re-resolve overlaps after random placement
  const bodies=makeBodies(pos);
  const pinned=new Set(bodies.filter(b=>b.type==='party').map(b=>b.id));
  for(let i=0;i<200;i++){
    resolveBodyOverlaps(bodies,4,pinned);
    for(const b of bodies) if(b.type==='party'){const p=partyPositions[b.name];if(p){b.x=p.x;b.y=p.y;}}
    if(countLayoutOverlaps(bodies)===0) break;
  }
  for(const b of bodies) if(b.type==='donor'&&pos[b.name]) pos[b.name]={x:b.x,y:b.y};

  const c=runGreedy(pos);
  const ol=countLayoutOverlaps(makeBodies(pos));
  if(c<bestCrossings||(c===bestCrossings&&ol===0)){
    bestCrossings=c;bestPos={...pos};
    console.log(`  Restart ${r+1}: ${c} crossings, ${ol} overlaps (${((Date.now()-START)/1000).toFixed(1)}s)`);
  }
}

const elapsed=((Date.now()-START)/1000).toFixed(1);
console.log(`\nDone: ${bestCrossings} crossings, ${countLayoutOverlaps(makeBodies(bestPos))} overlaps after ${elapsed}s`);

const centered=centerLayoutPositions(bestPos);
// Double-check final crossing count using the exact same external method
const finalSegs=buildAllSegs(bestPos);
const verifiedCrossings=countCrossings(finalSegs);
const verifiedOverlaps=countLayoutOverlaps(makeBodies(bestPos));
console.log(`Verified: ${verifiedCrossings} crossings, ${verifiedOverlaps} overlaps (${finalSegs.length} segments)`);
writeFileSync(CURATED_PATH,`${JSON.stringify(centered,null,2)}\n`);
const payload={...savedLayout,positions:centered,metrics:{source:'exact_clean',crossings:verifiedCrossings,overlaps:verifiedOverlaps,elapsed}};
writeFileSync(LAYOUT_PATH,`${JSON.stringify(payload,null,2)}\n`);
console.log('Written to network-layout.json');
