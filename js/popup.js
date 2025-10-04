import { Storage } from './storage.js';

const sessionListView = document.getElementById('session-list-view');
const sessionDetailsView = document.getElementById('session-details-view');
const sessionList = document.getElementById('session-list');
const searchInput = document.getElementById('search-input');
const showArchivedCheckbox = document.getElementById('show-archived-checkbox');
const filterButtons = document.getElementById('filter-buttons');
const backButton = document.getElementById('back-button');
const sessionDetailsTitle = document.getElementById('session-details-title');
const highlightList = document.getElementById('highlight-list');

const PIXELS_PER_MINUTE = 1000;

function estimateTime(value) {
  if (!value.documentHeight) return -1;
  const remainingPixels = value.documentHeight - value.scrollPosition;
  return remainingPixels / PIXELS_PER_MINUTE * 60; // in seconds
}

function getForgettingCurveColor(lastVisited) {
    const days = (Date.now() - lastVisited) / (1000 * 60 * 60 * 24);
    if (days < 1) return 'green';
    if (days < 3) return 'orange';
    return 'red';
}

function showListView() {
    sessionListView.style.display = 'block';
    sessionDetailsView.style.display = 'none';
}

function showDetailsView() {
    sessionListView.style.display = 'none';
    sessionDetailsView.style.display = 'block';
}

async function renderSessions(filter = '', timeFilter = -1) {
  const items = await Storage.getAll();
  sessionList.innerHTML = '';

  const showArchived = showArchivedCheckbox.checked;

  let filteredKeys = Object.keys(items).filter(key => {
    const item = items[key];
    const shouldShow = showArchived ? item.archived : !item.archived;
    if (!item.title || !shouldShow) return false;
    
    const title = item.customTitle || item.title;
    return key.startsWith('session-') && title.toLowerCase().includes(filter.toLowerCase());
  });

  if (timeFilter !== -1) {
    filteredKeys = filteredKeys.filter(key => {
        const time = estimateTime(items[key]);
        return time !== -1 && time < timeFilter;
    });
  }

  for (const key of filteredKeys) {
    const value = items[key];
    const listItem = document.createElement('li');
    listItem.dataset.key = key; // Add data-key for easy selection

    if (value.archived) {
      listItem.classList.add('archived');
    } else if (value.readCompleteTimestamp) {
      listItem.classList.add('pending-archive');
    }


    const sessionInfo = document.createElement('div');
    sessionInfo.className = 'session-info';

    const title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = value.customTitle || value.title;
    title.style.color = getForgettingCurveColor(value.lastVisited);
    title.addEventListener('click', async () => {
      const tabs = await chrome.tabs.query({ url: value.url });
      if (tabs.length > 0) {
        const tab = tabs[0];
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url: value.url });
      }
    });

    const editButton = document.createElement('span');
    editButton.className = 'edit-button';
    editButton.textContent = 'E';
    editButton.addEventListener('click', () => {
        const newTitle = prompt('Enter new title:', value.customTitle || value.title);
        if (newTitle) {
            Storage.set(key, { ...value, customTitle: newTitle }).then(() => {
                renderSessions(searchInput.value, timeFilter);
            });
        }
    });

    const deleteButton = document.createElement('span');
    deleteButton.className = 'delete-button';
    deleteButton.textContent = 'X';
    deleteButton.addEventListener('click', async () => {
      await Storage.remove(key);
      renderSessions(searchInput.value, timeFilter);
    });

    sessionInfo.appendChild(title);
    sessionInfo.appendChild(editButton);
    sessionInfo.appendChild(deleteButton);

    listItem.appendChild(sessionInfo);

    if (value.documentHeight) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        const progress = value.innerHeight
          ? Math.min(100, ((value.scrollPosition + value.innerHeight) / value.documentHeight) * 100)
          : (value.scrollPosition / value.documentHeight) * 100;      
        progressBar.style.width = `${progress}%`;
        progressContainer.appendChild(progressBar);
        listItem.appendChild(progressContainer);

        const time = estimateTime(value);
        if (time !== -1) {
            const timeEstimate = document.createElement('div');
            timeEstimate.className = 'time-estimate';
            timeEstimate.textContent = `~${Math.ceil(time / 60)} min remaining`;
            listItem.appendChild(timeEstimate);
        }
    }

    sessionList.appendChild(listItem);
  }
}

async function renderSessionDetails(key, session) {
    sessionDetailsTitle.textContent = session.customTitle || session.title;
    highlightList.innerHTML = '';
    const url = session.url;
    const data = await Storage.get(url);
    if (data && data.highlights) {
        for (const highlight of data.highlights) {
            const listItem = document.createElement('li');
            const text = document.createElement('div');
            text.className = 'highlight-text';
            text.textContent = highlight.text;
            listItem.appendChild(text);

            if (highlight.memo) {
                const memo = document.createElement('div');
                memo.className = 'highlight-memo';
                memo.textContent = highlight.memo;
                listItem.appendChild(memo);
            }

            const goToButton = document.createElement('button');
            goToButton.textContent = 'Go to highlight';
            goToButton.addEventListener('click', async () => {
                const tab = await chrome.tabs.create({ url: url });
                chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                    if (info.status === 'complete' && tabId === tab.id) {
                        chrome.tabs.sendMessage(tab.id, { action: 'goToHighlight', highlightId: highlight.id });
                        chrome.tabs.onUpdated.removeListener(listener);
                    }
                });
            });
            listItem.appendChild(goToButton);

            highlightList.appendChild(listItem);
        }
    }
}

searchInput.addEventListener('input', (e) => {
  renderSessions(e.target.value);
});

showArchivedCheckbox.addEventListener('change', () => {
  renderSessions(searchInput.value);
});


filterButtons.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        renderSessions(searchInput.value, parseInt(e.target.dataset.time));
    }
});

backButton.addEventListener('click', showListView);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sessionUpdated') {
    const listItem = document.querySelector(`li[data-key="${request.key}"]`);
    if (listItem) {
      const session = request.session;
      const progressBar = listItem.querySelector('.progress-bar');
      const timeEstimate = listItem.querySelector('.time-estimate');

      if (progressBar && session.documentHeight) {
        const progress = session.innerHeight
          ? Math.min(100, ((session.scrollPosition + session.innerHeight) / session.documentHeight) * 100)
          : (session.scrollPosition / session.documentHeight) * 100;
        progressBar.style.width = `${progress}%`;
      }

      if (timeEstimate) {
        const time = estimateTime(session);
        if (time !== -1) {
          timeEstimate.textContent = `~${Math.ceil(time / 60)} min remaining`;
        } else {
          timeEstimate.textContent = '';
        }
      }

      // Update visual state (pending, archived)
      listItem.classList.remove('pending-archive', 'archived');
      if (session.archived) {
        listItem.classList.add('archived');
      } else if (session.readCompleteTimestamp) {
        listItem.classList.add('pending-archive');
      }
    }
  }
});


showListView();
renderSessions();