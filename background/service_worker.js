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
// ВАЖНО: async/await разрывает user gesture контекст, поэтому используем callbacks
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidepanel") {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      const windowId = tabs[0].windowId;

      chrome.storage.session.get('sidePanelOpen', (result) => {
        const sidePanelOpen = result.sidePanelOpen;

        if (sidePanelOpen) {
          chrome.sidePanel.close({ windowId }, () => {
            chrome.storage.session.set({ sidePanelOpen: false });
          });
        } else {
          chrome.sidePanel.open({ windowId }, () => {
            chrome.storage.session.set({ sidePanelOpen: true });
          });
        }
      });
    });
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
