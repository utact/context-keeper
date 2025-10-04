import { deserializeRange, serializeRange } from './range-serializer.js';

let activeTooltip = null;
let settings = { highlighterEnabled: true }; // Default setting

const HIGHLIGHT_COLORS = ['yellow', 'pink', 'green', 'blue'];

// --- Settings Management ---

async function loadSettings() {
    const data = await chrome.storage.local.get('settings');
    if (data.settings) {
        settings = data.settings;
    }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.settings) {
        settings = changes.settings.newValue;
        console.log('Highlighter settings updated:', settings);
    }
});

// --- Communication with Background Script ---
function addHighlight(highlightData) {
    chrome.runtime.sendMessage({ action: 'addHighlight', highlight: highlightData, url: window.location.href });
}

function getSession() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getSession', url: window.location.href }, (response) => {
            resolve(response ? response.session : null);
        });
    });
}

// --- Highlight Creation and Restoration ---

function highlightRange(range, color, id, memo) {
    const span = document.createElement('span');
    span.className = `highlight highlight-${color}`;
    span.id = id;
    if (memo) {
        span.classList.add('highlight-memo-indicator');
        span.title = memo; // Show memo on hover
    }
    try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
    } catch (e) {
        console.error("Error wrapping range:", e);
    }
    return span;
}

export async function restoreHighlights() {
    removeRestoreFallbackUI();
    // Clear existing highlights before restoring
    document.querySelectorAll('.highlight').forEach(h => h.outerHTML = h.innerHTML);

    const session = await getSession();
    if (session && session.highlights) {
        let failedCount = 0;
        session.highlights.forEach(h => {
            try {
                const range = deserializeRange(h.range);
                if (range) {
                    highlightRange(range, h.color, h.id, h.memo);
                } else {
                    failedCount++;
                }
            } catch (e) {
                failedCount++;
                console.error('Could not restore highlight', h.id, e);
            }
        });

        if (failedCount > 0) {
            showRestoreFallbackUI(failedCount);
        }
    }
}

function showRestoreFallbackUI(failedCount) {
    let fallbackUI = document.getElementById('context-keeper-fallback-ui');
    if (!fallbackUI) {
        fallbackUI = document.createElement('div');
        fallbackUI.id = 'context-keeper-fallback-ui';
        document.body.appendChild(fallbackUI);
    }
    fallbackUI.innerHTML = `
        <span>${failedCount} highlight(s) failed to load.</span>
        <button id="context-keeper-retry-btn">Retry (Ctrl+Shift+H)</button>
    `;

    document.getElementById('context-keeper-retry-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'forceRestore' });
    });
}

function removeRestoreFallbackUI() {
    const fallbackUI = document.getElementById('context-keeper-fallback-ui');
    if (fallbackUI) {
        fallbackUI.remove();
    }
}

// --- UI: Tooltip --- 

function createTooltip(range) {
    removeTooltip(); // Remove any existing tooltip

    const rect = range.getBoundingClientRect();
    activeTooltip = document.createElement('div');
    activeTooltip.className = 'highlighter-tooltip';
    activeTooltip.style.left = `${rect.left + window.scrollX}px`;
    activeTooltip.style.top = `${rect.top + window.scrollY - activeTooltip.offsetHeight - 10}px`;

    // Color Palette
    const colorPalette = document.createElement('div');
    colorPalette.className = 'color-palette';
    HIGHLIGHT_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.addEventListener('click', () => {
            const id = `highlight-${Date.now()}`;
            const text = range.toString();
            const serializedRange = serializeRange(range);
            
            addHighlight({ id, text, range: serializedRange, color });
            highlightRange(range, color, id);
            window.getSelection()?.removeAllRanges();
            removeTooltip();
        });
        colorPalette.appendChild(swatch);
    });

    // Memo Button
    const memoButton = document.createElement('button');
    memoButton.textContent = 'M';
    memoButton.addEventListener('click', () => showMemoInput(range));

    activeTooltip.appendChild(colorPalette);
    activeTooltip.appendChild(memoButton);
    document.body.appendChild(activeTooltip);
    
    // Reposition if it's off-screen
    activeTooltip.style.top = `${rect.top + window.scrollY - activeTooltip.offsetHeight - 5}px`;
}

function showMemoInput(range) {
    const selectionText = range.toString();
    if (!selectionText) return;

    removeTooltip(); // Remove color palette tooltip

    const rect = range.getBoundingClientRect();
    activeTooltip = document.createElement('div');
    activeTooltip.className = 'highlighter-tooltip';
    activeTooltip.style.left = `${rect.left + window.scrollX}px`;
    activeTooltip.style.top = `${rect.top + window.scrollY - activeTooltip.offsetHeight - 10}px`;

    const inputContainer = document.createElement('div');
    inputContainer.className = 'memo-input-container';

    const memoInput = document.createElement('input');
    memoInput.type = 'text';
    memoInput.className = 'memo-input';
    memoInput.placeholder = 'Add a memo...';

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.className = 'memo-save-btn';
    saveButton.addEventListener('click', () => {
        const memo = memoInput.value;
        if (memo) {
            const id = `highlight-${Date.now()}`;
            const text = range.toString();
            const color = 'yellow'; // Default color for memos
            const serializedRange = serializeRange(range);

            addHighlight({ id, text, range: serializedRange, color, memo });
            highlightRange(range, color, id, memo);
            window.getSelection()?.removeAllRanges();
            removeTooltip();
        }
    });

    inputContainer.appendChild(memoInput);
    inputContainer.appendChild(saveButton);
    activeTooltip.appendChild(inputContainer);
    document.body.appendChild(activeTooltip);
    memoInput.focus();
    
    // Reposition
    activeTooltip.style.top = `${rect.top + window.scrollY - activeTooltip.offsetHeight - 5}px`;
}

function removeTooltip() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
}

// --- Event Listeners ---

document.addEventListener('mouseup', (e) => {
    // Don't show tooltip if clicking inside an existing one
    if (activeTooltip && activeTooltip.contains(e.target)) {
        return;
    }
    removeTooltip();

    const selection = window.getSelection();
    if (selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.toString().trim().length > 0) {
        // Only show the tooltip if the feature is enabled
        if (settings.highlighterEnabled) {
            createTooltip(range);
        }
    }
});

document.addEventListener('mousedown', (e) => {
    // Remove tooltip if clicking outside of it, but not on a highlight
    if (activeTooltip && !activeTooltip.contains(e.target) && !e.target.classList.contains('highlight')) {
        removeTooltip();
    }
});

export function handleHighlighterMessages(request) {
    if (request.action === 'goToHighlight') {
        const element = document.getElementById(request.highlightId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else if (request.action === 'forceRestore') {
        restoreHighlights();
    }
}

// --- Initial Load ---

loadSettings();
