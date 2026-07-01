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
