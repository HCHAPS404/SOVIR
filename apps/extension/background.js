const KEY = "sovir-extension-paused";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "set-paused") {
    chrome.storage.local.set({ [KEY]: Boolean(message.paused) }, () => {
      sendResponse({ paused: Boolean(message.paused), hosts: "optional-not-granted" });
    });
    return true;
  }
  if (message?.type === "get-state") {
    chrome.storage.local.get(KEY, (stored) => {
      sendResponse({
        paused: Boolean(stored[KEY]),
        permission: "optional-host-not-requested",
      });
    });
    return true;
  }
  return false;
});
