import { Storage } from './storage.js';

// Helper function to send messages without causing an uncaught error if the receiving end doesn't exist.
function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(error => {
    // We can ignore this error, as it's expected when the content script is not available.
    if (error.message.includes('Receiving end does not exist')) {
      // Expected error, do nothing.
    } else {
      console.error("Error sending message:", error);
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Context Keeper installed.');
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const items = await Storage.getAll();
    for (const key in items) {
      if (items[key].url === tab.url) {
        const session = items[key];
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (scrollPosition) => {
            window.scrollTo(0, scrollPosition);
          },
          args: [session.scrollPosition]
        }).then(() => {
          sendMessageToTab(tabId, { action: 'showToast', message: 'Scroll position restored.' });
        });
        break;
      }
    }
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return; // No active tab found
  }

  if (command === 'save-session') {
    if (!tab.url || tab.url.startsWith('chrome://')) {
      sendMessageToTab(tab.id, { action: 'showToast', message: 'Cannot save on this page!' });
      return;
    }

    try {
      // Check if a session for this URL already exists
      const allItems = await Storage.getAll();
      let existingSessionKey = null;
      for (const [key, value] of Object.entries(allItems)) {
        if (value.url === tab.url) {
          existingSessionKey = key;
          break;
        }
      }

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ scrollPosition: window.scrollY, documentHeight: document.body.scrollHeight }),
      });

      const sessionData = {
        title: tab.title,
        url: tab.url,
        scrollPosition: (injectionResult && injectionResult.result) ? injectionResult.result.scrollPosition : 0,
        documentHeight: (injectionResult && injectionResult.result) ? injectionResult.result.documentHeight : 0,
        lastVisited: Date.now(),
      };

      if (existingSessionKey) {
        // Update existing session
        await Storage.set(existingSessionKey, sessionData);
        sendMessageToTab(tab.id, { action: 'showToast', message: 'Session updated!' });
      } else {
        // Create new session
        const newSessionKey = `session-${Date.now()}`;
        await Storage.set(newSessionKey, sessionData);
        sendMessageToTab(tab.id, { action: 'showToast', message: 'Session saved!' });
      }
    } catch (e) {
      console.error("Failed to save session:", e);
      sendMessageToTab(tab.id, { action: 'showToast', message: 'Failed to save session.' });
    }
  } else if (command === 'delete-session') {
    const items = await Storage.getAll();
    let wasDeleted = false;
    for (const [key, value] of Object.entries(items)) {
      if (value.url === tab.url) {
        await Storage.remove(key);
        wasDeleted = true;
        break;
      }
    }
    if (wasDeleted) {
      sendMessageToTab(tab.id, { action: 'showToast', message: 'Session deleted!' });
    }
  }
});