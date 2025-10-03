chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getScrollAndHeight') {
    sendResponse({ scrollPosition: window.scrollY, documentHeight: document.body.scrollHeight });
  } else if (request.action === 'setScrollPosition') {
    window.scrollTo(0, request.scrollPosition);
  } else if (request.action === 'showToast') {
    const toast = document.createElement('div');
    toast.textContent = request.message;
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

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
    }, 100);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 500);
    }, 3000);
  }
});
