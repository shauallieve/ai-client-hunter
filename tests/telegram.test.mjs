import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

function fixture() {
  const data=[];
  const env={
    DASHBOARD_TOKEN:'sample-a-secure-dashboard-token-for-testing-only',
    TELEGRAM_WEBHOOK_SECRET:'sample-telegram-secret',
    TELEGRAM_IMPORT_TOKEN:'example-strong-import-token-abcde12345-very-long',
    LEAD_STORE:{
      idFromName(){return 'default'},
      get(){return {
        async fetch(url,options){
          const pathname=new URL(url).pathname;
          if(pathname==='/ingest'){
            const lead=JSON.parse(options.body);
            const idx=data.findIndex(l=>l.id===lead.id);
            if(idx>=0)data[idx]=lead;else data.push(lead);
            return Response.json({ok:true});
          }
          if(pathname==='/list')return Response.json({leads:data,count:data.length});
          if(pathname==='/delete'){const id=JSON.parse(options.body).id;const idx=data.findIndex(x=>x.id===id);if(idx>=0)data.splice(idx,1);return Response.json({ok:true})}
          return Response.json({}, {status:404})
        }
      }}
    },
    ASSETS:{fetch(){return new Response('<html>React</html>',{headers:{'content-type':'text/html'}})}}
  };
  return {env,data};
}
const url='https://ai-client-hunter.example.workers.dev';
test('health endpoint is JSON',async()=>{
  const {env}=fixture();
  const response=await worker.fetch(new Request(url+'/api/health'),env);
  assert.match(response.headers.get('content-type'),/json/);
  assert.equal((await response.json()).mode,'telegram-only');
});
test('public dashboard can read leads without token',async()=>{
  const {env}=fixture();
  const response=await worker.fetch(new Request(url+'/api/leads'),env);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).leads,[]);
});
test('reject webhook requests without Telegram signature',async()=>{
  const {env}=fixture();
  const response=await worker.fetch(new Request(url+'/api/telegram/webhook',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env);
  assert.equal(response.status,401);
});
test('Telegram group job is saved with public contact and source link',async()=>{
  const {env,data}=fixture();
  const request=new Request(url+'/api/telegram/webhook',{method:'POST',headers:{
    'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':'sample-telegram-secret'
  },body:JSON.stringify({update_id:72,message:{
    message_id:56,chat:{id:-100123,type:'supergroup',title:'Заказы на разработку',username:'jobs_programmers'},
    from:{id:777,username:'client_public'},date:Math.floor(Date.now()/1000),
    text:'Ищем разработчика. Нужно сделать Telegram-бота для записи клиентов. Кто возьмётся?'
  }})});
  const res=await worker.fetch(request,env);
  assert.equal(res.status,200);
  assert.equal(data.length,1);
  assert.equal(data[0].contactUrl,'https://t.me/client_public');
  assert.equal(data[0].url,'https://t.me/jobs_programmers/56');
  const auth=await worker.fetch(new Request(url+'/api/leads'),env);
  assert.equal((await auth.json()).leads.length,1);
});
test('non-sales message is ignored',async()=>{
  const {env,data}=fixture();
  const req=new Request(url+'/api/telegram/webhook',{method:'POST',headers:{
    'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':'sample-telegram-secret'
  },body:JSON.stringify({message:{
    message_id:999,chat:{id:-100123,type:'supergroup',title:'Новости'},date:Math.floor(Date.now()/1000),
    text:'Сегодня холодно, завтра ожидается солнечная погода.'
  }})});
  await worker.fetch(req,env);
  assert.equal(data.length,0);
});

test('ignore leads from private groups in public mode',async()=>{
  const {env,data}=fixture();
  const req=new Request(url+'/api/telegram/webhook',{method:'POST',headers:{
    'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':'sample-telegram-secret'
  },body:JSON.stringify({message:{
    message_id:251,chat:{id:-100987,type:'supergroup',title:'Закрытый чат'},
    from:{id:555,username:'public_dev_client'},date:Math.floor(Date.now()/1000),
    text:'Нужен разработчик, сделайте мне Telegram-бота!'
  }})});
  const result=await worker.fetch(req,env);
  assert.equal(result.status,200);
  assert.equal(data.length,0);
});
test('destructive operations remain protected',async()=>{
  const {env}=fixture();
  const result=await worker.fetch(new Request(url+'/api/leads',{method:'DELETE',body:JSON.stringify({id:'x'})}),env);
  assert.equal(result.status,401);
});

test('public global-search import requires private key',async()=>{
  const {env}=fixture();
  const response=await worker.fetch(new Request(url+'/api/telegram/import',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leads:[]})
  }),env);
  assert.equal(response.status,401);
});
test('public global-search only saves recent public job posts',async()=>{
  const {env,data}=fixture();
  const now=new Date().toISOString();
  const leads=[
    {url:'https://t.me/public_jobs_channel/123',description:'Ищем разработчика! Нужно сделать Telegram-бота для записи клиентов, бюджет обсуждается.',published:now,sourceChat:'Заказы',contactUsername:'public_customer'},
    {url:'https://t.me/c/12345/456',description:'Нужен разработчик сделать сайт',published:now,sourceChat:'Private'},
    {url:'https://t.me/public_jobs_channel/124',description:'Погода на этой неделе',published:now}
  ];
  const response=await worker.fetch(new Request(url+'/api/telegram/import',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.TELEGRAM_IMPORT_TOKEN},
    body:JSON.stringify({leads})
  }),env);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.saved,1);
  assert.equal(result.rejected,2);
  assert.equal(data.length,1);
  assert.equal(data[0].contactUrl,'https://t.me/public_customer');
  const feed=await worker.fetch(new Request(url+'/api/leads'),env);
  assert.equal((await feed.json()).leads.length,1);
});
