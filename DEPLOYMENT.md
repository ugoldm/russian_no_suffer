# Публикация на GitHub Pages с Supabase

Инструкция для первого запуска, 11 октября 2026 года. GitHub Pages размещает интерфейс; Supabase хранит тесты, ответы, результаты и обеспечивает авторизацию. Установочный SQL предназначен только для новой пустой базы.

Репозиторий: https://github.com/ugoldm/russian_no_suffer

Ожидаемый адрес после успешной публикации: https://ugoldm.github.io/russian_no_suffer/

## 1. Подготовить локальные файлы

Нужен Node.js 24. В терминале:

```sh
cd /Users/ugoldm/Documents/ChatGPT/russian_no_suffer
npm ci
npm run supabase:setup
```

Создаётся `imports/setup/supabase-init.sql`. Папки `imports/` и `materials/` находятся только на этом компьютере и исключены из Git: с чистого клона учебные материалы импортировать не получится без их локальных копий.

## 2. Создать Supabase-проект

В https://supabase.com/dashboard выберите New project, задайте имя, регион и надёжный пароль базы. Сохраните пароль отдельно. Не добавляйте платные услуги, если они не нужны для выбранного тарифа и нагрузки.

После создания скопируйте Project URL и publishable key из настроек проекта/API. Publishable key предназначен для браузера; пароль базы, secret key и service_role для сайта не используются.

Источник: https://supabase.com/docs/guides/getting-started/api-keys

## 3. Создать структуру базы одним запросом

Откройте `imports/setup/supabase-init.sql`, скопируйте весь текст в Supabase → SQL Editor → New query и нажмите Run.

Файл объединяет миграции 001–012 в общей транзакции. Он создаёт структуру, серверные функции и демонстрационный тест. Настройки Auth и реальные учебные тесты настраиваются отдельно. При ошибке откатите незавершённую транзакцию командой `rollback;` при необходимости и разберите сообщение, прежде чем повторять установку. Повторная установка в уже настроенную базу блокируется.

Не добавляйте схему `private` в Exposed schemas. Приложение работает через функции в `public`, а закрытые таблицы и ключи остаются в `private`.

Чтобы увидеть таблицы в Database → Tables или Schema Visualizer, выберите в списке схем **private** вместо **public**. Пустая схема public и сообщение установки «Success. No rows returned» ожидаемы.

## 4. Настроить вход ученика и преподавателя

В Authentication включите Email и Anonymous Sign-Ins. Анонимный вход даёт ученику техническую сессию без email и пароля.

В Authentication → Users → Add user → Create new user создайте аккаунт преподавателя с его рабочей почтой и надёжным паролем. Приложение использует вход по email и паролю. Включите Auto Confirm User / подтверждение email и скопируйте UUID созданного пользователя. Если аккаунт уже создан с паролем и подтверждённым email, используйте его и прежний UUID. Пароль преподавателя — отдельный пароль аккаунта Auth, а не пароль базы данных.

В SQL Editor выполните, заменив placeholder настоящим UUID:

```sql
insert into private.teachers(user_id)
values ('UUID_ПРЕПОДАВАТЕЛЯ')
on conflict do nothing;
```

Аккаунт без этой записи не получает доступ к кабинету. Не отключайте возможность анонимных регистраций ученика при настройке Auth.

В Authentication → URL Configuration задайте Site URL и разрешённый Redirect URL:

```text
https://ugoldm.github.io/russian_no_suffer/
```

Для локальной проверки можно дополнительно разрешить `http://127.0.0.1:5173/`.

Источники: https://supabase.com/docs/guides/auth/auth-anonymous и https://supabase.com/docs/guides/auth/passwords

## 5. Вход без писем

Настройку SMTP и шаблонов писем можно пропустить. Преподаватель вводит email и пароль; Supabase Auth проверяет их и создаёт сессию. Email подтверждается администратором через Auto Confirm User при создании аккаунта. Отключать подтверждение email для всего проекта не требуется.

Если аккаунт уже создан, используйте заданный при его создании пароль. Пароль не добавляется в GitHub variables, `.env` или SQL-импорты. Восстановление пароля через письмо в приложении отсутствует; управление аккаунтом остаётся у администратора Supabase.

Источник: https://supabase.com/docs/guides/auth/passwords

## 6. Импортировать учебные тесты

В том же терминале сохраните UUID преподавателя в переменную:

```sh
teacher_uuid='UUID_ПРЕПОДАВАТЕЛЯ'
```

Замените значение настоящим UUID, затем выполните:

```sh
npm run import:sql -- imports/ege-9/test.json "$teacher_uuid" imports/setup/ege-9.sql
npm run import:sql -- imports/ege-1-3/test.json "$teacher_uuid" imports/setup/ege-1-3.sql
npm run import:sql -- imports/ege-10/test.json "$teacher_uuid" imports/setup/ege-10.sql
npm run import:sql -- imports/ege-11/test.json "$teacher_uuid" imports/setup/ege-11.sql
npm run import:sql -- imports/ege-12/test.json "$teacher_uuid" imports/setup/ege-12.sql
npm run import:sql -- imports/ege-13/test.json "$teacher_uuid" imports/setup/ege-13.sql
npm run import:sql -- imports/ege-15/test.json "$teacher_uuid" imports/setup/ege-15.sql
npm run import:sql -- imports/ege-16/test.json "$teacher_uuid" imports/setup/ege-16.sql
npm run import:sql -- imports/ege-17/test.json "$teacher_uuid" imports/setup/ege-17.sql
npm run import:sql -- imports/ege-18/test.json "$teacher_uuid" imports/setup/ege-18.sql
npm run import:sql -- imports/ege-19/test.json "$teacher_uuid" imports/setup/ege-19.sql
npm run import:sql -- imports/ege-20/test.json "$teacher_uuid" imports/setup/ege-20.sql
npm run import:sql -- imports/ege-21-commas/test.json "$teacher_uuid" imports/setup/ege-21-commas.sql
npm run import:sql -- imports/ege-21-dash-colon/test.json "$teacher_uuid" imports/setup/ege-21-dash-colon.sql
npm run import:sql -- imports/ege-23-26/test.json "$teacher_uuid" imports/setup/ege-23-26.sql
npm run import:sql -- imports/oge-5/test-commas-quotes.json "$teacher_uuid" imports/setup/oge-5-commas-quotes.sql
npm run import:sql -- imports/oge-5/test-dash-colon.json "$teacher_uuid" imports/setup/oge-5-dash-colon.sql
npm run import:sql -- imports/oge-8/test.json "$teacher_uuid" imports/setup/oge-8.sql
npm run import:sql -- imports/oge-9/test.json "$teacher_uuid" imports/setup/oge-9.sql
npm run import:sql -- imports/oge-11/test.json "$teacher_uuid" imports/setup/oge-11.sql
npm run import:sql -- imports/oge-10-12/test.json "$teacher_uuid" imports/setup/oge-10-12.sql
```

Проверьте, что каждая команда завершилась успешно. Откройте каждый из созданных файлов в `imports/setup/`, скопируйте целиком в SQL Editor и выполните. `supabase-init.sql` повторно не выполнять. При первом запуске можно выполнить один учебный импорт, проверить сервис, затем добавить остальные тем же способом.

Команды берут актуальные подготовленные версии, включая версию 4 ОГЭ № 10–12. Повторный импорт идентичной версии допустим; изменение содержания требует новой версии.

ЕГЭ № 1–3 (15 октября 2026 года) подготовлен в `imports/setup/ege-1-3.sql`: все шесть текстов, 18 ответов, 30–40 минут. Для исходного жирного выделения слов требуется текущая версия frontend с общим `ReadingPassage` и поддержкой `passageHighlights`; SQL сохраняет выделения, а отображает их frontend. Новая миграция базы для этого поля JSON не требуется. Удалённый импорт и публикация интерфейса в рамках подготовки теста не выполнялись.

SQL содержит ключи ответов и остаётся в закрытой папке `imports/`. Исходные PDF не нужны на сайте. Прежние работы из локальной SQLite-базы не переносятся этим импортом; для них нужен отдельный перенос. Ссылки ученикам копируйте уже на опубликованном сайте.

## 7. Настроить Turnstile

Перед выдачей сайта ученикам настройте защиту анонимного входа. В Cloudflare создайте Turnstile widget, добавьте hostname `ugoldm.github.io` (без протокола и пути), получите Site key и Secret key.

В Supabase → Authentication → Bot and Abuse Protection включите CAPTCHA, выберите Turnstile и сохраните Secret key. В GitHub на следующем шаге добавьте Site key в `VITE_TURNSTILE_SITE_KEY`. Виджет уже поддерживается приложением. Обычный сайт при этом размещается на GitHub Pages.

Для первичной проверки CAPTCHA можно ещё не включать. Если она включена в Supabase, frontend должен иметь соответствующий Site key и разрешённый hostname, иначе вход будет отклонён.

Источники: https://supabase.com/docs/guides/auth/auth-captcha и https://developers.cloudflare.com/turnstile/get-started/widget-management/

## 8. Настроить GitHub Pages

В репозитории Settings → Secrets and variables → Actions → Variables создайте Repository variables:

| Название | Значение |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Публичный publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Публичный Site key, если CAPTCHA включена |

Путь: https://github.com/ugoldm/russian_no_suffer/settings/variables/actions

`VITE_APP_MODE=supabase` и `VITE_BASE_PATH=/russian_no_suffer/` уже задаются workflow. Вручную добавлять эти две переменные не нужно. `.env.local` не передаётся в GitHub Actions.

В Settings → Pages → Build and deployment → Source выберите GitHub Actions:
https://github.com/ugoldm/russian_no_suffer/settings/pages

GitHub Free поддерживает Pages для публичных репозиториев; для приватного репозитория нужен план с поддержкой Pages. Не меняйте видимость репозитория, не проверив его содержимое.

Источник: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 9. Отправить файлы и запустить публикацию

Новые локальные файлы установщика и документация должны попасть в GitHub. Сначала проверьте список изменений:

```sh
git status --short
```

Для подготовленных в этой беседе файлов:

```sh
git add AGENTS.md README.md DEPLOYMENT.md package.json scripts/supabase-setup.mjs src/api.ts src/App.tsx tests/password-auth.test.mjs
git commit -m "Simplify deployment and use password login for teachers"
git push origin main
```

Если эти изменения уже отправлены, повторный коммит не нужен. Учебные материалы, SQL-импорты, `.env.local` и `.local` в Git не добавлять.

Push в `main` запускает workflow автоматически. Либо откройте Actions → Publish static interface → Run workflow → main:
https://github.com/ugoldm/russian_no_suffer/actions

Дождитесь успешных заданий `build` и `deploy`. Workflow устанавливает зависимости, запускает проверки, собирает приложение в режиме Supabase и публикует только `dist`. Публичный адрес берите из результата `deploy` или Settings → Pages; ожидается https://ugoldm.github.io/russian_no_suffer/.

## 10. Проверить сервис

1. Откройте сайт и убедитесь, что он предлагает вход по email и паролю, а не демонстрационный кабинет.
2. Проверьте отказ при неверном пароле, затем войдите с email и правильным паролем созданного преподавателя.
3. Проверьте каталог и ключи в «Тест и ответы».
4. Нажмите «Поделиться ссылкой» и откройте её на телефоне в другом браузере. Ссылка должна содержать опубликованный домен и `#/test/…`.
5. Введите тестовое имя, выберите день и время группы, начните работу.
6. Введите несколько ответов и обновите страницу: черновик должен восстановиться.
7. Проверьте, что сдача с пропусками запрещена; заполните ответы и завершите тест.
8. Проверьте итог ученика и появление работы в кабинете преподавателя, совпадение оценки, группы, времени и разбора ответов.
9. Проверьте скрытие и восстановление работы и повторное открытие результата.

Публикация считается проверенной после выполнения этих шагов на реальном адресе. Зелёный workflow подтверждает сборку и загрузку сайта, но не всю настройку Auth, CAPTCHA и импортов.

## Если возникла ошибка

| Симптом | Что проверить |
| --- | --- |
| `Configure Supabase repository variables before publishing` | Созданы ли две обязательные Repository variables во вкладке Variables |
| 404 / сайт без оформления | Успешный deploy, адрес с `/russian_no_suffer/`, соответствующий base в workflow |
| Демонстрационный кабинет или обращение к локальному API | Опубликована ли сборка из текущего workflow в режиме Supabase |
| Неверный email или пароль | Почту аккаунта и пароль, заданный при создании пользователя Auth |
| Email преподавателя не подтверждён | Подтверждение аккаунта администратором, Auto Confirm User при создании |
| Вход есть, кабинет недоступен | Наличие правильного UUID в `private.teachers` |
| Вход ученика отклонён | Anonymous Sign-Ins, CAPTCHA Secret/Site key, hostname и лимиты Auth |
| В каталоге только демотест | Выполнены ли SQL-импорты реальных тестов для нужного UUID |
| `База уже настроена` | Не запускать установку повторно; применять только новые миграции |
| Ошибка отправки работы | Состояние Supabase, соединение, миграции; сохранить черновик и повторить отправку |

## Дальнейшие обновления

Для ЕГЭ № 13 актуален `imports/setup/ege-13.sql` версии 2 с перемешанным порядком тех же 20 упражнений. Он добавляет новую версию, сохраняя версию 1 и её работы; `ege-13-v1.sql` оставлен для истории. В локальный каталог версия 2 добавлена, удалённый импорт не выполнялся.

Для «ЕГЭ. Задания № 9–12» (четыре упражнения, 20 задач с выбором вариантов) подготовлен `imports/setup/ege-9-12.sql`. Генерация для нужного преподавателя: `npm run import:sql -- imports/ege-9-12/test.json UUID_ПРЕПОДАВАТЕЛЯ imports/setup/ege-9-12.sql`. Используются существующие миграции групповых заданий. SQL дважды исполнен в изолированной PostgreSQL-базе; 640 случаев оценки совпали с локальным сервером. Версия 1 добавлена локально; выполнение SQL в Supabase и публикация изменений интерфейса не выполнялись.

Изменения интерфейса публикуются после push в `main`. GitHub Actions не обновляет базу и не импортирует тесты. Для изменения структуры применять только новые SQL-миграции; для новых материалов генерировать и выполнять SQL-импорт. `supabase-init.sql` используется только при первом создании базы.

### ОГЭ № 6: импорт четырёх тестов

Готовый единый файл для существующей настроенной базы — `imports/setup/oge-6-tests-1-4.sql`. Выполнить целиком в Supabase SQL Editor: одна транзакция добавляет четыре опубликованные версии по 15 заданий с выбором вариантов. Файл подготовлен для того же преподавателя, что и прежний импорт ОГЭ № 9; повторное выполнение не создаёт дублей и сохраняет существующие тесты и работы. Дополнительные изменения frontend для этого формата не требуются. Удалённое выполнение не производилось; локально все четыре теста уже добавлены.

Повторная подготовка: `python3 imports/oge-6/extract.py` и `node imports/oge-6/prepare-import.mjs`. Для другого преподавателя сгенерировать каждый из четырёх файлов командой `npm run import:sql -- imports/oge-6/test-N.json UUID_ПРЕПОДАВАТЕЛЯ imports/setup/oge-6-test-N.sql`, заменив N на 1–4; использовать файлы с нужным UUID. Проверка единого SQL в изолированной PostgreSQL-базе: `node imports/oge-6/verify-sql.mjs`.
