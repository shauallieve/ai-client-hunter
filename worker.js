// Cloudflare Pages Advanced Mode.
// Vite copies this file from public/ to dist/_worker.js.
// This ensures /api/leads is handled even when Pages Functions directory is not discovered.
const FEEDS = [
  { name: 'Freelancehunt', url: 'https://freelancehunt.com/projects.rss' },
  { name: 'FL.ru', url: 'https://www.fl.ru/rss/all.xml' }
];
const entities = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
function clean(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, m => {
      if (entities[m]) return entities[m];
      if (m.startsWith('&#')) {
        const num = m[2]?.toLowerCase() === 'x' ? parseInt(m.slice(3),16) : parseInt(m.slice(2),10);
        return num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : m;
      }
      return m;
    }).replace(/\s+/g,' ').trim().slice(0,2400);
}
function tag(s, name) {
  const safeName = name.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  const match = s.match(new RegExp('<'+safeName+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+safeName+'>','i'));
  return match ? match[1] : '';
}
function parse(xml, source) {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 90).map((item,i) => {
    const title = clean(tag(item,'title'));
    const description = clean(tag(item,'description') || tag(item,'content:encoded'));
    const url = clean(tag(item,'link'));
    const publishedString = tag(item,'pubDate') || tag(item,'dc:date');
    const parsed = Date.parse(publishedString);
    const published = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
    const budget = (title+' '+description).match(/\d[\d\s,.]{0,12}\s?(?:₸|₽|UAH|USD|EUR|грн|руб|\$)/i)?.[0];
    return {id:source+':'+(url||i),source,title,description,url,published,budget};
  }).filter(item => item.title && /^https?:\/\//.test(item.url));
}
function json(data,status=200) {
  return new Response(JSON.stringify(data), {status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'public, max-age=120',
    'x-content-type-options':'nosniff'
  }});
}
async function getLeads(request) {
  const limit = Math.min(200,Math.max(10,Number(new URL(request.url).searchParams.get('limit'))||80));
  const results = await Promise.all(FEEDS.map(async feed => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8500);
      let response;
      try {
        response = await fetch(feed.url, {
          headers:{Accept:'application/rss+xml, application/xml, text/xml'},
          signal:controller.signal
        });
      } finally {clearTimeout(timeout);}
      if (!response.ok) throw Error('HTTP '+response.status);
      const xml = await response.text();
      if (xml.length>2_000_000) throw Error('RSS слишком большой');
      const leads = parse(xml,feed.name);
      if (!leads.length) throw Error('Нет доступных элементов RSS');
      return {source:feed.name,status:'ok',leads};
    } catch (e) {
      return {source:feed.name,status:e instanceof Error?e.message:'Ошибка',leads:[]};
    }
  }));
  const leads=results.flatMap(r=>r.leads).sort((a,b)=>b.published.localeCompare(a.published)).slice(0,limit);
  return json({updatedAt:new Date().toISOString(),sources:results.map(r=>({source:r.source,status:r.status,count:r.leads.length})),leads});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/api/leads' && request.method==='GET') return getLeads(request);
    if(url.pathname.startsWith('/api/')) return json({error:'API endpoint not found'},404);
    return env.ASSETS.fetch(request);
  }
};