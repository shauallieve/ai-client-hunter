# AI Client Hunter

MVP для поиска опубликованных заказов на сайты, Telegram-ботов, CRM и автоматизации.

**Стек:** React, TypeScript, Tailwind CSS, Vite, Cloudflare Pages Functions.

## Возможности
- Загрузка из публичных RSS Freelancehunt и FL.ru (при доступности).
- Оценка соответствия по ключевым словам (без AI API).
- Поиск, сортировка, избранное и статусы откликов.
- Ручное добавление ссылок из Threads/Telegram.
- Редактируемые черновики ответов и экспорт CSV.
- Локальное сохранение настроек, статусов и ручных объявлений.

## Локальный запуск

Нужен Node.js 20+.

```bash
npm install
npm run dev
```

Для проверки серверного API Cloudflare Pages:

```bash
npm run build
npx wrangler pages dev dist --port 8788
```

Открой http://localhost:8788.

## Публикация на Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → Create application → Pages.
2. Импортируй этот GitHub-репозиторий.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Production branch: `main`.
6. Серверная функция: `functions/api/leads.ts`.

После публикации проверь /api/leads. Источники могут быть недоступны или изменить формат, поэтому приложение отображает состояние каждой ленты.

## Ограничения

Рейтинг — эвристическое совпадение слов, не вероятность заключения сделки. Автоматический мониторинг Telegram/Threads и автоматическая отправка сообщений отсутствуют. Актуальность любого заказа нужно проверять на исходной площадке. Состояние хранится локально в браузере; серверной авторизации нет.

Полная production-сборка в среде генерации не была подтверждена. Проверь `npm install` и `npm run build` до публичного использования.


## ВАЖНО: развёртывание на workers.dev

Этот проект настроен как **Cloudflare Worker со статическими ассетами**.
Конфигурация `wrangler.jsonc` указывает точку входа `worker.js`,
папку собранного Vite-приложения `dist` и отдельный API-маршрут `/api/leads`.

Если проект привязан к GitHub в **Workers & Pages → ai-client-hunter → Settings → Builds**,
укажи:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/` (корень репозитория).

Проверка после публикации:
1. Открой `https://<your-worker>.workers.dev/api/leads`.
2. Должен появиться JSON с ключами `updatedAt`, `sources`, `leads`.
3. Если `sources` содержит ошибки, значит API работает, но внешние RSS могут быть недоступны.
4. Если вместо JSON отображается HTML, Cloudflare использует старый deployment или неверные команды сборки.

Для ручной публикации из корня репозитория:
```bash
npm install
npm run build
npx wrangler deploy
```

Если Workers автоматически публикуется из GitHub, после изменения настроек
в Cloudflare запусти redeploy последнего коммита.
