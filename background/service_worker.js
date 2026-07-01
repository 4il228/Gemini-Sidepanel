let _sidePanelOpen = false;

chrome.storage.session.get("sidePanelOpen").then(({ sidePanelOpen }) => {
  _sidePanelOpen = !!sidePanelOpen;
});

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.sidePanelOpen) {
    _sidePanelOpen = changes.sidePanelOpen.newValue;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ sidePanelOpen: false });
});

chrome.sidePanel.onClosed.addListener(() => {
  chrome.storage.session.set({ sidePanelOpen: false });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-sidepanel") return;

  _sidePanelOpen = !_sidePanelOpen;

  if (_sidePanelOpen) {
    chrome.sidePanel.open({});
    chrome.storage.session.set({ sidePanelOpen: true });
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) chrome.sidePanel.close({ tabId: tab.id });
    });
    chrome.storage.session.set({ sidePanelOpen: false });
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
