import { restoreHighlights, handleHighlighterMessages } from './highlighter.js';

let isUrlTracked = false;
let lastKnownScrollPosition = 0;
let lastKnownInnerHeight = 0;
let lastKnownDocumentHeight = 0;

let scrollSaveTimeout = null;

const activateTracking = () => {
  if (isUrlTracked) return; // Prevent multiple listeners
  isUrlTracked = true;
  window.addEventListener('scroll', () => {
    lastKnownScrollPosition = window.scrollY;
    lastKnownInnerHeight = window.innerHeight;
    lastKnownDocumentHeight = document.body.scrollHeight;

    // Debounce the save operation
    clearTimeout(scrollSaveTimeout);
    scrollSaveTimeout = setTimeout(finalUpdate, 2000); // Save 2s after user stops scrolling

  }, { passive: true });
};

// Ask the background script if the current URL is already tracked on page load.
chrome.runtime.sendMessage({ action: 'isUrlTracked', url: window.location.href }, (response) => {
  if (response && response.isTracked) {
    activateTracking();
  }
});

const finalUpdate = () => {
  if (!isUrlTracked) return;
  const scrollPercentage = (lastKnownScrollPosition + lastKnownInnerHeight) / lastKnownDocumentHeight;
  const isReadComplete = scrollPercentage >= 0.85;

  chrome.runtime.sendMessage({
    action: 'updateScrollPosition',
    url: window.location.href,
    scrollPosition: lastKnownScrollPosition,
    innerHeight: lastKnownInnerHeight,
    documentHeight: lastKnownDocumentHeight,
    isReadComplete: isReadComplete
  });
};

// Add listeners for all page exit scenarios
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    finalUpdate();
  }
});
window.addEventListener('pagehide', finalUpdate);

const showToast = (message) => {
  const toast = document.createElement('div');
  const iconUrl = chrome.runtime.getURL('images/icon48.png');
  
  toast.innerHTML = `
    <img src="${iconUrl}" alt="icon" style="width: 24px; height: 24px; margin-right: 10px;" />
    <span>${message}</span>
  `;
  
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.right = '20px';
  toast.style.backgroundColor = '#333';
  toast.style.color = 'white';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '5px';
  toast.style.zIndex = '9999';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.5s';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
  }, 100);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 500);
  }, 3000);
};


// --- Message listener for requests from other parts of the extension ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startTracking') {
    activateTracking();
  } else if (request.action === 'setScrollPosition') {
    console.log(`[DEBUG] Received setScrollPosition. Scrolling to: ${request.scrollPosition}`);
    window.scrollTo(0, request.scrollPosition);
    showToast('스크롤 위치가 복원되었습니다.');
    // Give lazy-loaded content time to render after scroll by polling for document height stability
    attemptIntelligentRestore();
  } else if (request.action === 'showToast') {
    showToast(request.message);
  } else {
    // Delegate highlighter messages to the highlighter script
    handleHighlighterMessages(request);
  }
});

function attemptIntelligentRestore(maxRetries = 10, interval = 200) {
    let lastHeight = 0;
    let stableChecks = 0;
    let retries = 0;

    const poller = setInterval(() => {
        const currentHeight = document.body.scrollHeight;

        if (currentHeight === lastHeight) {
            stableChecks++;
        } else {
            stableChecks = 0; // Reset if height changes
        }

        lastHeight = currentHeight;
        retries++;

        // If height is stable for 2 checks, or we've run out of retries, restore.
        if (stableChecks >= 2 || retries >= maxRetries) {
            clearInterval(poller);
            console.log(`[DEBUG] Restoring highlights after ${retries} checks.`);
            restoreHighlights();
        }
    }, interval);
}