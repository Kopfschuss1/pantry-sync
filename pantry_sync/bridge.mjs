import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth,signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore,doc,getDocFromServer,getDocs,collection,runTransaction,serverTimestamp } from 'firebase/firestore';
import {planSync,same,remoteView,key} from './sync-plan.mjs';
import {categorize} from './pantry.mjs';
const required=k=>{if(!process.env[k])throw Error(`Set ${k} in the connector environment.`);return process.env[k];};
const HA_URL=new URL(required('HA_URL'));
if(!['http:','https:'].includes(HA_URL.protocol))throw Error('Use an HTTP or HTTPS Home Assistant address.');
const HA_TOKEN=required('HA_TOKEN'),ENTITY=required('HA_LIST');
const API_BASE=process.env.HA_API_BASE||new URL('/api/',HA_URL).href;
if(!/^todo\.[a-z0-9_]+$/.test(ENTITY))throw Error('HA_LIST must be a to-do entity ID.');
const enabled=process.env.SYNC_ENABLED==='true';
const dir=path.resolve(process.env.DATA_DIR||'./data');await fs.mkdir(dir,{recursive:true});
// The container entry point holds an OS lock, released automatically after a crash.
const shutdown=async()=>{process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
const app=initializeApp({apiKey:'AIzaSyBcQQZhAalwOCe-7Y6mWQ1j3FLkLGoo5X8',projectId:'pantry-inventory-app-493a5',authDomain:'pantry-inventory-app-493a5.firebaseapp.com'});
const auth=getAuth(app),db=getFirestore(app);
async function ha(service,data={},response=false){
 const result=await fetch(new URL(`services/todo/${service}${response?'?return_response':''}`,API_BASE),{method:'POST',headers:{Authorization:`Bearer ${HA_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({entity_id:ENTITY,...data}),signal:AbortSignal.timeout(15000)});
 if(!result.ok)throw Error(`Home Assistant request failed (${result.status}).`);
 return result.json();
}
async function list(){
 const response=await ha('get_items',{},true),items=response.service_response?.[ENTITY]?.items;
 if(!Array.isArray(items)||items.some(x=>!x.uid||typeof x.summary!=='string'||!['completed','needs_action'].includes(x.status)))throw Error('Home Assistant did not return a complete to-do list. No changes applied.');
 return items;
}
let record={project:'pantry-inventory-app-493a5',householdId:'',entity:ENTITY,pairs:[]};
try{record=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
async function save(next){await fs.writeFile(path.join(dir,'state.next.json'),JSON.stringify(next),{mode:0o600});await fs.rename(path.join(dir,'state.next.json'),path.join(dir,'state.json'));record=next;}
async function main(){
 const {user}=await signInWithEmailAndPassword(auth,required('PANTRY_EMAIL'),required('PANTRY_PASSWORD'));
 if(!user.emailVerified)throw Error('Verify the connector account’s email in Pantry first.');
 let householdId=process.env.PANTRY_HOUSEHOLD;
 if(!householdId){const houses=await getDocs(collection(db,'users',user.uid,'households'));if(houses.size!==1)throw Error('The connector account must belong to exactly one household, or set PANTRY_HOUSEHOLD.');householdId=houses.docs[0].id;}
 if(record.householdId&&(record.householdId!==householdId||record.entity!==ENTITY))throw Error('Saved sync state belongs to another household/list. Use a separate data directory.');
 const ref=doc(db,'households',householdId,'state','current');
 let notificationStop,startingNotifications=false;
 async function initNotifications(){if(notificationStop||startingNotifications||!enabled)return;startingNotifications=true;try{const {startNotifications}=await import('./notification-worker.mjs');notificationStop=await startNotifications({db,user,householdId,directory:dir});}catch(e){console.error(`Notification service paused (${e.code||e.message}). Shopping sync continues.`);}finally{startingNotifications=false;}}
 if(enabled && process.env.NOTIFICATIONS_ENABLED==='true'){await initNotifications();setInterval(()=>void initNotifications(),5*60000);}

 let failures=0;
 console.log(enabled?'Connector active. Shopping only; inventory is never replenished by sync.':'Preview mode: no changes will be written.');
 while(true){
   try{
     const current=await getDocFromServer(ref);if(!current.exists())throw Error('Household not available.');
     const data=current.data(),pantry=JSON.parse(data.json),remote=await list();
     const plan=planSync(pantry.shopping,remote,record.pairs,name=>categorize(name,pantry));
     const changed=JSON.stringify(plan.shopping)!==JSON.stringify(pantry.shopping);
     if(!enabled){console.log(`Preview: ${plan.shopping.length} shared items; ${plan.actions.length} Home Assistant actions; Pantry ${changed?'would update':'unchanged'}.`);return;}
     if(changed)await runTransaction(db,async t=>{
       const live=await t.get(ref);if(live.data()?.revision!==data.revision)throw Error('Pantry changed during sync; retrying.');
       const next={...pantry,shopping:plan.shopping,activity:[{id:crypto.randomUUID(),at:new Date().toISOString(),actor:'Home Assistant',text:'Home Assistant updated the shopping list'},...pantry.activity].slice(0,500)};
       const json=JSON.stringify(next);if(Buffer.byteLength(json)>350000)throw Error('Pantry capacity reached.');
       t.set(ref,{json,previous:'',revision:data.revision+1,updatedBy:user.uid,updatedAt:serverTimestamp()});
     });
     for(const action of plan.actions){
       const now=await list();
       if(action.type==='add'){
         let found=now.find(h=>key(h.summary)===key(action.value.name));
         if(!found){await ha('add_item',{item:action.value.name});found=(await list()).find(h=>key(h.summary)===key(action.value.name));}
         if(!found)throw Error('New Home Assistant item could not be confirmed.');
         if(action.value.bought&&found.status!=='completed')await ha('update_item',{item:found.uid,status:'completed'});
         plan.pairs.find(p=>p.appId===action.appId).haId=found.uid;
       }else{
         const found=now.find(h=>h.uid===action.uid);
         if(action.type==='remove'&&!found)continue;
         if(!found)throw Error('Home Assistant changed during sync; retrying.');
         if(action.type==='update'&&same(remoteView(found),action.value))continue;
         if(!same(remoteView(found),action.expected))throw Error('Home Assistant changed during sync; retrying.');
         if(action.type==='remove')await ha('remove_item',{item:action.uid});
         else await ha('update_item',{item:action.uid,rename:action.value.name,status:action.value.bought?'completed':'needs_action'});
       }
     }
     await save({project:'pantry-inventory-app-493a5',householdId,entity:ENTITY,pairs:plan.pairs});
     if(changed||plan.actions.length)console.log('Shopping lists synced.');
     failures=0;
   }catch(e){failures++;console.error(`Sync paused; retrying. ${e.code||e.message}`);}
   await new Promise(resolve=>setTimeout(resolve,Math.min(300000,30000*2**Math.min(failures,3))));
 }
}
try{await main();}catch(e){console.error(e.code||e.message);process.exitCode=1;}
process.exit(process.exitCode||0);
