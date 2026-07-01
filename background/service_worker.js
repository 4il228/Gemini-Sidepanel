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
