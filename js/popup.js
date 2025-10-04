import { Storage } from './storage.js';

// --- DOM Elements ---
const sessionList = document.getElementById('session-list');
const searchInput = document.getElementById('search-input');
const showArchivedCheckbox = document.getElementById('show-archived-checkbox');
const sortBySelect = document.getElementById('sort-by');
const autoSaveCheckbox = document.getElementById('auto-save-on-highlight-checkbox');
const filterButtonGroup = document.querySelector('.filter-group');

// --- State ---
let allSessionItems = [];
let renderedItemCount = 0;
const ITEMS_PER_PAGE = 20;
let settings = {};

// --- Helper Functions ---

function estimateTime(session) {
  if (!session.documentHeight || session.documentHeight === 0) return -1;
  const readPercentage = (session.scrollPosition + session.innerHeight) / session.documentHeight;
  const remainingPercentage = 1 - readPercentage;
  if (remainingPercentage <= 0.15) return 0; // Considered done
  const pixelsPerMinute = 2000; // Adjusted for a more realistic reading speed
  const remainingPixels = session.documentHeight * remainingPercentage;
  return Math.ceil(remainingPixels / pixelsPerMinute);
}

function getForgettingCurveClass(lastVisited) {
    const days = (Date.now() - lastVisited) / (1000 * 60 * 60 * 24);
    if (days < 7) return 'title-fresh';
    if (days < 21) return 'title-stale';
    return 'title-old';
}

function getDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch (e) {
        return url;
    }
}

// --- Main Logic ---

async function initialLoad() {
    const data = await Storage.getAll();
    settings = data.settings || { autoSaveOnHighlight: false };
    allSessionItems = Object.entries(data).filter(([key]) => key.startsWith('session-'));
    
    autoSaveCheckbox.checked = settings.autoSaveOnHighlight;

    rerenderList();
}

autoSaveCheckbox.addEventListener('change', async () => {
    settings.autoSaveOnHighlight = autoSaveCheckbox.checked;
    await Storage.set('settings', settings);
});

function rerenderList() {
    renderedItemCount = 0;
    sessionList.innerHTML = '';
    renderPage();
}

function renderPage() {
    const filter = searchInput.value.toLowerCase();
    const showArchived = showArchivedCheckbox.checked;
    const [sortKey, sortDir] = sortBySelect.value.split('-');
    const timeFilterButton = filterButtonGroup.querySelector('button.active');
    const timeFilter = timeFilterButton ? parseInt(timeFilterButton.dataset.time) : -1;

    // 1. Filter
    const filteredItems = allSessionItems.filter(([, item]) => {
        const matchesArchive = showArchived ? item.archived : !item.archived;
        if (!matchesArchive) return false;

        const title = item.customTitle || item.title;
        const matchesFilter = title.toLowerCase().includes(filter) || getDomain(item.url).toLowerCase().includes(filter);
        if (!matchesFilter) return false;

        if (timeFilter !== -1) {
            const estimatedMinutes = estimateTime(item);
            if (estimatedMinutes === 0 || estimatedMinutes > timeFilter) {
                return false;
            }
        }

        return true;
    });

    // 2. Sort
    filteredItems.sort(([, a], [, b]) => {
        let valA, valB;
        if (sortKey === 'time') {
            valA = estimateTime(a);
            valB = estimateTime(b);
        } else if (sortKey === 'title') {
            valA = a.customTitle || a.title;
            valB = b.customTitle || b.title;
        } else { // lastVisited
            valA = a.lastVisited;
            valB = b.lastVisited;
        }

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Paginate and Render
    const itemsToRender = filteredItems.slice(renderedItemCount, renderedItemCount + ITEMS_PER_PAGE);
    for (const [key, value] of itemsToRender) {
        const listItem = createSessionCard(key, value);
        sessionList.appendChild(listItem);
    }
    renderedItemCount += itemsToRender.length;

    // 4. "Load More" Button
    const loadMoreButton = document.getElementById('load-more-btn');
    if (loadMoreButton) loadMoreButton.remove();

    if (renderedItemCount < filteredItems.length) {
        const button = document.createElement('button');
        button.id = 'load-more-btn';
        button.textContent = 'Load More';
        button.addEventListener('click', renderPage);
        sessionList.appendChild(button);
    }
}

function createSessionCard(key, value) {
    const card = document.createElement('li');
    card.className = 'session-card';
    if (value.archived) card.classList.add('archived');
    else if (value.readCompleteTimestamp) card.classList.add('pending-archive');

    const progress = value.documentHeight ? Math.min(100, ((value.scrollPosition + value.innerHeight) / value.documentHeight) * 100) : 0;
    const estimatedMinutes = estimateTime(value);

    card.innerHTML = `
        <div class="session-header">
            <div class="session-info">
                <span class="session-title"></span>
                <span class="session-domain">${getDomain(value.url)}</span>
            </div>
            <div class="session-actions">
                <button class="edit-btn" title="Edit title">✏️</button>
                <button class="delete-btn" title="Delete session">🗑️</button>
            </div>
        </div>
        <div class="session-footer">
            <div class="progress-container">
                <div class="progress-bar" style="width: ${progress}%;"></div>
            </div>
            <div class="time-estimate">${estimatedMinutes > 0 ? `~${estimatedMinutes} min` : 'Done'}</div>
        </div>
    `;

    const titleEl = card.querySelector('.session-title');
    titleEl.textContent = value.customTitle || value.title;
    titleEl.classList.add(getForgettingCurveClass(value.lastVisited));

    // --- Event Listeners for card actions ---
    card.querySelector('.session-info').addEventListener('click', async () => {
        chrome.tabs.create({ url: value.url });
    });

    card.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const newTitle = prompt('Enter new title:', value.customTitle || value.title);
        if (newTitle && newTitle !== (value.customTitle || value.title)) {
            value.customTitle = newTitle;
            Storage.set(key, value).then(rerenderList);
        }
    });

    card.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this session?')) {
            await Storage.remove(key);
            allSessionItems = allSessionItems.filter(([k]) => k !== key);
            rerenderList();
        }
    });

    return card;
}

// --- Global Event Listeners ---

searchInput.addEventListener('input', rerenderList);
showArchivedCheckbox.addEventListener('change', rerenderList);
sortBySelect.addEventListener('change', rerenderList);

filterButtonGroup.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        filterButtonGroup.querySelector('button.active').classList.remove('active');
        e.target.classList.add('active');
        rerenderList();
    }
});

// --- Initial Load ---

initialLoad();