chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_URL' && message.url) {
    chrome.tabs.create({ url: message.url })
    sendResponse({ ok: true })
    return true
  }
})