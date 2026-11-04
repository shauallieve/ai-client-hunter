import type {Lead,Preferences} from './types';
const groups:{name:string;terms:string[]}[]=[
{name:'Сайты и лендинги',terms:['сайт','сайта','лендинг','landing','website','wordpress','веб-сайт','інтернет-магазин','інтернет магазин','web app','frontend','react','верстк','вёрстк','интернет-магазин','shopify']},
{name:'Telegram-боты',terms:['телеграм','telegram','бота','бот ','бот,','bot ','чат-бот','чатбот']},
{name:'Автоматизация',terms:['автоматизац','automation','интеграц','integration','api','n8n','make.com','zapier','google sheets','таблиц','парсер','скрипт']},
{name:'CRM и веб-приложения',terms:['crm','срм','личный кабинет','админ-панел','админк','dashboard','дашборд','веб-приложен','web application','supabase','база данных','бази даних','saas']}
];
const positive=['нужно','нужен','требуется','ищем','ищу','сделать','создать','разработ','доработ','проект','заказ','потрібно','шукаємо','створити','розроб','looking for','need','hiring','build'];
const unqualified=['ищу работу','ищу заказ','резюме','продам услуги','предлагаю услуги','курс по','обучение программированию'];
const unique=(s:string)=>Array.from(new Set(s.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)));
export function classify(lead:Lead,prefs:Preferences):Lead{
const text=`${lead.title} ${lead.description}`.toLowerCase();let score=12;const reasons:string[]=[];let category='Другое';let matches=0;
for(const group of groups){if(!prefs.services.includes(group.name))continue;const hits=group.terms.filter(w=>text.includes(w));if(hits.length){score+=Math.min(45,23+hits.length*7);matches++;if(category==='Другое')category=group.name;reasons.push(`${group.name}: ${hits.slice(0,3).join(', ')}`)}}
if(matches>1)score+=7;if(positive.some(t=>text.includes(t))){score+=17;reasons.push('Есть формулировка задачи/заказа')}
if(lead.budget){score+=9;reasons.push('Указан бюджет')}
if(unique(prefs.keywords).some(w=>text.includes(w))){score+=12;reasons.push('Совпало дополнительное ключевое слово')}
const excluded=unique(prefs.exclude).filter(w=>text.includes(w));if(excluded.length){score-=42;reasons.push('Встречается исключение: '+excluded.slice(0,2).join(', '))}
if(unqualified.some(t=>text.includes(t))){score-=60;reasons.push('Возможное предложение услуг, а не заказ')}
if(category==='Другое'){score=Math.min(score,20);reasons.push('Нет совпадений с выбранными услугами')}
const age=(Date.now()-new Date(lead.published).getTime())/86400000;if(Number.isFinite(age)&&age>14){score-=15;reasons.push('Объявление старше 14 дней')}
return {...lead,score:Math.min(100,Math.max(0,score)),reasons,category};
}
export function dedupe(leads:Lead[]):Lead[]{const ids=new Set<string>();return leads.filter(l=>{const key=(l.url||l.title.toLowerCase().trim()).replace(/\/$/,'');if(ids.has(key))return false;ids.add(key);return true})}
export function draftReply(lead:Lead,profile:string):string{return `Здравствуйте! Увидел вашу задачу «${lead.title}».\n\nМогу помочь с реализацией. ${profile.trim()}\n\nЧтобы оценить сроки и стоимость, уточните, пожалуйста: есть ли техническое задание или пример желаемого результата, какие функции обязательны в первой версии и какой ориентир по бюджету?\n\nПосле уточнения предложу объём работ и этапы. Спасибо!`}
export function safeUrl(raw:string){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.toString():''}catch{return ''}}
