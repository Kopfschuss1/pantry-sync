import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';
import {doc,collection,getDocFromServer,setDoc,onSnapshot,serverTimestamp,deleteDoc} from 'firebase/firestore';
import {reminderPlan,markDelivered,validSubscription} from './notification-plan.mjs';
export async function startNotifications({db,user,householdId,directory}){
 const keyFile=path.join(directory,'notification-keys.json'),ledgerFile=path.join(directory,'notification-ledger.json');
 let keys,ledger={};
 try{keys=JSON.parse(await fs.readFile(keyFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;keys=webpush.generateVAPIDKeys();await fs.writeFile(keyFile,JSON.stringify(keys),{mode:0o600,flag:'wx'});}
 try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const configRef=doc(db,'households',householdId,'integrations','notifications');
 const existing=await getDocFromServer(configRef);
 if(existing.exists()&&(existing.data().publicKey!==keys.publicKey||existing.data().senderId!==user.uid))throw Error('Notification sender configuration differs from the saved keys/account. Restore the original connector data/account before continuing.');
 const heartbeat=()=>setDoc(configRef,{senderId:user.uid,publicKey:keys.publicKey,heartbeatAt:serverTimestamp(),version:'0.2.0'});
 await heartbeat();
 const household=await getDocFromServer(doc(db,'households',householdId));
 const name=String(household.data()?.name||'Pantry').slice(0,80);
 webpush.setVapidDetails('https://pantry-inventory-app-493a5.web.app',keys.publicKey,keys.privateKey);
 let devices=[],members=new Set(),running=false,pending=false,closed=false;
 async function save(){await fs.writeFile(ledgerFile+'.next',JSON.stringify(ledger),{mode:0o600});await fs.rename(ledgerFile+'.next',ledgerFile);}
 async function delivery(id,device,requestId,status,error=''){
  await setDoc(doc(db,'households',householdId,'pushDelivery',id),{uid:device.uid,status,requestId,at:serverTimestamp(),error});
 }
 async function send(id,device,message,state){
  const url=new URL('https://pantry-inventory-app-493a5.web.app/');url.searchParams.set('household',householdId);url.searchParams.set('view',message.view);
  try{
   await webpush.sendNotification({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},JSON.stringify({title:message.kind==='test'?'Pantry notifications are working':`${name} · ${message.title}`,body:message.body,tag:`${householdId}-${message.tag}`,url:url.href}),{TTL:message.kind==='test'?300:21600,timeout:15000,urgency:message.kind==='test'?'high':'normal'});
   markDelivered(state,message);state.nextAttemptAt=0;ledger[id]=state;await save();
   if(message.kind==='test'){
    state.testAckPending=true;await save();
    await delivery(id,device,message.record,'sent').then(async()=>{state.testAckPending=false;await save();}).catch(()=>console.error('Test delivery status will retry.'));
   }
   console.log(`Notification sent (${message.kind}).`);
   return true;
  }catch(e){
   if(e.statusCode===404||e.statusCode===410){
    if(message.kind==='test')await delivery(id,device,message.record,'error','This device registration expired. Enable notifications again.').catch(()=>{});
    await deleteDoc(doc(db,'households',householdId,'pushDevices',id));delete ledger[id];await save();return false;
   }
   state.nextAttemptAt=Date.now()+(e.statusCode===429?60*60000:5*60000);ledger[id]=state;await save();
   if(message.kind==='test')await delivery(id,device,message.record,'error','The push service could not be reached. The reminder service will retry.').catch(()=>{});
   console.error(`Notification delivery paused (${e.statusCode||'connection error'}).`);return false;
  }
 }
 async function cycle(){
  if(closed)return;if(running){pending=true;return;}running=true;
  try{
   const data=await getDocFromServer(doc(db,'households',householdId,'state','current'));if(!data.exists())return;
   const pantry=JSON.parse(data.data().json);
   for(const {id,...device} of devices){
    if(!members.has(device.uid)||!validSubscription(device))continue;
    const previous=ledger[id]||{};if(previous.nextAttemptAt>Date.now())continue;
    const plan=reminderPlan(pantry,device.preferences,previous,new Date(),device.timezone);
    const state={...previous,...plan.ledger};ledger[id]=state;
    const testTime=device.testRequestedAt?.toMillis?.()||0;
    if(state.testAckPending&&state.testNonce)await delivery(id,device,state.testNonce,'sent').then(()=>{state.testAckPending=false;}).catch(()=>{});
    const testPending=device.testNonce&&device.testNonce!==state.testNonce&&testTime>Date.now()-10*60000;
    if((testPending||plan.messages.length)&&!(await getDocFromServer(doc(db,'households',householdId,'members',device.uid))).exists())continue;
    if(testPending){
     const ok=await send(id,device,{kind:'test',body:'You’ll receive expiry and stock alerts here. Tap to open your notification settings.',tag:`test-${device.testNonce}`,view:'Settings',record:device.testNonce},state);
     if(!ok)continue;
    }
    for(const message of plan.messages)if(!await send(id,device,message,state))break;
   }
   await save();
  }catch(e){console.error(`Reminder check paused (${e.code||'connection error'}).`);}finally{running=false;if(pending&&!closed){pending=false;void cycle();}}
 }
 const stopMembers=onSnapshot(collection(db,'households',householdId,'members'),s=>{members=new Set(s.docs.map(d=>d.id));void cycle();},()=>console.error('Notification membership check disconnected.'));
 const stopDevices=onSnapshot(collection(db,'households',householdId,'pushDevices'),s=>{devices=s.docs.map(d=>({id:d.id,...d.data()}));void cycle();},()=>console.error('Notification device list disconnected.'));
 const interval=setInterval(()=>void cycle(),60000);
 const heart=setInterval(()=>void heartbeat().catch(()=>console.error('Notification heartbeat paused.')),5*60000);
 console.log('Notification service ready. Expiry summaries: 09:00 device time; stock alerts: when status changes.');
 return ()=>{closed=true;stopMembers();stopDevices();clearInterval(interval);clearInterval(heart);};
}
