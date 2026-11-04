import {useCallback,useEffect,useMemo,useState} from 'react';
import {Radar,RefreshCw,Search,Bookmark,ExternalLink,Copy,Settings2,Inbox,Clock,MessageCircle,ShieldCheck,Send,LockKeyhole,Trash2,X,CheckCircle2,AlertTriangle} from 'lucide-react';
import type {Lead,Status} from './types';

type TelegramLead=Lead&{sourceChat?:string;contactUsername?:string|null;contactUrl?:string;score:number;reasons?:string[]};
const STATUS_KEY='ach-telegram-status-1',PROFILE_KEY='ach-telegram-profile-1',TOKEN_KEY='ach-dashboard-session';
function saved<T>(key:string,fallback:T):T{try{const value=localStorage.getItem(key);return value?JSON.parse(value) as T:fallback}catch{return fallback}}
const fmtDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.valueOf())?'Без даты':new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(date)};
const defaultProfile='Разрабатываю сайты, Telegram-ботов и автоматизации на React/TypeScript. Могу уточнить задачу, предложить этапы и заранее согласовать стоимость.';
const isTg=(value?:string)=>{try{const u=new URL(value||'');return u.protocol==='https:'&&['t.me','telegram.me'].includes(u.hostname)}catch{return false}};
function leadReply(l:TelegramLead,profile:string){
 return 'Здравствуйте! Увидел ваш запрос: «'+l.title.slice(0,110)+'».\n\n'+
 profile.trim()+'\n\nПодскажите, пожалуйста, задача ещё актуальна? Если да, какие функции нужны в первую очередь и есть ли ориентир по бюджету?\n\nМогу предложить план реализации и стоимость.';
}
export default function App(){
 const [token,setToken]=useState(()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return ''}});
 const [tokenInput,setTokenInput]=useState('');
 const [leads,setLeads]=useState<TelegramLead[]>([]);
 const [sources,setSources]=useState<{source:string;status:string;count:number}[]>([]);
 const [health,setHealth]=useState<{ok:boolean;mode?:string;configured?:{bot:boolean;dashboard:boolean;store:boolean}}|null>(null);
 const [statuses,setStatuses]=useState<Record<string,Status>>(()=>saved(STATUS_KEY,{}));
 const [profile,setProfile]=useState(()=>saved(PROFILE_KEY,defaultProfile));
 const [minScore,setMinScore]=useState(55);
 const [query,setQuery]=useState('');
 const [tab,setTab]=useState<'all'|'saved'|'contacted'>('all');
 const [page,setPage]=useState<'leads'|'settings'>('leads');
 const [sort,setSort]=useState<'score'|'recent'>('recent');
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[updated,setUpdated]=useState('');
 const [selected,setSelected]=useState<TelegramLead|null>(null),[draft,setDraft]=useState('');
 const [setupMessage,setSetupMessage]=useState(''),[botUsername,setBotUsername]=useState('');
 useEffect(()=>{localStorage.setItem(STATUS_KEY,JSON.stringify(statuses))},[statuses]);
 useEffect(()=>{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile))},[profile]);
 useEffect(()=>{void fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth(null))},[]);
 const load=useCallback(async(auth:string)=>{
  if(!auth)return;
  setLoading(true);setError('');
  try{
    const response=await fetch('/api/leads',{headers:{Authorization:'Bearer '+auth,Accept:'application/json'},cache:'no-store'});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('json'))throw new Error('Сервер вернул HTML вместо API. Проверь последний Workers deployment.');
    const data=await response.json();
    if(response.status===401)throw new Error('Неверный ключ панели. Проверь DASHBOARD_TOKEN в Cloudflare.');
    if(!response.ok)throw new Error(data.error||('Ошибка API '+response.status));
    setLeads(Array.isArray(data.leads)?data.leads:[]);
    setSources(data.sources||[]);
    setUpdated(data.updatedAt||'');
  }catch(err){setError(err instanceof Error?err.message:String(err))}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{if(!token)return;void load(token);const timer=setInterval(()=>{if(!document.hidden)void load(token)},60000);return()=>clearInterval(timer)},[token,load]);
 async function setupWebhook(){
  setSetupMessage('Подключаю...');
  try{
   const response=await fetch('/api/setup/webhook',{method:'POST',headers:{Authorization:'Bearer '+token}});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Не удалось подключить webhook');
   setBotUsername(data.botUsername||'');
   setSetupMessage('Webhook активирован. Теперь добавь бота в выбранные Telegram-чаты или перешли ему сообщение.');
   void fetch('/api/health').then(r=>r.json()).then(setHealth);
  }catch(err){setSetupMessage(err instanceof Error?err.message:String(err))}
 }
 function unlock(){const t=tokenInput.trim();if(!t)return;setToken(t);setTokenInput('');try{sessionStorage.setItem(TOKEN_KEY,t)}catch{}}
 function lock(){setToken('');setLeads([]);setError('');try{sessionStorage.removeItem(TOKEN_KEY)}catch{}}
 function mark(id:string,status:Status){setStatuses(s=>({...s,[id]:status}))}
 function reply(l:TelegramLead){setSelected(l);setDraft(leadReply(l,profile))}
 async function copy(){try{await navigator.clipboard.writeText(draft)}catch{setError('Не удалось скопировать. Выдели текст и скопируй вручную.')}}
 async function remove(l:TelegramLead){
  if(!window.confirm('Удалить эту заявку из базы?'))return;
  try{const r=await fetch('/api/leads',{method:'DELETE',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({id:l.id})});if(!r.ok)throw Error('Удаление не удалось');setLeads(items=>items.filter(x=>x.id!==l.id))}catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 const shown=useMemo(()=>leads.filter(l=>(l.score||0)>=minScore)
  .filter(l=>tab==='all'||(tab==='saved'?['saved','contacted','won'].includes(statuses[l.id]):statuses[l.id]==='contacted'))
  .filter(l=>!query||[l.title,l.description,l.sourceChat,l.contactUsername].join(' ').toLowerCase().includes(query.toLowerCase()))
  .sort((a,b)=>sort==='score'?(b.score||0)-(a.score||0):b.published.localeCompare(a.published)),
  [leads,minScore,tab,statuses,query,sort]);
 const contacted=leads.filter(l=>statuses[l.id]==='contacted').length;
 const savedCount=leads.filter(l=>['saved','contacted','won'].includes(statuses[l.id])).length;
 return <div className="min-h-screen bg-base">
  <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">
   <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
    <div className="flex gap-3 items-center"><div className="rounded-2xl bg-accent text-[#10200d] p-3"><Radar size={25}/></div><div>
      <h1 className="text-xl font-extrabold">Client<span className="text-accent">Hunter</span> <span className="text-xs text-muted">Telegram edition</span></h1>
      <p className="text-muted text-xs">Ищи реальные запросы на разработку в Telegram</p></div></div>
    <nav className="flex gap-2"><button className="btn" onClick={()=>setPage('leads')}>Лиды</button><button className="btn" onClick={()=>setPage('settings')}><Settings2 className="inline" size={15}/> Настройки</button></nav>
   </header>
   <section className="rounded-3xl border border-[#34423b] bg-gradient-to-br from-[#1c2925] via-[#111a23] to-[#101623] p-6 md:p-10 mb-6">
    <div className="text-accent text-xs tracking-widest font-bold uppercase mb-3">Telegram · только реальные сообщения</div>
    <h2 className="text-2xl md:text-4xl font-extrabold">Клиенты уже ищут разработчиков.<br/><span className="text-accent">Лови подходящие заявки.</span></h2>
    <p className="text-muted text-sm mt-3 max-w-2xl">Бот отслеживает новые сообщения в подключённых группах и каналах. Показываем автора через публичный @username и ссылку на сообщение, если Telegram их предоставляет. Массовой рассылки нет.</p>
    {token&&<div className="flex gap-2 mt-6 flex-wrap"><button className="btn btn-primary flex gap-2 items-center" onClick={()=>void load(token)} disabled={loading}><RefreshCw size={16}/>{loading?'Проверяю...':'Обновить лиды'}</button><button className="btn" onClick={lock}><LockKeyhole size={15} className="inline"/> Закрыть панель</button></div>}
   </section>
   {health&&<div className="flex gap-2 flex-wrap mb-5 text-xs">
    <span className="tag">API: {health.mode||'неизвестно'}</span>
    <span className="tag">Telegram webhook: {health.configured?.bot?'секреты настроены':'нужно настроить'}</span>
    <span className="tag">Панель: {health.configured?.dashboard?'защищена':'ключ не настроен'}</span>
    <span className="tag">Хранилище: {health.configured?.store?'подключено':'не подключено'}</span>
   </div>}
   {!token?<section className="glass rounded-3xl p-6 md:p-8 max-w-2xl mx-auto space-y-4">
    <div className="flex gap-3 items-center"><ShieldCheck className="text-accent"/><h3 className="text-xl font-bold">Вход в личную панель</h3></div>
    <p className="text-sm text-muted">Введи DASHBOARD_TOKEN, который задаётся в секретах Cloudflare Worker. Он нужен, чтобы заявки и контакты не были открыты всем посетителям сайта.</p>
    <form onSubmit={e=>{e.preventDefault();unlock()}} className="flex gap-2 flex-wrap sm:flex-nowrap">
     <input type="password" className="field" autoComplete="off" placeholder="Секретный ключ панели" value={tokenInput} onChange={e=>setTokenInput(e.target.value)}/>
     <button className="btn btn-primary" type="submit">Войти</button>
    </form>
    <p className="text-xs text-muted">Ключ сохраняется только на время текущей вкладки браузера, а не в публичном коде GitHub.</p>
    <a className="text-accent text-sm underline" target="_blank" rel="noopener noreferrer" href="https://github.com/shauallieve/ai-client-hunter#telegram-setup">Как подключить Telegram-бота</a>
   </section>:page==='settings'?<section className="glass rounded-3xl p-6 md:p-8 max-w-3xl space-y-5">
    <h3 className="text-2xl font-bold">Настройки</h3>
    <label className="block">Минимальная релевантность: <b className="text-accent">{minScore}/100</b><input className="w-full mt-3" type="range" min="0" max="95" value={minScore} onChange={e=>setMinScore(Number(e.target.value))}/></label>
    <label className="block">Твой профиль для откликов<textarea className="field min-h-32 mt-2" value={profile} onChange={e=>setProfile(e.target.value)}/></label>
    <div className="border border-line rounded-2xl p-4 space-y-3">
      <h4 className="font-bold">Подключение Telegram</h4>
      <p className="text-muted text-sm">1. Создай бота через @BotFather. 2. Добавь TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET и DASHBOARD_TOKEN в Secrets Cloudflare Worker. 3. Нажми кнопку ниже.</p>
      <button className="btn btn-primary" onClick={()=>void setupWebhook()}>Активировать Telegram webhook</button>
      {setupMessage&&<p className="text-sm text-accent">{setupMessage}</p>}
      {botUsername&&<a href={'https://t.me/'+botUsername} target="_blank" rel="noopener noreferrer" className="text-accent underline text-sm">Открыть бота @{botUsername}</a>}
      <p className="text-muted text-xs">Для чтения сообщений группы бот должен быть администратором либо иметь отключённый Privacy Mode. Пересланные сообщения в личный чат бота принимаются только от TELEGRAM_OWNER_ID.</p>
    </div>
    <p className="text-muted text-sm">Мониторинг работает только там, где Telegram разрешает боту видеть сообщения. Новые запросы сохраняются автоматически; список обновляется раз в минуту при открытой вкладке.</p>
    <button className="btn btn-primary" onClick={()=>setPage('leads')}>Готово</button>
   </section>:<>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
    {[['Telegram-заявки',leads.length],['С контактом',leads.filter(x=>x.contactUsername).length],['Сохранено',savedCount],['Отклик отправлен',contacted]].map(([label,num])=><div key={label} className="glass rounded-2xl p-4"><div className="text-muted text-xs">{label}</div><div className="text-3xl font-bold mt-2">{num}</div></div>)}</div>
    {error&&<div className="border border-orange-800 rounded-xl p-3 mb-5 text-sm text-orange-200 flex gap-2"><AlertTriangle size={17}/>{error}</div>}
    <div className="flex flex-wrap justify-between gap-2 mb-4"><div className="flex gap-2">
      {([{id:'all',title:'Все'},{id:'saved',title:'Избранное'},{id:'contacted',title:'Откликнулся'}] as const).map(t=><button key={t.id} className={tab===t.id?'btn btn-primary':'btn'} onClick={()=>setTab(t.id)}>{t.title}</button>)}</div>
      <select className="field !w-auto" value={sort} onChange={e=>setSort(e.target.value as 'score'|'recent')}><option value="recent">Новые сверху</option><option value="score">Сначала подходящие</option></select></div>
    <div className="relative mb-3"><Search className="absolute top-3 left-3 text-muted" size={18}/><input className="field !pl-10" placeholder="Найти по тексту, чату или контакту" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <p className="text-muted text-xs mb-4">Показано {shown.length} из {leads.length} · {updated?'Обновлено '+fmtDate(updated):'Ожидание'} {sources.map(s=>'· '+s.source+': '+s.count).join(' ')}</p>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
     <div className="space-y-3">{shown.length?shown.map(l=><article className="glass rounded-2xl p-5" key={l.id}>
      <div className="flex justify-between items-start gap-3"><div className="min-w-0">
       <div className="flex gap-2 flex-wrap mb-3"><span className="tag">Telegram</span><span className="tag">{l.sourceChat||'Чат'}</span></div>
       <h3 className="font-bold text-lg">{l.title}</h3>
       <p className="text-muted text-sm mt-2 leading-6 whitespace-pre-line line-clamp-5">{l.description}</p>
      </div><div className="rounded-xl bg-[#202c26] shrink-0 px-3 py-2 text-center"><b className="text-accent text-xl">{l.score}</b><div className="text-[10px]">совпадение</div></div></div>
      <div className="mt-4 rounded-xl bg-[#0a121c] border border-line p-3 flex flex-wrap justify-between items-center gap-3">
        {l.contactUsername&&isTg(l.contactUrl)?<a className="text-accent font-semibold text-sm" href={l.contactUrl} target="_blank" rel="noopener noreferrer">@{l.contactUsername} · Написать в Telegram</a>:
        <span className="text-muted text-xs">Прямой контакт не опубликован</span>}
        <span className="text-muted text-xs flex gap-1 items-center"><Clock size={12}/>{fmtDate(l.published)}</span>
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
       {isTg(l.url)&&<a className="btn text-xs flex items-center gap-1" href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>Исходное сообщение</a>}
       <button className="btn text-xs flex items-center gap-1" onClick={()=>mark(l.id,statuses[l.id]==='saved'?'new':'saved')}><Bookmark size={14}/>{statuses[l.id]==='saved'?'Сохранено':'Сохранить'}</button>
       <button className="btn text-xs flex items-center gap-1" onClick={()=>reply(l)}><MessageCircle size={14}/>Подготовить отклик</button>
       <button title="Удалить" className="btn text-xs" onClick={()=>void remove(l)}><Trash2 size={14}/></button>
      </div>
     </article>):<div className="glass rounded-2xl p-10 text-center"><Inbox className="mx-auto text-muted mb-3" size={38}/><b>Пока нет Telegram-заявок</b><p className="text-muted text-sm mt-2">Проверь настройку бота, добавь его в чат с заказами или перешли ему публичный запрос самостоятельно.</p></div>}</div>
     <aside className="glass rounded-2xl p-5 lg:sticky lg:top-4 space-y-3"><h3 className="font-bold flex gap-2 items-center"><Send size={18} className="text-accent"/> Как поступают заявки?</h3>
       <p className="text-muted text-sm leading-6">1. Бот получает новое сообщение в подключённом чате.</p>
       <p className="text-muted text-sm leading-6">2. Если это запрос на разработку, сохраняет его.</p>
       <p className="text-muted text-sm leading-6">3. Ты открываешь автора или исходный пост и отвечаешь вручную.</p>
       <p className="text-muted text-xs border-t border-line pt-4">Telegram Bot API не умеет искать по всему Telegram и не раскрывает скрытые аккаунты. Сообщения сохраняются не более 30 дней.</p>
       <a className="text-accent underline text-sm" href="https://github.com/shauallieve/ai-client-hunter#telegram-setup" target="_blank" rel="noopener noreferrer">Инструкция подключения</a>
     </aside></div>
   </>}
   <footer className="text-muted text-xs pt-10 pb-6">AI Client Hunter · Telegram-only · Без массовой отправки сообщений</footer>
  </main>
  {selected&&<div className="fixed inset-0 bg-black/80 z-50 p-3 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
   <div className="glass rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
    <div className="flex justify-between gap-3"><h3 className="text-xl font-bold">Отклик клиенту</h3><button className="btn" onClick={()=>setSelected(null)}><X size={17}/></button></div>
    <p className="text-muted text-sm my-3">{selected.title}</p><textarea className="field min-h-64" value={draft} onChange={e=>setDraft(e.target.value)}/>
    <div className="flex gap-2 flex-wrap mt-4"><button className="btn btn-primary flex items-center gap-2" onClick={()=>void copy()}><Copy size={15}/>Копировать</button>
    {selected.contactUrl&&isTg(selected.contactUrl)&&<a className="btn" href={selected.contactUrl} target="_blank" rel="noopener noreferrer">Написать автору</a>}
    <button className="btn flex items-center gap-1" onClick={()=>{mark(selected.id,'contacted');setSelected(null)}}><CheckCircle2 size={15}/>Отметить отправленным</button></div>
    <p className="text-xs text-muted mt-3">Ты сам проверяешь текст и отправляешь сообщение. Приложение не рассылает сообщения людям.</p>
   </div></div>}
 </div>;
}