import { randomUUID } from 'node:crypto';
const key=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const same=(a,b)=>a.name===b.name&&a.bought===b.bought;
const remoteView=h=>({name:h.summary,bought:h.status==='completed'});
// Three-way comparison retains edits made while either service was offline.
export function planSync(shopping,remote,pairs=[],categorize=()=> 'Uncategorized'){
 const target=structuredClone(shopping), actions=[],next=[],usedApps=new Set(),usedRemote=new Set();
 const appById=id=>target.find(a=>a.id===id);
 const remoteById=id=>remote.find(h=>h.uid===id);
 function pair(a,h,base){
   usedApps.add(a.id);if(h)usedRemote.add(h.uid);
   const hv=h?remoteView(h):null;
   const desired=base&&hv?{name:hv.name!==base.name?hv.name:a.name,bought:hv.bought!==base.bought?hv.bought:a.bought}:{name:a.name,bought:h?(a.bought&&hv.bought):a.bought};
   if(a.name!==desired.name){a.name=desired.name;a.category=categorize(a.name);a.automatic=false;delete a.productId;}
   a.bought=desired.bought;
   if(!h)actions.push({type:'add',appId:a.id,value:desired});
   else if(!same(hv,desired))actions.push({type:'update',uid:h.uid,expected:hv,value:desired});
   next.push({appId:a.id,haId:h?.uid||null,base:desired,app:structuredClone(a)});
 }
 for(const old of pairs){
   const a=appById(old.appId),h=remoteById(old.haId);
   if(!a&&!h)continue;
   if(!a){
     usedRemote.add(h.uid);
     if(same(remoteView(h),old.base)){actions.push({type:'remove',uid:h.uid,expected:remoteView(h)});continue;}
     const restored={...old.app,name:h.summary,bought:h.status==='completed',automatic:false};delete restored.productId;restored.category=categorize(restored.name);target.push(restored);pair(restored,h,old.base);continue;
   }
   if(!h){
     usedApps.add(a.id);
     if(same(a,old.base)){target.splice(target.indexOf(a),1);continue;}
     pair(a,null,old.base);continue;
   }
   pair(a,h,old.base);
 }
 for(const a of [...target])if(!usedApps.has(a.id)){
   const h=remote.find(h=>!usedRemote.has(h.uid)&&key(h.summary)===key(a.name));pair(a,h,null);
 }
 for(const h of remote)if(!usedRemote.has(h.uid)&&h.status==='needs_action'){
   if(target.some(a=>key(a.name)===key(h.summary)))throw Error('Duplicate Home Assistant item names need resolving before sync.');
   const a={id:randomUUID(),name:h.summary,quantity:1,category:categorize(h.summary),automatic:false,bought:false};target.push(a);pair(a,h,null);
 }
 if(new Set(target.map(a=>key(a.name))).size!==target.length)throw Error('A rename would duplicate an existing shopping item. Resolve the names before sync.');
 if(target.some(a=>!a.name.trim()||a.name.length>100)||target.length>1000)throw Error('Shopping list exceeds Pantry’s item limits.');
 return {shopping:target,actions,pairs:next};
}
export {same,remoteView,key};
