# SPEC.md: Техническая спецификация расширения Chrome «AI Assistant SidePanel»

## 1. Project Overview & Objectives
**Наименование проекта:** AI Assistant SidePanel Extension  
**Цель проекта:** Создание легковесного расширения для браузеров на базе Chromium (Google Chrome, Яндекс.Браузер), интегрирующего веб-интерфейс Gemini в нативную боковую панель (`sidePanel`) с возможностью глобального управления через хоткеи и функцией моментального контекстного скриншотинга активной вкладки.

### Целевой стек технологий:
- **Платформа:** Chrome Extensions API (Manifest V3), target Chrome 116+.
- **Языки разработки:** JavaScript (ES2020+), HTML5, CSS3 (CSS Custom Properties, Flexbox, CSS Grid).
- **Архитектурный паттерн:** Event-driven (асинхронный обмен сообщениями между изолированными контекстами).
- **Хранилище состояния:** `chrome.storage.session` (энергонезависимое в рамках сессии) + `chrome.storage.local` (персистентное).

---

## 2. Architecture & File Structure
Проект организован по модульному принципу. Все изолированные контексты разделены по директориям для предотвращения конфликтов областей видимости и упрощения отладки.


```text
ai-assistant-sidepanel/
├── manifest.json                # Конфигурационный манифест расширения (MV3)
├── background/
│   └── service_worker.js        # Фоновый скрипт (управление жизненным циклом, хоткеи, захват экрана)
├── sidepanel/
│   ├── sidepanel.html           # Интерфейс боковой панели (контейнер для iframe и UI управления)
│   ├── sidepanel.css            # Стили боковой панели и элементов управления (Material Design 3)
│   └── sidepanel.js             # Логика боковой панели, оркестрация IPC сообщений
├── scripts/
│   └── gemini_content.js        # Контентный скрипт, инжектируемый в iframe Gemini для автоматизации ввода
├── rules/
│   └── net_request_rules.json   # Правила Declarative Net Request для обхода ограничений CSP/X-Frame-Options
└── assets/
    ├── icon16.png               # Иконка для UI расширений (16x16)
    ├── icon48.png               # Иконка для страницы управления (48x48)
    └── icon128.png              # Иконка для Chrome Web Store (128x128)

```

---

## 3. Manifest V3 Configuration

Конфигурация `manifest.json` использует строго минимальный набор разрешений, необходимых для реализации бизнес-логики.

```json
{
  "manifest_version": 3,
  "name": "AI Assistant SidePanel",
  "version": "1.0.0",
  "description": "Интеграция веб-интерфейса Gemini в sidePanel с поддержкой скриншотов в один клик.",
  "permissions": [
    "sidePanel",
    "activeTab",
    "storage",
    "commands",
    "declarativeNetRequest"
  ],
  "host_permissions": [
    "https://gemini.google.com/*"
  ],
  "background": {
    "service_worker": "background/service_worker.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "commands": {
    "toggle-sidepanel": {
      "suggested_key": {
        "default": "Alt+G",
        "mac": "MacCtrl+G"
      },
      "description": "Открыть/закрыть боковую панель AI Assistant"
    }
  },
  "declarative_net_request": {
    "rule_resources": [
      {
        "id": "ruleset_csp",
        "enabled": true,
        "path": "rules/net_request_rules.json"
      }
    ]
  },
  "icons": {
    "16": "assets/icon16.png",
    "48": "assets/icon48.png",
    "128": "assets/icon128.png"
  },
  "minimum_chrome_version": "116"
}

```

---

## 4. Component Specifications

### 4.1. Network Security Bypass (`rules/net_request_rules.json`)

Веб-интерфейс Gemini защищен заголовками `X-Frame-Options: SAMEORIGIN` и директивами `Content-Security-Policy (CSP)`, запрещающими отображение внутри iframe сторонних доменов. Для обеспечения бесшовной интеграции в `sidepanel.html` на уровне ядра браузера применяется модификация HTTP-ответов.

```json
[
  {
    "id": 1,
    "priority": 1,
    "action": {
      "type": "modifyHeaders",
      "responseHeaders": [
        { "header": "x-frame-options", "operation": "remove" },
        { "header": "content-security-policy", "operation": "remove" }
      ]
    },
    "condition": {
      "urlFilter": "||gemini.google.com",
      "resourceTypes": ["sub_frame"]
    }
  }
]

```

### 4.2. Background Service Worker (`background/service_worker.js`)

Реализует паттерн реактивного слушателя событий. Не хранит состояние в глобальных переменных (из-за возможной деактивации service worker). Временное состояние сессии хранится в `chrome.storage.session`, персистентная конфигурация — в `chrome.storage.local`.

**Ключевые функции:**

1. Перехват глобальной команды вызова расширения (команда `"toggle-sidepanel"`).
2. Программное управление видимостью `sidePanel` (открыть/закрыть через `chrome.sidePanel.open/close`).
3. Высокоуровневый захват экрана через `chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, callback)` (где `windowId = null` для активного окна).

```javascript
// Инициализация дефолтного поведения при установке
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.storage.session.set({ sidePanelOpen: false });
});

// Синхронизация состояния при ручном закрытии панели пользователем
chrome.sidePanel.onClosed.addListener(() => {
  chrome.storage.session.set({ sidePanelOpen: false });
});

// Обработка горячих клавиш (полноценный toggle: открыть/закрыть)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-sidepanel") {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return;

    const windowId = tab.windowId;
    const { sidePanelOpen } = await chrome.storage.session.get('sidePanelOpen');

    // Переключаем состояние: если было открыто — закрываем, иначе открываем
    await chrome.sidePanel[sidePanelOpen ? 'close' : 'open']({ windowId });
    await chrome.storage.session.set({ sidePanelOpen: !sidePanelOpen });
  }
});

// Слушатель IPC сообщений от SidePanel для выполнения скриншота
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CAPTURE_ACTIVE_TAB") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl: dataUrl });
      }
    });
    return true; // Фиксация асинхронного канала связи
  }
});

```

### 4.3. Side Panel Window (`sidepanel/sidepanel.html` & `.js`)

Представляет собой контейнер, изолирующий целевой веб-интерфейс и накладывающий поверх него кастомный слой управления (Floating Action Button — FAB).

#### HTML Структура (`sidepanel.html`):

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <div class="panel-container">
    <iframe id="gemini-frame" src="https://gemini.google.com/app" allow="clipboard-read; clipboard-write"></iframe>
    
    <button id="capture-btn" title="Вставить экран (Alt+G)">
      <svg class="icon" viewBox="0 0 24 24">
        <path d="M4 4h3V2H4c-1.1 0-2 .9-2 2v3h2V4zm16 0h-3V2h3c1.1 0 2 .9 2 2v3h-2V4zM4 20h3v2H4c-1.1 0-2-.9-2-2v-3h2v3zm16 0h-3v2h3c1.1 0 2-.9 2-2v-3h-2v3zM12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
      </svg>
      <span class="btn-text">Вставить экран</span>
    </button>
  </div>
  <script src="sidepanel.js"></script>
</body>
</html>

```

#### CSS Спецификация (`sidepanel.css`):

Все размеры, отступы и цвета зафиксированы и не должны отклоняться от указанных значений:

```css
/* Переменные темы (Material Design 3 — фиксированные значения) */
:root {
  --fab-bg: #1a73e8;
  --fab-bg-hover: #1557b0;
  --fab-size: 48px;
  --fab-shadow: 0 2px 8px rgba(0,0,0,0.3);
  --error-color: #d93025;
  --disabled-opacity: 0.5;
  --transition-duration: 0.2s;
}

/* Контейнер занимает 100% площади sidePanel */
.panel-container {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

/* Iframe Gemini — полный охват родителя */
#gemini-frame {
  width: 100%;
  height: 100%;
  border: none;
}

/* Floating Action Button — фиксация поверх iframe */
#capture-btn {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 9999;
  width: var(--fab-size);
  height: var(--fab-size);
  border-radius: 50%;
  background: var(--fab-bg);
  box-shadow: var(--fab-shadow);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-duration) ease;
}
#capture-btn:hover {
  background: var(--fab-bg-hover);
  transform: scale(1.05);
}
#capture-btn.loading {
  opacity: 0.7;
  pointer-events: none;
  animation: spin 1s linear infinite;
}
#capture-btn.error {
  outline: 2px solid var(--error-color);
  outline-offset: 2px;
  animation: error-pulse 1.5s ease;
}
#capture-btn.disabled {
  opacity: var(--disabled-opacity);
  pointer-events: none;
}

/* Иконка внутри кнопки */
.icon {
  width: 24px;
  height: 24px;
  fill: #fff;
}
.btn-text {
  display: none; /* текст скрыт, используется только title */
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes error-pulse {
  0% { box-shadow: 0 0 0 0 rgba(217,48,37,0.4); }
  50% { box-shadow: 0 0 0 8px rgba(217,48,37,0); }
  100% { box-shadow: 0 0 0 0 rgba(217,48,37,0); }
}
```

#### Логика контроллера (`sidepanel.js`):

```javascript
document.getElementById('capture-btn').addEventListener('click', async () => {
  const btn = document.getElementById('capture-btn');
  btn.classList.add('loading');

  // Шаг 1: Запрос скриншота активной вкладки у Background Service Worker
  chrome.runtime.sendMessage({ action: "CAPTURE_ACTIVE_TAB" }, (response) => {
    btn.classList.remove('loading');
    
    if (response && response.success) {
      // Шаг 2: Передача base64-строки во внутренний контентный скрипт iframe
      const iframe = document.getElementById('gemini-frame');
      iframe.contentWindow.postMessage({
        type: "INJECT_SCREENSHOT",
        dataUrl: response.dataUrl
      }, "https://gemini.google.com");
    } else {
      console.error("Ошибка захвата экрана:", response ? response.error : "Unknown error");
    }
  });
});

```

### 4.4. Automation & Paste Engine (`scripts/gemini_content.js`)

Этот скрипт должен быть зарегистрирован динамически или внедрен программно в контекст `https://gemini.google.com/*` для эмуляции пользовательского ввода. Поскольку расширение имеет доступ к `host_permissions` для домена Gemini, мы можем взаимодействовать с DOM-деревом веб-приложения.

**Алгоритм эмуляции вставки файла (строго детерминированный):**

1. Проверка origin отправителя (разрешены: `https://gemini.google.com` и `chrome-extension://<id>`).
2. Преобразование входящей строки `DataURL` (Base64) в двоичный объект `Blob`, затем в объект `File`.
3. Поиск элемента ввода промпта Gemini с каскадным перебором селекторов и механизмом retry (до 3 попыток с интервалом 500мс).
4. Создание виртуального контейнера данных `DataTransfer`.
5. Генерация и триггер синтетического события `ClipboardEvent` с типом `paste`.

```javascript
// Константы детерминированного поведения
const SELECTOR_CASCADE = [
  'rich-textarea',                    // Текущий селектор Gemini (приоритет 1)
  'div[contenteditable="true"]',      // Альтернативный contenteditable (приоритет 2)
  'textarea'                           // Фолбэк для старых версий (приоритет 3)
];
const RETRY_LIMIT = 3;
const RETRY_INTERVAL_MS = 500;
const FILE_NAME_PREFIX = 'screenshot_';
const ACCEPTED_TYPE = 'image/png';

/**
 * Поиск элемента ввода с заданным таймаутом и ретраями.
 * @param {number} retries - количество попыток
 * @param {number} delayMs - задержка между попытками в мс
 * @returns {Promise<Element>}
 */
async function findPromptInput(retries = RETRY_LIMIT, delayMs = RETRY_INTERVAL_MS) {
  for (let attempt = 0; attempt < retries; attempt++) {
    for (const selector of SELECTOR_CASCADE) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    if (attempt < retries - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Поле ввода Gemini не найдено после ${retries} попыток.`);
}

window.addEventListener("message", async (event) => {
  // Строгая проверка источника данных для предотвращения XSS
  const ALLOWED_ORIGINS = [
    window.location.origin,
    `chrome-extension://${chrome.runtime.id}`
  ];
  if (!ALLOWED_ORIGINS.includes(event.origin)) return;

  if (event.data && event.data.type === "INJECT_SCREENSHOT") {
    try {
      const dataUrl = event.data.dataUrl;
      
      // Конвертация Base64 в File Объект
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const timestamp = Date.now();
      const file = new File([blob], `${FILE_NAME_PREFIX}${timestamp}.png`, { type: ACCEPTED_TYPE });

      // Поиск элемента ввода с механизмом retry
      const promptInput = await findPromptInput();

      // Эмуляция Clipboard API интерфейса передачи файлов
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });

      // Фокусировка и отправка события
      promptInput.focus();
      promptInput.dispatchEvent(pasteEvent);
      
    } catch (err) {
      console.error("Критическая ошибка инжекции скриншота:", err);
    }
  }
});

```

---

## 5. Data Flow & IPC (Межпроцессное взаимодействие)

Вся работа расширения построена на асинхронной передаче сообщений. Ниже приведена схема прохождения транзакции данных при нажатии кнопки «Вставить экран»:

```text
[ sidepanel.js ]                                  [ background/service_worker.js ]
       │                                                         │
       │  ── (1) runtime.sendMessage("CAPTURE_ACTIVE_TAB") ──>   │
       │                                                         │ ── (2) Вызов нативного API:
       │                                                         │   chrome.tabs.captureVisibleTab()
       │  <── (3) Возврат payload { success: true, dataUrl } ─── │
       │
[ sidepanel.js ]
       │
       │ ── (4) iframe.contentWindow.postMessage("INJECT_SCREENSHOT", base64) ──> [ scripts/gemini_content.js ]
                                                                                                 │
                                                                                                 │ ── (5) Парсинг base64 в Blob/File
                                                                                                 │ ── (6) Инициализация DataTransfer()
                                                                                                 │ ── (7) dispatchEvent(ClipboardEvent('paste'))
                                                                                                 v
                                                                                           [ DOM Gemini Input ]

```

---

## 6. Edge Cases & Error Handling

Все исключительные ситуации обрабатываются по единому детерминированному протоколу:
- `sidepanel.js` получает от `service_worker.js` ответ с полем `{ success: false, error: "<error_code>: <message>" }`.
- Кнопка захвата переходит в состояние `error` (CSS-класс `.error`, красная рамка, 1.5s, затем возврат в `idle`).
- В консоль sidepanel пишется `console.warn("[AI SidePanel] <error_code>: <message>")`.
- Для offline-детекции используется `navigator.onLine` при старте расширения.

| Исключительная ситуация (Edge Case) | Error Code | Поведение Системы / Инструкция по обработке |
| --- | --- | --- |
| **Активная вкладка: `chrome://` или Chrome Web Store** | `ERR_CAPTURE_SECURITY` | API `captureVisibleTab` выбрасывает Security Error. `service_worker.js` перехватывает через `chrome.runtime.lastError`, возвращает `{ success: false, error: "ERR_CAPTURE_SECURITY: Cannot capture chrome:// or webstore pages" }`. Кнопка переходит в `error` на 1.5s. |
| **Пользователь не авторизован в Google Account внутри iframe** | (не ошибка) | Расширение не вмешивается в авторизацию. Браузер прокидывает сессионные куки (shared cookie context). Пользователь видит стандартную страницу логина Google внутри sidePanel. Функция скриншота остаётся активной. |
| **Gemini обновил структуру DOM (смена селекторов)** | `ERR_SELECTOR_NOT_FOUND` | `gemini_content.js` выполняет до 3 попыток поиска с интервалом 500мс по каскаду селекторов. Если все попытки исчерпаны — ошибка `ERR_SELECTOR_NOT_FOUND` пишется в консоль. Расширение продолжает работу. |
| **Отсутствие интернет-соединения** | `ERR_OFFLINE` | `navigator.onLine === false`. Кнопка «Вставить экран» переводится в `disabled` (CSS-класс `.disabled`, pointer-events: none, opacity: 0.5). При восстановлении соединения — `online` event возвращает кнопку в `idle`. |
| **Payload скриншота превышает 10 MB** | `ERR_PAYLOAD_TOO_LARGE` | `service_worker.js` проверяет размер `dataUrl` (base64-строка). Если `dataUrl.length > 14e6` (~10 MB), возвращает `{ success: false, error: "ERR_PAYLOAD_TOO_LARGE: Screenshot payload exceeds 10 MB" }`. |
| **Content script не загружен (iframe ещё не готов)** | `ERR_IFRAME_NOT_READY` | `sidepanel.js` проверяет, что `iframe.contentWindow` доступен перед вызовом `postMessage`. Если недоступен — повторяет попытку через 300мс, до 5 раз. При исчерпании — `console.warn("[AI SidePanel] ERR_IFRAME_NOT_READY: iframe not available after 5 retries")`. |

---

## 7. Step-by-Step Implementation Plan (План разработки для ИИ-агента)

### Milestone 1: Создание скелета расширения и инициализация SidePanel

* [ ] Шаг 1.1: Создать файл `manifest.json` версии MV3 со всеми необходимыми разрешениями (см. Section 3).
* [ ] Шаг 1.2: Создать директорию `assets/` и поместить туда заглушки иконок (16×16, 48×48, 128×128 px в формате PNG).
* [ ] Шаг 1.3: Создать пустой `background/service_worker.js` и зарегистрировать его в манифесте (с `"type": "module"`).
* [ ] Шаг 1.4: Создать базовый файл `sidepanel/sidepanel.html` с `<h1>Hello World</h1>` для проверки загрузки.
* [ ] *Критерий приемки:* `chrome://extensions` → загрузить распакованное расширение → иконка появилась на панели → клик открывает sidepanel с текстом "Hello World".

### Milestone 2: Обход политик безопасности и встраивание Gemini

* [ ] Шаг 2.1: Создать `rules/net_request_rules.json` (правило id=1, удаление `x-frame-options` и `content-security-policy`).
* [ ] Шаг 2.2: Добавить iframe в `sidepanel.html`: `<iframe src="https://gemini.google.com/app">`.
* [ ] Шаг 2.3: Зарегистрировать `declarative_net_request` в манифесте (rule_resources → ruleset_csp).
* [ ] *Критерий приемки:* В sidepanel загружается `https://gemini.google.com/app` без ошибки "Refused to display in a frame". Консоль DevTools чиста от CSP/X-Frame-Options ошибок.

### Milestone 3: Реализация Screenshot Engine и IPC

* [ ] Шаг 3.1: Добавить в `service_worker.js` слушатель `chrome.runtime.onMessage` с action `"CAPTURE_ACTIVE_TAB"` → `chrome.tabs.captureVisibleTab(null, { format: 'png' }, callback)`.
* [ ] Шаг 3.2: Создать FAB-кнопку в `sidepanel.html` с CSS: `position: fixed; bottom: 16px; right: 16px; z-index: 9999;` и иконкой Material Design (SVG-путь из Section 4.3).
* [ ] Шаг 3.3: Реализовать в `sidepanel.js` отправку `chrome.runtime.sendMessage({ action: "CAPTURE_ACTIVE_TAB" })` и вывод `dataUrl` в консоль.
* [ ] *Критерий приемки:* FAB кликабельна. После клика в `console.log` sidepanel отображается строка `data:image/png;base64,...` длиной > 1000 символов.

### Milestone 4: Написание Paste Engine (Контентный скрипт автоматизации)

* [ ] Шаг 4.1: Создать `scripts/gemini_content.js` с конвертацией base64 → Blob → File, поиском `rich-textarea` через `findPromptInput()` (до 3 попыток по 500мс) и dispatch `ClipboardEvent("paste")`.
* [ ] Шаг 4.2: Организовать передачу данных из `sidepanel.js` → `gemini_content.js` через `iframe.contentWindow.postMessage({ type: "INJECT_SCREENSHOT", dataUrl }, "https://gemini.google.com")`.
* [ ] Шаг 4.3: Зарегистрировать `gemini_content.js` через `chrome.scripting.executeScript` при загрузке iframe (или через `"content_scripts"` в манифесте с `"matches": ["https://gemini.google.com/*"], "all_frames": true`).
* [ ] *Критерий приемки:* Клик FAB → скриншот активной вкладки → изображение появляется в Gemini prompt input (проверка: `document.querySelector('rich-textarea')` содержит вставленный файл).

### Milestone 5: Хоткеи, обработка ошибок и полировка

* [ ] Шаг 5.1: Реализовать `chrome.commands.onCommand` для команды `"toggle-sidepanel"` с хоткеем `Alt+G` (Mac: `MacCtrl+G`) — логика toggle через `chrome.storage.session`.
* [ ] Шаг 5.2: Добавить обработку `chrome.runtime.lastError` в callback `captureVisibleTab` — возврат `{ success: false, error: "ERR_CAPTURE_SECURITY: ..." }`.
* [ ] Шаг 5.3: Стилизовать состояния кнопки (`.loading` — спиннер, `.error` — красная рамка 1.5s, `.disabled` — opacity 0.5 + pointer-events: none).
* [ ] *Критерий приемки:* Хоткей `Alt+G` открывает/закрывает sidepanel. Скриншот `chrome://settings` → кнопка error 1.5s → возврат в idle. Без сети → кнопка disabled. С восстановлением сети → кнопка active.

