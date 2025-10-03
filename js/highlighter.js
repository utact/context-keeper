let tooltip;

async function saveHighlight(highlight) {
    const url = window.location.href;
    const data = await chrome.storage.local.get(url);
    const highlights = (data && data[url] && data[url].highlights) ? data[url].highlights : [];
    highlights.push(highlight);
    await chrome.storage.local.set({ [url]: { highlights } });
}

async function restoreHighlights() {
    const url = window.location.href;
    const data = await chrome.storage.local.get(url);
    if (!data || !data[url] || !data[url].highlights) return;
    const highlights = data[url].highlights;
    for (const highlight of highlights) {
        try {
            const range = deserializeRange(highlight.range);
            const span = document.createElement('span');
            span.className = 'highlight';
            span.id = highlight.id;
            span.appendChild(range.extractContents());
            range.insertNode(span);
            if (highlight.memo) {
                span.title = highlight.memo;
            }
        } catch (e) {
            console.error('Could not restore highlight', e);
        }
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'goToHighlight') {
        const element = document.getElementById(request.highlightId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
});

document.addEventListener('mouseup', (e) => {
    if (tooltip) {
        tooltip.remove();
    }

    const selection = window.getSelection();
    if (selection.toString().length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        tooltip = document.createElement('div');
        tooltip.className = 'highlighter-tooltip';
        tooltip.style.left = `${rect.left + window.scrollX}px`;
        tooltip.style.top = `${rect.top + window.scrollY - 30}px`;
        
        const highlightButton = document.createElement('button');
        highlightButton.textContent = 'Highlight';
        highlightButton.addEventListener('click', async () => {
            const id = `highlight-${Date.now()}`;
            const text = range.toString();
            const serializedRange = serializeRange(range);
            await saveHighlight({ id: id, range: serializedRange, text: text });
            const span = document.createElement('span');
            span.className = 'highlight';
            span.id = id;
            span.appendChild(range.extractContents());
            range.insertNode(span);
            selection.removeAllRanges();
            tooltip.remove();
        });

        const memoButton = document.createElement('button');
        memoButton.textContent = 'Memo';
        memoButton.addEventListener('click', async () => {
            const memo = prompt('Enter memo:');
            if (memo) {
                const id = `highlight-${Date.now()}`;
                const text = range.toString();
                const serializedRange = serializeRange(range);
                await saveHighlight({ id: id, range: serializedRange, text: text, memo: memo });
                const span = document.createElement('span');
                span.className = 'highlight';
                span.id = id;
                span.title = memo;
                span.appendChild(range.extractContents());
                range.insertNode(span);
                selection.removeAllRanges();
                tooltip.remove();
            }
        });

        tooltip.appendChild(highlightButton);
        tooltip.appendChild(memoButton);
        document.body.appendChild(tooltip);
    }
});

restoreHighlights();
