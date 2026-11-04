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


## Automatic public job search

Дополнительный **ограниченный поиск** свежих объявлений о разработке через Telegram API пользовательского аккаунта. Это не BotFather: обычный бот Telegram не может искать по всему мессенджеру. Модуль не вступает в чаты и не отправляет личные сообщения. Поиск Telegram не гарантирует полноты и может возвращать только доступные аккаунту результаты.

**Правила платформы:** [Telegram API Terms](https://core.telegram.org/api/terms) и [Telegram Content Licensing](https://telegram.org/tos/content-licensing) ограничивают сбор и повторное использование содержимого каналов и групп, особенно массовый скрейпинг. Не используй модуль для создания больших баз сообщений или обхода ограничений. Аккаунт может получить ограничения. Модуль запрашивает до 18 результатов по пяти поисковым запросам за запуск, передаёт не более 25 свежих публичных объявлений и не читает закрытые чаты.

### 1. Получи API ID и API hash

Открой https://my.telegram.org/apps и создай приложение Telegram API для пользовательского аккаунта. Получи API ID и API hash. **Это не токен BotFather.** Не публикуй их.

### 2. Авторизуй аккаунт один раз локально

Нужен Python 3.10+ и терминал на своём компьютере:

    git clone https://github.com/shauallieve/ai-client-hunter.git
    cd ai-client-hunter
    python -m pip install -r requirements-monitor.txt
    python scripts/telegram_login.py

Скрипт запросит API ID, API hash, код Telegram и при необходимости пароль двухфакторной аутентификации. Создаст локальный файл .telegram_session.txt. **Этот файл даёт доступ к твоему Telegram-аккаунту!** Он указан в .gitignore. Не коммить и не присылай его. Рекомендуется использовать отдельный аккаунт для ограниченного поиска, если не хочешь рисковать основным. При утечке отзови сессию в настройках Telegram.

### 3. GitHub Actions Secrets

В репозитории shauallieve/ai-client-hunter → Settings → Secrets and variables → Actions → New repository secret создай:

| Secret | Value |
|---|---|
| TELEGRAM_API_ID | Числовой API ID из my.telegram.org |
| TELEGRAM_API_HASH | API hash из my.telegram.org |
| TELEGRAM_SESSION | Содержимое локального .telegram_session.txt |
| TELEGRAM_IMPORT_TOKEN | Новый случайный ключ 32+ символов, отличный от других Telegram секретов |

После копирования в секрет GitHub удали .telegram_session.txt на компьютере.

### 4. Cloudflare Worker Secret

Cloudflare → Workers & Pages → ai-client-hunter → Settings → Variables and Secrets:

- Name: **TELEGRAM_IMPORT_TOKEN**
- Type: **Secret**
- Value: **тот же** новый случайный ключ, что и в GitHub.

Сохрани и опубликуй обновлённый Worker. Не добавляй ключ в Build variables — он нужен выполняющемуся Worker. Внешний POST /api/telegram/import защищён ключом; публичное чтение GET /api/leads доступно без авторизации.

### 5. Запусти поиск

GitHub → Actions → **Search Telegram public job posts** → **Run workflow**.

После настройки GitHub Actions автоматически запускает поиск в 17 и 47 минут каждого часа (UTC), примерно раз в полчаса. GitHub может задерживать запуски. Отбираются свежие релевантные публичные публикации с адресом формата https://t.me/public_chat/12345 и доступным публичным контактом, если он указан.

Проверка статуса:
https://ai-client-hunter.kazatu2004-9ed.workers.dev/api/telegram/search-status

- configured: true — Worker видит ключ импорта.
- lastSearch — дата последней успешной загрузки. До первого импорта может быть null.

Сайт:
https://ai-client-hunter.kazatu2004-9ed.workers.dev/

### Ограничения

- Модуль **не сканирует весь Telegram** и **не гарантирует** нахождение всех заказов.
- Telegram может ограничивать глобальный поиск, автоматизированные запросы и API-аккаунты.
- Не обходи ограничения групп, не собирай содержимое приватных чатов и не рассылай массовые сообщения.
- Сайт публичный: собранные открытые объявления видны всем посетителям.
- Никому не отправляй API hash, строку сессии и секрет импорта.


### Если GitHub Actions пишет "unpack requires a buffer of 275 bytes"

Это означает, что секрет **TELEGRAM_SESSION** не соответствует формату Telethon StringSession — скорее всего, скопирован не полностью или перепутан с BotFather-токеном / API hash. Cloudflare и Telegram webhook здесь ни при чём.

Открой GitHub Codespaces, в котором выполнялся скрипт авторизации. Если файл `.telegram_session.txt` остался, открой его командой `code .telegram_session.txt`; скопируй **всё содержимое одной строкой** (без кавычек, имени файла и поясняющих сообщений). Если файл удалён — повтори `python3 scripts/telegram_login.py` и снова авторизуй аккаунт.

В GitHub → Settings → Secrets and variables → Actions обнови значение секрета `TELEGRAM_SESSION` (имя без изменений), затем снова запусти Workflow `Search Telegram public job posts`. Не публикуй строку сессии. Если сессия утекла, отзови её в Telegram → Settings → Devices.

В скрипте теперь есть проверка целостности session string, поэтому следующая ошибка будет понятнее.


### Исправление Cloudflare HTTP 403 при GitHub Actions

Если поиск успешно выполняется, но лог содержит **Cloudflare import failed: HTTP 403**, причина может быть в Cloudflare Browser Integrity Check на домене **workers.dev**. По документации Cloudflare стандартный User-Agent библиотеки Python urllib может блокироваться до запуска Worker, и такой блок не всегда виден в логах приложения:
https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/

В скрипте начиная с версии **1.1** используется описательный заголовок User-Agent. Для применения исправления повторно запусти workflow из актуальной ветки **main**.

Если ошибка сохранится, новая диагностика выведет **Content-Type** и **CF-Ray** (не токены). Если тело ошибки — HTML, а не JSON Worker, проверь Cloudflare Security Events. На workers.dev некоторые блокировки Browser Integrity Check нельзя отключить настройками зоны. В таком случае переведи Worker на собственный домен в Cloudflare и настрой исключение безопасности только для конкретного API-маршрута, сохраняя проверку TELEGRAM_IMPORT_TOKEN в самом Worker; **не отключай безопасность всего сайта**.

Коды Worker API:
- 200 — импорт обработан (даже если 0 объявлений).
- 401 — неверный TELEGRAM_IMPORT_TOKEN.
- 503 — ключ импорта или хранилище ещё не настроены.
- 403 — не формируется текущим приложением, ищи внешний блок.

Если в логе показано **selected=0**, это означает, что фильтры не нашли подходящие доступные публичные объявления. Лог теперь выводит только агрегированные счётчики без персональных данных: **results**, **recent**, **job-like**, **public-source**, **selected**. Глобальный поиск Telethon не гарантирует охват всех чужих Telegram-групп.


## Настройки поиска прямо на сайте (новая функция)

Теперь поисковые запросы и фильтры не зашиты в код. Cloudflare Durable Object хранит настройки, а GitHub Actions читает их перед **каждым** запуском.

1. В Cloudflare → Workers & Pages → **ai-client-hunter** → Settings → Variables and Secrets добавь секрет **SEARCH_ADMIN_TOKEN** (отдельный от других токенов).
2. Значение можно сгенерировать **в браузерном GitHub Codespaces** командой:
   
       python3 -c "import secrets; print(secrets.token_hex(32))"
   
   Скопируй значение только в Cloudflare Worker Runtime Secret. Не добавляй в исходники, GitHub Actions или чат.
3. Опубликуй последнюю версию Worker, если Cloudflare не обновился автоматически.
4. Открой https://ai-client-hunter.kazatu2004-9ed.workers.dev/ → **Настройки → Твои критерии поиска Telegram-заказов**.
5. Введи **поисковые фразы (каждая с новой строки)**, например:
   
       нужен сайт
       кто сделает лендинг
       ищем разработчика
       автоматизация бизнеса
       нужна CRM
       заказать Telegram бота

6. Список **«Слова по тематике»** задаёт дополнительные слова, любое из которых должно встречаться в объявлении. Поле можно полностью очистить, чтобы отключить этот фильтр.
7. Список **«Признаки заказа»** аналогично задаёт слова вроде «нужно», «ищем»; очисти, если нужны более широкие результаты.
8. В **«Исключения»** добавь фразы вроде «ищу работу», «предлагаю услуги», «курс».
9. Выбери свежесть в часах (12–168), минимальную длину текста, лимит сообщений на запрос и лимит лидов на запуск.
10. Введи секрет **SEARCH_ADMIN_TOKEN** только в поле на сайте и нажми **«Сохранить критерии»**.

**Сайт остаётся открытым без пароля:** список публичных лидов и поисковые настройки видны всем; **менять** критерии может только обладатель ключа. Ключ не сохраняется в localStorage и не включается в GitHub.

После сохранения GitHub Actions **автоматически использует** настройки в следующем поиске, обычно в пределах 30 минут, но GitHub может задерживать запуск. Для немедленного ручного запуска нажми на сайте «Запустить поиск сейчас в GitHub» → **Run workflow**. Сам сайт пока не вызывает GitHub Actions напрямую: это потребовало бы отдельного привилегированного токена GitHub, который специально не добавлен для безопасности.

Для проверки:
- https://ai-client-hunter.kazatu2004-9ed.workers.dev/api/telegram/search-config — показывает текущие **не секретные** критерии.
- https://ai-client-hunter.kazatu2004-9ed.workers.dev/api/telegram/search-status — показывает последний импорт.

Результаты Telegram по-прежнему могут быть неполными: новые критерии позволяют управлять **доступным поиском**, но не дают доступа ко всем закрытым группам или скрытым контактам.
