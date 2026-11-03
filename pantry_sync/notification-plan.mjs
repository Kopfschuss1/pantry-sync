import {createHash} from 'node:crypto';
import {total} from './pantry.mjs';
export function localTime(now,timezone){
 let parts;try{parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);}catch{return localTime(now,'UTC');}
 const value=type=>parts.find(p=>p.type===type)?.value;
 const day=`${value('year')}-${value('month')}-${value('day')}`;
 return {day,hour:Number(value('hour')),midnight:Date.parse(day+'T00:00:00Z')};
}
export function validSubscription(device){
 try{
  const url=new URL(device.endpoint);
  const approved=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  return approved&&url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&device.endpoint.length<=4096
   &&/^[A-Za-z0-9_-]{87}$/.test(device.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(device.auth);
 }catch{return false;}
}
export function reminderPlan(pantry,preferences,saved={},now=new Date(),timezone='UTC'){
 const ledger={stock:{...(saved.stock||{})},expiryDay:saved.expiryDay||'',testNonce:saved.testNonce||''};
 const levels=new Map(pantry.products.map(p=>[p.id,total(p)===0?'out':total(p)<p.minimum?'low':'ok']));
 for(const id of Object.keys(ledger.stock))if(!levels.has(id)||levels.get(id)!==ledger.stock[id]||levels.get(id)==='ok')delete ledger.stock[id];
 const stock=pantry.products.filter(p=>{const level=levels.get(p.id);return ledger.stock[p.id]!==level&&((level==='out'&&preferences.outOfStock)||(level==='low'&&preferences.lowStock));});
 const messages=[];
 if(stock.length){
  const record=Object.fromEntries(stock.map(p=>[p.id,levels.get(p.id)]));
  const signature=createHash('sha256').update(JSON.stringify(record)).digest('hex').slice(0,16);
  const body=stock.slice(0,3).map(p=>`${p.name.slice(0,60)}: ${levels.get(p.id)==='out'?'out of stock':'running low'}`).join(' · ')+(stock.length>3?` · and ${stock.length-3} more`:'');
  messages.push({kind:'stock',title:'Stock alert',body,tag:`stock-${signature}`,view:'Inventory',record});
 }
 const time=localTime(now,timezone);
 if(preferences.expiry&&time.hour>=9&&ledger.expiryDay!==time.day){
  const items=pantry.products.flatMap(p=>p.batches.filter(b=>b.quantity>0&&b.expiry).map(b=>({name:p.name,days:Math.round((Date.parse(b.expiry+'T00:00:00Z')-time.midnight)/86400000)}))).filter(b=>b.days<=7).sort((a,b)=>a.days-b.days);
  if(items.length){const body=items.slice(0,3).map(i=>`${i.name.slice(0,60)}: ${i.days<0?`${-i.days} days overdue`:i.days===0?'expires today':`${i.days} ${i.days===1?'day':'days'} left`}`).join(' · ')+(items.length>3?` · and ${items.length-3} more`:'');
   messages.push({kind:'expiry',title:'Expiry summary',body,tag:`expiry-${time.day}`,view:'Expiry',record:time.day});
  }
 }
 return {ledger,messages};
}
export function markDelivered(ledger,message){
 if(message.kind==='stock')Object.assign(ledger.stock,message.record);
 if(message.kind==='expiry')ledger.expiryDay=message.record;
 if(message.kind==='test')ledger.testNonce=message.record;
 return ledger;
}
