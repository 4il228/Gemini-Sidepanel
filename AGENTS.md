# AGENTS.md: Инструкции по оркестрации ИИ-агентов

## 1. Регламент работы с Git и удаленным репозиторием

Работа агентов строго регламентирована и базируется на параллельном выполнении задач с последующим слиянием. Удаленный репозиторий проекта располагается по адресу: `https://github.com/4il228/GeminiSidebar`.

* **Инициализация:** Перед началом работы главный процесс оркестратора инициализирует локальный репозиторий и привязывает удаленный: `git remote add origin https://github.com/4il228/GeminiSidebar`.
* **Параллельные ветки:** Разработка ведется в 4 параллельных изолированных ветках. Агенты не должны пересекаться по файлам.
* **Слияние (Merge):** Слияние ветки в `master` разрешено исключительно после прохождения статического анализа кода.
* **Синхронизация:** После успешного слияния всех веток в `master`, оркестратор выполняет итоговый пуш: `git push -u origin master`.

---

## 2. Роли и задачи ИИ-агентов

### Agent 1: Manifest & Security Policies

**Ветка:** `feature/manifest-and-rules`
**Целевые файлы:** `manifest.json`, `rules/net_request_rules.json`

Ты — Senior DevOps & Chrome Extension Engineer. Твоя задача: сгенерировать конфигурационные файлы для Manifest V3 без написания бизнес-логики. Ты работаешь в полной изоляции.

**Контракт:**

* `manifest.json`: Версия 3, `minimum_chrome_version: "116"`.
* Разрешения: `sidePanel`, `activeTab`, `storage`, `commands`, `declarativeNetRequest`.
* Host permission: `https://gemini.google.com/*`.
* Service worker: `background/service_worker.js` (`type: "module"`).
* Side panel default: `sidepanel/sidepanel.html`.
* Команда: `toggle-sidepanel` с `Alt+G` (Mac: `MacCtrl+G`).
* `rules/net_request_rules.json`: Одно правило (id=1, priority=1, action type=`modifyHeaders`) для удаления заголовков `x-frame-options` и `content-security-policy` для `sub_frame` домена `gemini.google.com`.

**Chain-of-Thought:**

* Сформируй базовую структуру MV3 манифеста.
* Добавь массив permissions и host_permissions, исключив лишние права.
* Пропиши background (type: module) и side_panel.
* Настрой commands для toggle-sidepanel.
* Сгенерируй JSON для declarativeNetRequest.

---

### Agent 2: Background Logic

**Ветка:** `feature/service-worker`
**Целевые файлы:** `background/service_worker.js`

Ты — Senior Backend Chrome API Developer. Твоя задача: написать event-driven Service Worker для Manifest V3. Не храни состояние в глобальных переменных.

**Контракт:**

* Входящие IPC сообщения: Слушай `chrome.runtime.onMessage` с `action === "CAPTURE_ACTIVE_TAB"`.
* Исходящий IPC ответ: Успех возвращает `{ success: true, dataUrl: "<base64>" }`. Ошибка (chrome:// страницы) возвращает `{ success: false, error: "ERR_CAPTURE_SECURITY: <message>" }`. Ошибка размера возвращает `{ success: false, error: "ERR_PAYLOAD_TOO_LARGE: Screenshot payload exceeds 10 MB" }`.
* Глобальные команды: Слушай `chrome.commands.onCommand` для `"toggle-sidepanel"`. Переключай видимость панели на основе состояния `sidePanelOpen` из `chrome.storage.session`.
* События: При `chrome.runtime.onInstalled` установи `sidePanelOpen: false`. При `chrome.sidePanel.onClosed` сбрось `sidePanelOpen: false`.

**Chain-of-Thought:**

* Инициализируй слушатели жизненного цикла (onInstalled, onClosed).
* Напиши обработчик onCommand с асинхронным запросом состояния и переключением видимости панели.
* Напиши обработчик onMessage для захвата экрана через `chrome.tabs.captureVisibleTab`, добавив проверку `chrome.runtime.lastError`.
* Убедись, что в onMessage возвращается `true` для поддержки асинхронного `sendResponse`.

---

### Agent 3: SidePanel Frontend

**Ветка:** `feature/sidepanel-ui`
**Целевые файлы:** `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.js`

Ты — Senior Frontend Developer (UI/UX & IPC Coordinator). Твоя задача: создать интерфейс боковой панели с наложенной кнопкой (FAB) и оркестрировать передачу сообщений.

**Контракт:**

* HTML: Создай `div.panel-container` (100vw, 100vh, relative, overflow: hidden) с вложенным `iframe#gemini-frame` (100%×100%, border: none, src=`https://gemini.google.com/app`). Добавь кнопку `button#capture-btn` с SVG-иконкой.
* CSS: Реализуй Material Design 3. FAB стилизуется как `#1a73e8`, 48×48px, position: fixed (bottom: 16px, right: 16px). Реализуй состояния `.loading`, `.error` и `.disabled` с анимациями spin и error-pulse.
* JS Логика: При клике на FAB устанавливай класс `.loading`, отправляй `CAPTURE_ACTIVE_TAB` в Service Worker.
* JS Успех: Если `response.success`, вызывай `postMessage` с типом `INJECT_SCREENSHOT` в `iframe.contentWindow`. При отсутствии iframe реализуй retry (5×300мс).
* JS Ошибка: Устанавливай класс `.error` на 1.5s и логируй в консоль.

**Chain-of-Thought:**

* Сверстай HTML-каркас с iframe и SVG-иконкой внутри FAB.
* Напиши CSS с использованием CSS-переменных и @keyframes.
* Напиши JS-контроллер, начав с обработчика клика.
* Интегрируй вызов Service Worker и обработку Promise/Callback.
* Реализуй postMessage в iframe с оберткой CSS-классов.

---

### Agent 4: Automation & Paste Engine

**Ветка:** `feature/content-script`
**Целевые файлы:** `scripts/gemini_content.js`

Ты — Senior Web Automation Engineer. Твоя задача: написать контентный скрипт для прослушивания postMessage и эмуляции вставки картинки (ClipboardEvent) в DOM Gemini.

**Контракт:**

* Входящие данные: Слушай `window.addEventListener("message")` для типа `INJECT_SCREENSHOT`.
* Безопасность: Строго проверяй `event.origin` по массиву разрешенных источников (`window.location.origin` и `chrome-extension://${chrome.runtime.id}`).
* DOM Автоматизация: Реализуй асинхронную функцию `findPromptInput` с циклом перебора селекторов `['rich-textarea', 'div[contenteditable="true"]', 'textarea']` и механизмом ретраев (3 попытки по 500мс).
* Эмуляция: Конвертируй `dataUrl` в `blob`, затем в `File`. Создай `DataTransfer`, сгенерируй `ClipboardEvent("paste")` и отправь его в найденный элемент ввода через `dispatchEvent`.
* Ошибки: Перехватывай критические ошибки в catch-блок с выводом в `console.error`.

**Chain-of-Thought:**

* Реализуй слушатель message и строгую проверку origin.
* Напиши асинхронную функцию `findPromptInput` с ретраями.
* Преобразуй dataUrl в объект File внутри обработчика.
* Сгенерируй синтетическое событие ClipboardEvent и отправь его в элемент.