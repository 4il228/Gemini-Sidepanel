// Инициализация состояния при установке
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ sidePanelOpen: false });
});

// Слушатель закрытия SidePanel
chrome.sidePanel.onClosed.addListener(() => {
  chrome.storage.session.set({ sidePanelOpen: false });
});

// Слушатель глобальных команд
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-sidepanel") {
    const { sidePanelOpen } = await chrome.storage.session.get("sidePanelOpen");
    const tab = await chrome.tabs.query({ active: true, currentWindow: true }).then(t => t[0]);
    
    if (sidePanelOpen) {
      await chrome.sidePanel.close({ tabId: tab.id });
      chrome.storage.session.set({ sidePanelOpen: false });
    } else {
      await chrome.sidePanel.open({ tabId: tab.id });
      chrome.storage.session.set({ sidePanelOpen: true });
    }
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
    return true;
  }
});
