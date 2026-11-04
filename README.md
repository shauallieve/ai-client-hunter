# AI Client Hunter — Telegram Edition (публичный режим)

Рабочий MVP для отслеживания **публичных** заявок на разработку из подключённых Telegram-групп и каналов. Интерфейс открыт **без пароля**: [AI Client Hunter](https://ai-client-hunter.kazatu2004-9ed.workers.dev/).

## Что умеет
- Получает новые сообщения через Telegram Bot API (только из доступных боту чатов).
- Находит запросы на сайты, ботов, CRM, веб-приложения и автоматизации по ключевым словам.
- Показывает публичный @username/ссылку для связи, если Telegram их предоставляет.
- Показывает только сообщения с публичной ссылкой формата `https://t.me/<public_chat>/<message_id>` — закрытые чаты не публикуются в общей выдаче.
- Позволяет подготовить персональный отклик, сохранять и скрывать лиды **локально на своём устройстве**.
- Не отправляет автоматически личные сообщения; не ищет по всему Telegram.
- Хранит лиды не более 30 дней.

## Telegram setup

### 1. Получи Telegram-бота
У [@BotFather](https://t.me/BotFather) отправь `/newbot` и получи HTTP API Token. Не пересылай токен другим людям и не добавляй в GitHub.

### 2. Настрой секреты Cloudflare
В Cloudflare Dashboard → Workers & Pages → `ai-client-hunter` → Settings → Variables and Secrets:

- `TELEGRAM_BOT_TOKEN` — **Secret**: токен BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — **Secret**: новая случайная строка 20–60 символов (ASCII-буквы, цифры, `_` и `-`).

`DASHBOARD_TOKEN` **больше не нужен** для просмотра лидов. Его можно оставить для закрытых административных действий; не разглашай. Если ключ был опубликован в чате, создай новый или удали старое значение после проверки необходимости административных функций.

`TELEGRAM_OWNER_ID` — необязательный Telegram ID для приёма пересланных владельцем сообщений в личку боту. Пересылки сохраняются только при наличии доступной публичной ссылки на первоисточник.

`TELEGRAM_ALLOWED_CHATS` — необязательный список chat ID через запятую, чтобы ограничить источники.

### 3. Сборка и публикация Cloudflare Workers
В репозитории настроены `worker.js`, `wrangler.jsonc` и SQLite-backed Durable Object `LeadStore` (отдельную D1 создавать не надо).

GitHub: `shauallieve/ai-client-hunter`, ветка `main`.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root: корень репозитория.

После публикации проверь:
`https://ai-client-hunter.kazatu2004-9ed.workers.dev/api/health`.

В ответе должны быть `mode: "telegram-only"`, `version: "telegram-public-v2"`, `publicAccess: true`, `configured.store: true`.

### 4. Автоматическая установка Telegram webhook
Cloudflare Cron Trigger по расписанию `*/10 * * * *` устанавливает Telegram webhook по адресу:
`https://ai-client-hunter.kazatu2004-9ed.workers.dev/api/telegram/webhook`.

Кнопка «Активировать webhook» больше не требуется. Worker делает это самостоятельно **только если секреты TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET настроены**. При ошибке проверь Cloudflare Worker → Observability/Logs, состояние cron trigger и секреты.

### 5. Добавь бота в нужные Telegram-чаты
Бот должен быть добавлен в соответствующую **публичную** группу или канал с разрешения администратора. В группе для чтения обычных сообщений ему обычно нужны права администратора или отключённый Privacy Mode у @BotFather (`/setprivacy`; после изменения иногда требуется пере-добавление бота). В канале — права администратора. Бот видит только новые сообщения после подключения, а не старую историю.

После получения релевантной заявки открой сайт и нажми «Написать в Telegram» либо «Исходное сообщение». Если автор не публиковал username, прямой контакт может отсутствовать.

## Важные ограничения и приватность
**Сайт теперь публичный.** Любой, у кого есть ссылка, сможет увидеть сохранённые публичные заявки и публичные Telegram-контакты. Не добавляй сюда материалы из частных групп. Запись вебхука защищена Telegram secret token, административные API-операции не открыты для всех. Для приватной базы лидов в будущем следует использовать отдельную авторизацию.

Никогда не публикуй токен BotFather, `TELEGRAM_WEBHOOK_SECRET` или административные ключи.

## Для разработки
```bash
npm install
npm test
npm run build
npx wrangler dev
```
Для публикации `npx wrangler deploy`.
