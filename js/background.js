import { Storage } from './storage.js';

// Helper function to send messages without causing an uncaught error.
function sendMessageToTab(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(error => {
    if (!error.message.includes('Receiving end does not exist')) {
      console.error("Error sending message:", error);
    }
  });
}

// --- Alarms for periodic tasks ---
chrome.runtime.onInstalled.addListener(() => {
  console.log('Context Keeper installed.');
  chrome.alarms.create('archiveAlarm', { delayInMinutes: 1, periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'archiveAlarm') {
    const allItems = await Storage.getAll();
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    for (const [key, value] of Object.entries(allItems)) {
      if (value.readCompleteTimestamp && !value.archived && value.readCompleteTimestamp < twentyFourHoursAgo) {
        await Storage.set(key, { ...value, archived: true });
      }
    }
  }
});

// --- Message Listener for events from content scripts ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const main = async () => {
    if (request.action === 'isUrlTracked') {
      const requestUrl = request.url.split('#')[0];
      const allItems = await Storage.getAll();
      for (const key in allItems) {
        if (allItems[key].url && allItems[key].url.split('#')[0] === requestUrl) {
          sendResponse({ isTracked: true });
          return;
        }
      }
      sendResponse({ isTracked: false });
    } else if (request.action === 'updateScrollPosition') {
      const requestUrl = request.url.split('#')[0];
      const allItems = await Storage.getAll();
      for (const [key, value] of Object.entries(allItems)) {
        if (value.url && value.url.split('#')[0] === requestUrl) {
          let updatedSession = {
            ...value,
            scrollPosition: request.scrollPosition,
            innerHeight: request.innerHeight,
            documentHeight: request.documentHeight > 0 ? request.documentHeight : value.documentHeight, // Preserve old height if new one is invalid
            lastVisited: Date.now(),
          };

          if (request.isReadComplete && !value.readCompleteTimestamp) {
            updatedSession.readCompleteTimestamp = Date.now();
            sendMessageToTab(sender.tab.id, { action: 'showToast', message: 'Page marked as read complete.' });
          }

          await Storage.set(key, updatedSession);
          break; 
        }
      }
    } else if (request.action === 'addHighlight') {
      const requestUrl = request.url.split('#')[0];
      const allItems = await Storage.getAll();
      let sessionKey = null;
      let session = null;

      for (const [key, value] of Object.entries(allItems)) {
        if (value.url && value.url.split('#')[0] === requestUrl) {
          sessionKey = key;
          session = value;
          break;
        }
      }

      if (!session) {
        const settings = (await Storage.get('settings')) || { autoSaveOnHighlight: false };
        if (settings.autoSaveOnHighlight) {
            console.log('Auto-creating session for highlight...');
            const tab = sender.tab;

            const [injectionResult] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({ 
                    scrollPosition: window.scrollY, 
                    documentHeight: document.body.scrollHeight, 
                    innerHeight: window.innerHeight 
                }),
            });

            const newSession = {
                title: tab.title,
                url: tab.url,
                lastVisited: Date.now(),
                scrollPosition: (injectionResult && injectionResult.result) ? injectionResult.result.scrollPosition : 0,
                documentHeight: (injectionResult && injectionResult.result) ? injectionResult.result.documentHeight : 0,
                innerHeight: (injectionResult && injectionResult.result) ? injectionResult.result.innerHeight : 0,
                highlights: [request.highlight], // Start with the current highlight
            };

            sessionKey = `session-${Date.now()}`;
            await Storage.set(sessionKey, newSession);
            sendMessageToTab(tab.id, { action: 'startTracking' });
            // No need to continue, the session is created and the highlight is in it.
            return; 
        } else {
            return; // Setting is off, do nothing.
        }
      }

      const highlights = session.highlights || [];
      highlights.push(request.highlight);
      session.highlights = highlights;
      
      await Storage.set(sessionKey, session);
    } else if (request.action === 'getSession') {
        const requestUrl = request.url.split('#')[0];
        const allItems = await Storage.getAll();
        for (const [key, value] of Object.entries(allItems)) {
            if (value.url && value.url.split('#')[0] === requestUrl) {
                sendResponse({ session: value });
                return;
            }
        }
        sendResponse({ session: null });
    }
  };

  main();
  return true; // Necessary for asynchronous sendResponse
});

// --- Command Listener for keyboard shortcuts ---
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  const currentUrl = tab.url ? tab.url.split('#')[0] : '';

  if (command === 'save-session') {
    if (!tab.url || tab.url.startsWith('chrome://')) {
      sendMessageToTab(tab.id, { action: 'showToast', message: 'Cannot save on this page!' });
      return;
    }

    try {
      const allItems = await Storage.getAll();
      let existingSessionKey = null;
      for (const [key, value] of Object.entries(allItems)) {
        if (value.url && value.url.split('#')[0] === currentUrl) {
          existingSessionKey = key;
          break;
        }
      }

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ scrollPosition: window.scrollY, documentHeight: document.body.scrollHeight, innerHeight: window.innerHeight }),
      });

      const sessionData = {
        title: tab.title,
        url: tab.url,
        scrollPosition: (injectionResult && injectionResult.result) ? injectionResult.result.scrollPosition : 0,
        documentHeight: (injectionResult && injectionResult.result) ? injectionResult.result.documentHeight : 0,
        innerHeight: (injectionResult && injectionResult.result) ? injectionResult.result.innerHeight : 0,
        lastVisited: Date.now(),
      };

      if (existingSessionKey) {
        const existingSession = allItems[existingSessionKey];
        const updatedSession = { ...existingSession, ...sessionData };
        await Storage.set(existingSessionKey, updatedSession);
        sendMessageToTab(tab.id, { action: 'showToast', message: 'Session updated!' });
      } else {
        const newSessionKey = `session-${Date.now()}`;
        await Storage.set(newSessionKey, sessionData);
        sendMessageToTab(tab.id, { action: 'showToast', message: 'Session saved!' });
        // Activate tracking on the content script for this newly saved page
        sendMessageToTab(tab.id, { action: 'startTracking' });
      }
    } catch (e) {
      console.error("Failed to save session:", e);
      sendMessageToTab(tab.id, { action: 'showToast', message: 'Failed to save session.' });
    }
  } else if (command === 'delete-session') {
    const allItems = await Storage.getAll();
    let wasDeleted = false;
    for (const [key, value] of Object.entries(allItems)) {
      if (value.url && value.url.split('#')[0] === currentUrl) {
        await Storage.remove(key);
        wasDeleted = true;
      }
    }
    if (wasDeleted) {
      sendMessageToTab(tab.id, { action: 'showToast', message: 'Session deleted!' });
    }
  }
});

// --- Tab Update Listener for automatic scroll restoration ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Ensure the tab is fully loaded and has a URL
  if (changeInfo.status === 'complete' && tab.url) {
    console.log(`[DEBUG] Tab updated: ${tab.url}. Status: ${changeInfo.status}`);
    
    const requestUrl = tab.url.split('#')[0];
    const allItems = await Storage.getAll();
    let sessionKey = null;
    let sessionData = null;

    for (const [key, value] of Object.entries(allItems)) {
      if (value.url && value.url.split('#')[0] === requestUrl) {
        sessionKey = key;
        sessionData = value;
        break;
      }
    }

    if (sessionKey) {
      console.log(`[DEBUG] URL is tracked. Session data:`, sessionData);
      if (sessionData.scrollPosition) {
        console.log(`[DEBUG] Sending setScrollPosition message with position: ${sessionData.scrollPosition}`);
        sendMessageToTab(tabId, {
          action: 'setScrollPosition',
          scrollPosition: sessionData.scrollPosition
        });
      }
    } else {
      console.log(`[DEBUG] URL is not tracked.`);
    }
  }
});