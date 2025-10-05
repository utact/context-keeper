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

    // Right-click to show delete menu
    span.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove any existing custom context menu
        removeCustomContextMenu();

        const menu = document.createElement('div');
        menu.id = 'highlight-context-menu';
        menu.style.position = 'absolute';
        menu.style.top = `${e.pageY}px`;
        menu.style.left = `${e.pageX}px`;
        menu.style.backgroundColor = 'white';
        menu.style.border = '1px solid #ccc';
        menu.style.borderRadius = '4px';
        menu.style.padding = '5px 0';
        menu.style.zIndex = '10000';

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete Highlight';
        deleteButton.style.display = 'block';
        deleteButton.style.width = '100%';
        deleteButton.style.padding = '5px 15px';
        deleteButton.style.border = 'none';
        deleteButton.style.backgroundColor = 'transparent';
        deleteButton.style.cursor = 'pointer';
        deleteButton.style.textAlign = 'left';

        deleteButton.onmouseover = () => deleteButton.style.backgroundColor = '#f0f0f0';
        deleteButton.onmouseout = () => deleteButton.style.backgroundColor = 'transparent';

        deleteButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this highlight?')) {
                chrome.runtime.sendMessage({
                    action: 'deleteHighlight',
                    url: window.location.href,
                    highlightId: id
                });
                const childNodes = Array.from(span.childNodes);
                span.replaceWith(...childNodes);
            }
            removeCustomContextMenu();
        });

        menu.appendChild(deleteButton);
        document.body.appendChild(menu);

        // Add a listener to close the menu when clicking elsewhere
        document.addEventListener('click', removeCustomContextMenu, { once: true });
    });

    try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
    } catch (e) {
        console.error("Error wrapping range:", e);
    }
    return span;
}

function removeCustomContextMenu() {
    const existingMenu = document.getElementById('highlight-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
}

export async function restoreHighlights() {
    // Clear existing highlights before restoring
    document.querySelectorAll('.highlight').forEach(h => {
        const parent = h.parentNode;
        if (!parent) return;
        while(h.firstChild) {
            parent.insertBefore(h.firstChild, h);
        }
        parent.removeChild(h);
    });

    const session = await getSession();
    if (session && session.highlights) {
        for (const h of session.highlights) {
            try {
                const range = await deserializeRange(h.range);
                if (range) {
                    highlightRange(range, h.color, h.id, h.memo);
                }
            } catch (e) {
                console.warn('Could not restore highlight', {id: h.id, range: h.range}, e);
            }
        }
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
            const yCoord = range.getBoundingClientRect().bottom + window.scrollY;
            
            addHighlight({ id, text, range: serializedRange, color, y: yCoord });
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
    }
}

// --- Initial Load ---

loadSettings();
