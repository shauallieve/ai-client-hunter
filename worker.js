// AI Client Hunter — Telegram-only ingestion on Cloudflare Workers.
// No Telegram scanning outside chats the bot can legitimately read.
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:JSON_HEADERS})}
function store(env){const ns=env.LEAD_STORE;return ns.get(ns.idFromName('telegram-leads-v1'))}
function permitted(request,env){
  const expected=env.DASHBOARD_TOKEN;
  const supplied=request.headers.get('authorization')||'';
  return typeof expected==='string' && expected.length>=20 && supplied==='Bearer '+expected;
}
const SERVICE=[
  'сайт','сайта','сайты','лендинг','веб-приложен','web app','website','разработчик',
  'программист','бота','ботов','бот для','бот по','чат-бот','telegram bot','телеграм бот','телеграм-бот','тг бот',
  'crm','срм','автоматизац','интеграц','парсер','api','n8n','webhook',
  'личный кабинет','админ-панел','скрипт','интернет-магазин','ai-агент','ии-агент','мобильное приложен','ios приложение','android приложение',
  'разработку приложения','разработать приложен','создать приложен'
];
const INTENT=[
  'нужен','нужна','нужно','требуется','ищем','ищу','кто сделает','кто может сделать',
  'посоветуйте','подскажите','заказ','разработать','разработку','сделать',
  'заказать','помогите','ищем исполнителя','кто напишет','кто разработает','кто возьмётся','потріб','шукаємо','хто зробить',
  'need developer','looking for developer','hiring developer','need a bot','need a website'
];
const SELLER=['предлагаю свои услуги','создам для вас','я разработчик','ищу клиентов','ищу заказы','возьму заказы','делаю сайты на заказ','продам курс'];
function scoreText(raw){
  const t=raw.toLowerCase();
  if(SELLER.some(x=>t.includes(x)))return {score:0,reason:'Предложение услуг, а не заказ'};
  const skill=SERVICE.filter(x=>t.includes(x));const intent=INTENT.filter(x=>t.includes(x));
  // Inference from public texts only, not an LLM guarantee.
  const score=skill.length&&intent.length?Math.min(99,46+Math.min(4,skill.length)*10+Math.min(3,intent.length)*7):0;
  return {score,reason:skill.length&&intent.length?'Технология: '+skill.slice(0,3).join(', ')+'; спрос: '+intent.slice(0,2).join(', '):'Нет явного заказа на разработку'};
}
// Public search settings can be read by everyone; editing requires a separate admin secret.
const DEFAULT_SEARCH_CONFIG={
  queries:['нужен разработчик','ищем программиста','сделать сайт',
    'нужен телеграм бот','разработать бота','нужен сайт','нужен бот'],
  includeAny:['сайт','лендинг','бота','ботов','бот для','чат-бот',
    'telegram','телеграм','crm','автоматизац','веб-приложен','разработчик',
    'программист','парсер','api','интеграц'],
  intentAny:['нужен','нужна','нужно','ищем','ищу','требуется',
    'сделать','разработать','создать','заказать','кто сможет','кто сделает','помогите'],
  excludeAny:['ищу работу','ищу заказ','предлагаю услуги','делаю сайты на заказ'],
  maxAgeHours:48,
  minChars:35,
  perQuery:18,
  maxLeads:25
};
function validateSearchConfig(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {error:'Ожидается объект настроек'};
  function phrases(key,maxCount,maxLen,mandatory=false){
    const input=value[key];
    if(!Array.isArray(input)||input.length>maxCount||(mandatory&&input.length===0))throw Error('Неверное количество элементов: '+key);
    const results=[],seen=new Set();
    for(const word of input){
      if(typeof word!=='string')throw Error('Неверное значение: '+key);
      const clean=word.trim().replace(/\s+/g,' ');
      if(clean.length<2||clean.length>maxLen||/[\x00-\x1f]/.test(clean))throw Error('Недопустимая длина или символы: '+key);
      const lower=clean.toLowerCase();
      if(!seen.has(lower)){results.push(clean);seen.add(lower)}
    }
    if(mandatory&&!results.length)throw Error('Добавь хотя бы один поисковый запрос');
    return results;
  }
  function number(name,min,max){
    const v=value[name];
    if(!Number.isInteger(v)||v<min||v>max)throw Error('Неверное значение: '+name);
    return v;
  }
  try{
    return {config:{
      queries:phrases('queries',12,90,true),
      includeAny:phrases('includeAny',25,50),
      intentAny:phrases('intentAny',25,50),
      excludeAny:phrases('excludeAny',25,50),
      maxAgeHours:number('maxAgeHours',12,168),
      minChars:number('minChars',10,150),
      perQuery:number('perQuery',5,30),
      maxLeads:number('maxLeads',1,25)
    }};
  }catch(error){return {error:error instanceof Error?error.message:'Неверные настройки'}}
}
function scoreSearchPost(text,cfg){
  const lower=text.toLowerCase();
  if(text.length<cfg.minChars||cfg.excludeAny.some(w=>lower.includes(w.toLowerCase())))return {score:0,reason:'Исключено настройками'};
  const keyHits=cfg.includeAny.filter(w=>lower.includes(w.toLowerCase()));
  const intentHits=cfg.intentAny.filter(w=>lower.includes(w.toLowerCase()));
  if(cfg.includeAny.length&&!keyHits.length)return {score:0,reason:'Нет совпадения с услугами'};
  if(cfg.intentAny.length&&!intentHits.length)return {score:0,reason:'Нет признаков заказа'};
  return {score:Math.min(99,65+keyHits.length*5+intentHits.length*5),
    reason:'Совпадение с пользовательскими критериями'};
}
async function getSearchSettings(env){
  const data=await store(env).fetch('https://internal/search-config');
  if(!data.ok)throw Error('Cannot read search config');
  return data.json();
}
function normalizedUsername(value){
  return typeof value==='string' && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value)?value:null;
}
function explicitContact(text){
  // Only contacts explicitly offered in a message.
  const match=text.match(/(?:пишите|писать|пишите в|связь|контакт|telegram|телеграм|личку|лс|dm|tg|тг)\s*(?:в|:|—|-|@)?\s*(@[A-Za-z][A-Za-z0-9_]{4,31})/i);
  if(match)return normalizedUsername(match[1].slice(1));
  const link=text.match(/(?:пишите|контакт|телеграм|telegram|tg|тг)[^\n]{0,40}(?:https?:\/\/)?t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})/i);
  return link?normalizedUsername(link[1]):null;
}
function messageLink(chat,id){
  const username=normalizedUsername(chat?.username);
  return username?'https://t.me/'+username+'/'+id:'';
}
function makeLead(msg,isForward){
  const text=String(msg.text||msg.caption||'').trim().slice(0,1800);
  if(!text)return null;
  const relevance=scoreText(text);
  if(relevance.score<50)return null;
  const origin=msg.forward_origin;
  const from=isForward?(origin?.type==='user'?origin.sender_user:null):msg.from;
  const author=normalizedUsername(from?.username);
  const offered=explicitContact(text);
  const contactUsername=offered||author||null;
  let url=isForward?'':messageLink(msg.chat,msg.message_id);
  let originName=msg.chat.title||'Telegram';
  if(isForward && origin?.type==='channel'){
    const original=messageLink(origin.chat,origin.message_id);
    if(original)url=original;
    originName=origin.chat?.title||originName;
  }
  // For private forwards with hidden origin, no fabricated source link or contact.
  if(isForward && !origin)url='';
  // Public mode must never expose messages from private groups or hidden forwarded sources.
  if(!/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\/\d+$/.test(url))return null;
  const published=new Date(Math.max(0,Number(msg.date)||Math.floor(Date.now()/1000))*1000).toISOString();
  const id=(isForward?'forward:':'message:')+String(msg.chat.id)+':'+String(msg.message_id);
  const title=text.split(/\n/)[0].slice(0,120)||'Запрос на разработку';
  return {id,source:'Telegram',sourceChat:originName,title,description:text,url,published,
    contactUsername,contactUrl:contactUsername?'https://t.me/'+contactUsername:'',
    score:relevance.score,reasons:[relevance.reason],
    category:'Telegram: разработка'};
}
async function postTelegram(env,chatId,text){
  if(!env.TELEGRAM_BOT_TOKEN)return {ok:false,error:'bot_token_missing'};
  try{
    const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})
    });
    const result=await response.json();
    if(!response.ok||!result.ok)return {ok:false,error:'telegram_'+String(result.error_code||response.status)};
    return {ok:true,error:null};
  }catch{return {ok:false,error:'telegram_send_network_error'}}
}
async function webhook(request,env){
  if(!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('x-telegram-bot-api-secret-token')!==env.TELEGRAM_WEBHOOK_SECRET)
    return json({error:'Unauthorized Telegram webhook'},401);
  if(!env.LEAD_STORE)return json({error:'Storage not bound'},503);
  if(Number(request.headers.get('content-length')||0)>100000)return json({error:'Payload too large'},413);
  let update;
  try{update=await request.json()}catch{return json({error:'Invalid JSON'},400)}
  const msg=update?.message||update?.channel_post||update?.edited_message||update?.edited_channel_post;
  if(!msg?.chat?.id||!msg.message_id)return json({ok:true,ignored:'not a message'});
  const chatType=msg.chat.type;
  if(chatType==='private'){
    const senderId=String(msg.from?.id||'');
    const cmd=String(msg.text||'').trim();
    if(cmd.startsWith('/start')||cmd.startsWith('/whoami')){
      const reply=await postTelegram(env,msg.chat.id,'AI Client Hunter. Твой Telegram ID: '+senderId+
        '\nПерешли сюда сообщение с запросом на разработку из любого доступного тебе чата. Доступ разрешён владельцу бота, указанному в TELEGRAM_OWNER_ID.');
      // Only anonymous delivery metadata is stored; never expose chat IDs or message contents.
      await store(env).fetch('https://internal/diagnostics',{method:'POST',
        body:JSON.stringify({at:new Date().toISOString(),replySent:reply.ok,error:reply.error})});
      return json({ok:true,replySent:reply.ok});
    }
    if(!env.TELEGRAM_OWNER_ID||senderId!==String(env.TELEGRAM_OWNER_ID))return json({ok:true,ignored:'not owner'});
    const forward=Boolean(msg.forward_origin||msg.forward_date);
    if(!forward)return json({ok:true,ignored:'only forwarded leads in DMs'});
    const lead=makeLead(msg,true);
    if(lead){await store(env).fetch('https://internal/ingest',{method:'POST',body:JSON.stringify(lead)});
      await postTelegram(env,msg.chat.id,'Заявка сохранена ✅\n'+lead.title.slice(0,100)+
        (lead.contactUsername?'\nКонтакт: @'+lead.contactUsername:'\nПрямой контакт не раскрыт'));
    }else await postTelegram(env,msg.chat.id,'Это сообщение не похоже на заказ по разработке. Не сохраняю.');
    return json({ok:true,found:Boolean(lead)});
  }
  if(!['group','supergroup','channel'].includes(chatType))return json({ok:true,ignored:'unsupported chat type'});
  if(env.TELEGRAM_ALLOWED_CHATS){
    const ids=env.TELEGRAM_ALLOWED_CHATS.split(',').map(x=>x.trim());
    if(!ids.includes(String(msg.chat.id)))return json({ok:true,ignored:'chat not allowed'});
  }
  const lead=makeLead(msg,false);
  if(lead)await store(env).fetch('https://internal/ingest',{method:'POST',body:JSON.stringify(lead)});
  return json({ok:true,found:Boolean(lead)});
}
export class LeadStore {
  constructor(state){this.state=state}
  async fetch(request){
    const url=new URL(request.url);
    const storage=this.state.storage;
    if(url.pathname==='/ingest'&&request.method==='POST'){
      const lead=await request.json();
      if(!lead?.id||!lead.title||lead.source!=='Telegram')return json({error:'Bad lead'},400);
      await storage.put('lead:'+lead.id,lead);
      return json({ok:true});
    }
    if(url.pathname==='/search-config'){
      if(request.method==='GET')return json(await storage.get('settings:search')||{
        config:DEFAULT_SEARCH_CONFIG,updatedAt:null
      });
      if(request.method==='POST'){
        const config=await request.json();
        const entry={config,updatedAt:new Date().toISOString()};
        await storage.put('settings:search',entry);
        return json(entry);
      }
    }
    if(url.pathname==='/search-report'){
      if(request.method==='POST'){
        const result=await request.json();
        await storage.put('diagnostic:lastSearch',{at:result.at,saved:result.saved,rejected:result.rejected});
        return json({ok:true});
      }
      if(request.method==='GET')return json({lastSearch:await storage.get('diagnostic:lastSearch')||null});
    }
    if(url.pathname==='/diagnostics'){
      if(request.method==='POST'){
        const item=await request.json();
        await storage.put('diagnostic:lastStart',{at:item.at,replySent:Boolean(item.replySent),error:item.error||null});
        return json({ok:true});
      }
      if(request.method==='GET')return json({lastStart:await storage.get('diagnostic:lastStart')||null});
    }
    if(url.pathname==='/list'){
      const items=await storage.list({prefix:'lead:',limit:1000});
      const cutoff=Date.now()-30*86400000,leads=[];
      for(const [key,l] of items){
        if(Date.parse(l.published||'')<cutoff){await storage.delete(key);continue}
        if(typeof l.url!=='string'||!/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\/\d+$/.test(l.url))continue;
        leads.push(l);
      }
      leads.sort((a,b)=>b.published.localeCompare(a.published));
      return json({leads:leads.slice(0,300),count:leads.length});
    }
    if(url.pathname==='/delete'&&request.method==='POST'){
      const {id}=await request.json();
      if(typeof id!=='string')return json({error:'Bad id'},400);
      await storage.delete('lead:'+id);
      return json({ok:true});
    }
    return json({error:'Not found'},404);
  }
}
async function registerTelegramWebhook(env){
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET||!env.PUBLIC_BASE_URL)return;
  const url=String(env.PUBLIC_BASE_URL).replace(/\/$/,'')+'/api/telegram/webhook';
  if(!url.startsWith('https://'))return;
  const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/setWebhook',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({url,secret_token:env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates:['message','channel_post','edited_message','edited_channel_post'],
      drop_pending_updates:false})
  });
  if(!response.ok)throw new Error('Telegram setWebhook HTTP '+response.status);
  const result=await response.json();
  if(!result.ok)throw new Error('Telegram setWebhook: '+String(result.description||'unknown error'));
}
async function telegramStatus(env){
  if(!env.TELEGRAM_BOT_TOKEN)return json({ok:false,reason:'bot_token_missing'},503);
  const api='https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/';
  const expected=String(env.PUBLIC_BASE_URL||'').replace(/\/$/,'')+'/api/telegram/webhook';
  try{
    const [meResp,hookResp]=await Promise.all([
      fetch(api+'getMe',{signal:AbortSignal.timeout(6000)}),
      fetch(api+'getWebhookInfo',{signal:AbortSignal.timeout(6000)})
    ]);
    const [me,hook]=await Promise.all([meResp.json(),hookResp.json()]);
    if(!me.ok)return json({ok:false,reason:'telegram_token_invalid',detail:'Telegram rejected bot token'},200);
    if(!hook.ok)return json({ok:false,reason:'telegram_webhook_info_failed',detail:String(hook.description||'unknown').slice(0,140)},200);
    const current=hook.result||{};
    let lastStart=null;
    if(env.LEAD_STORE){
      try{
        const diag=await store(env).fetch('https://internal/diagnostics');
        if(diag.ok)lastStart=(await diag.json()).lastStart||null;
      }catch{/* Don't fail status when storage is unavailable */}
    }
    return json({ok:true,botUsername:me.result?.username||null,lastStart,
      webhookRegistered:Boolean(current.url),
      webhookMatchesExpected:current.url===expected,
      pendingUpdates:current.pending_update_count||0,
      lastDeliveryError:current.last_error_message?String(current.last_error_message).slice(0,200):null,
      lastDeliveryErrorAt:current.last_error_date?new Date(current.last_error_date*1000).toISOString():null,
      webhookExpectedHost:(()=>{try{return new URL(expected).host}catch{return null}})(),
      nextStep:!current.url?'Telegram webhook is not registered; check Cloudflare Cron Triggers':current.url!==expected?
        'Webhook points to another app; check Cloudflare Cron Trigger registration':
        current.last_error_message?'Telegram delivery failed; inspect lastDeliveryError':'Webhook is registered; send /start to the correct bot'
    });
  }catch(error){
    return json({ok:false,reason:'telegram_api_unreachable',detail:error instanceof Error?error.message.slice(0,140):'Unknown error'},503);
  }
}
export default {
  async scheduled(_controller,env,ctx){
    ctx.waitUntil(registerTelegramWebhook(env));
  },
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname;
    if(path==='/api/health')return json({ok:true,service:'ai-client-hunter',mode:'telegram-only',version:'telegram-public-v2',publicAccess:true,
      configured:{bot:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_WEBHOOK_SECRET),
        dashboard:Boolean(env.DASHBOARD_TOKEN),store:Boolean(env.LEAD_STORE),searchImport:Boolean(env.TELEGRAM_IMPORT_TOKEN)}});
    if(path==='/api/telegram/search-config'&&request.method==='GET'){
      if(!env.LEAD_STORE)return json({error:'Storage unavailable'},503);
      const settings=await getSearchSettings(env);
      return json({...settings,adminConfigured:typeof env.SEARCH_ADMIN_TOKEN==='string'&&env.SEARCH_ADMIN_TOKEN.length>=24});
    }
    if(path==='/api/telegram/search-config'&&request.method==='PUT'){
      const secret=env.SEARCH_ADMIN_TOKEN;
      if(typeof secret!=='string'||secret.length<24)return json({error:'SEARCH_ADMIN_TOKEN ещё не настроен в Cloudflare'},503);
      if(request.headers.get('authorization')!=='Bearer '+secret)return json({error:'Неверный ключ редактирования'},401);
      if(!env.LEAD_STORE)return json({error:'Storage unavailable'},503);
      if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Слишком большой запрос'},413);
      let payload;
      try{payload=await request.json()}catch{return json({error:'Некорректный JSON'},400)}
      const validated=validateSearchConfig(payload);
      if(validated.error)return json({error:validated.error},400);
      const result=await store(env).fetch('https://internal/search-config',{
        method:'POST',body:JSON.stringify(validated.config)
      });
      return new Response(result.body,{status:result.status,headers:JSON_HEADERS});
    }
    if(path==='/api/telegram/search-status'&&request.method==='GET'){
      if(!env.LEAD_STORE)return json({configured:Boolean(env.TELEGRAM_IMPORT_TOKEN),lastSearch:null});
      const result=await store(env).fetch('https://internal/search-report');
      const data=await result.json();
      return json({configured:Boolean(env.TELEGRAM_IMPORT_TOKEN),lastSearch:data.lastSearch||null});
    }
    if(path==='/api/telegram/status'&&request.method==='GET')return telegramStatus(env);
    if(path==='/api/setup/webhook'&&request.method==='POST'){
      if(!permitted(request,env))return json({error:'Unauthorized'},401);
      if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET)return json({error:'Сначала добавь TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET в секреты Worker'},503);
      const endpoint='https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/setWebhook';
      const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({url:new URL('/api/telegram/webhook',request.url).toString(),
          secret_token:env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates:['message','channel_post','edited_message','edited_channel_post'],
          drop_pending_updates:false})});
      const answer=await response.json();
      if(!answer.ok)return json({error:'Telegram: '+(answer.description||'ошибка setWebhook')},502);
      const botResponse=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/getMe');
      const bot=await botResponse.json();
      return json({ok:true,webhook:new URL('/api/telegram/webhook',request.url).toString(),
        botUsername:bot.ok?bot.result?.username:null});
    }
    if(path==='/api/telegram/webhook'&&request.method==='POST')return webhook(request,env);
    if(path==='/api/telegram/import'&&request.method==='POST'){
      const secret=env.TELEGRAM_IMPORT_TOKEN;
      if(typeof secret!=='string'||secret.length<32)return json({error:'Telegram import not configured'},503);
      if(request.headers.get('authorization')!=='Bearer '+secret)return json({error:'Unauthorized'},401);
      const len=Number(request.headers.get('content-length')||0);
      if(len>70000)return json({error:'Payload too large'},413);
      if(!env.LEAD_STORE)return json({error:'Storage unavailable'},503);
      let payload;
      try{payload=await request.json()}catch{return json({error:'Invalid JSON'},400)}
      if(!Array.isArray(payload?.leads)||payload.leads.length>25)return json({error:'Expected <=25 job posts'},400);
      const validUrl=/^https:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})\/([1-9]\d{0,12})$/;
      const validUsername=/^[A-Za-z][A-Za-z0-9_]{4,31}$/;
      const {config:searchConfig}=await getSearchSettings(env);
      const cutoff=Date.now()-searchConfig.maxAgeHours*3600000;
      let saved=0,rejected=0;
      for(const item of payload.leads){
        if(!item||typeof item!=='object'){rejected++;continue}
        const url=typeof item.url==='string'?item.url:'';
        const match=url.match(validUrl);
        const date=Date.parse(String(item.published||''));
        const body=String(item.description||'').trim().slice(0,1500);
        if(!match||!Number.isFinite(date)||date<cutoff||date>Date.now()+300000||body.length<searchConfig.minChars){rejected++;continue}
        const relevance=scoreSearchPost(body,searchConfig);
        if(relevance.score<60){rejected++;continue}
        // Only directly public Telegram message URLs; never persist private messages or numeric user IDs.
        const contactUsername=typeof item.contactUsername==='string'&&validUsername.test(item.contactUsername)?item.contactUsername:null;
        const post={
          id:'search:'+match[1].toLowerCase()+':'+match[2],
          source:'Telegram',sourceChat:typeof item.sourceChat==='string'?item.sourceChat.slice(0,90):match[1],
          title:body.split('\n')[0].slice(0,120),
          description:body,url,published:new Date(date).toISOString(),
          contactUsername,contactUrl:contactUsername?'https://t.me/'+contactUsername:'',
          score:relevance.score,reasons:[relevance.reason],category:'Telegram: публичные объявления'
        };
        const result=await store(env).fetch('https://internal/ingest',{method:'POST',
          body:JSON.stringify(post)});
        if(result.ok)saved++;else rejected++;
      }
      try{await store(env).fetch('https://internal/search-report',{method:'POST',
        body:JSON.stringify({at:new Date().toISOString(),saved,rejected})})}catch{}
      return json({ok:true,saved,rejected});
    }
    if(path==='/api/leads'&&request.method==='GET'){
      if(!env.LEAD_STORE)return json({error:'Telegram storage is not configured'},503);
      const data=await store(env).fetch('https://internal/list');
      const result=await data.json();
      return json({updatedAt:new Date().toISOString(),sources:[{source:'Telegram',status:'ok',count:result.count}],
        leads:result.leads});
    }
    if(path==='/api/leads'&&request.method==='DELETE'){
      if(!permitted(request,env))return json({error:'Unauthorized'},401);
      const data=await request.json();
      return store(env).fetch('https://internal/delete',{method:'POST',body:JSON.stringify({id:data.id})});
    }
    if(path.startsWith('/api/'))return json({error:'Not found'},404);
    return env.ASSETS.fetch(request);
  }
};