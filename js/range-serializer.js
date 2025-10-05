function getXPath(node) {
    if (node.id) {
        return `id('${node.id}')`;
    }
    if (node.parentNode === null) { // Root node
        return '/' + (node.tagName ? node.tagName.toLowerCase() : '');
    }

    const parentPath = getXPath(node.parentNode);
    let ix = 1;
    for (const sibling of node.parentNode.childNodes) {
        if (sibling === node) {
            const nodeName = node.nodeType === 1 ? node.tagName.toLowerCase() : 'text()';
            return `${parentPath}/${nodeName}[${ix}]`;
        }
        if (sibling.nodeType === node.nodeType && (sibling.nodeType !== 1 || sibling.tagName === node.tagName)) {
            ix++;
        }
    }
    // This part should ideally not be reached if node is part of the DOM
    return null; 
}

export function serializeRange(range) {
    return {
        startContainerXPath: getXPath(range.startContainer),
        startOffset: range.startOffset,
        endContainerXPath: getXPath(range.endContainer),
        endOffset: range.endOffset,
    };
}

export async function deserializeRange(serializedRange, retries = 3, delay = 150) {
    for (let i = 0; i < retries; i++) {
        try {
            const startContainer = document.evaluate(serializedRange.startContainerXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            const endContainer = document.evaluate(serializedRange.endContainerXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

            if (startContainer && endContainer) {
                const range = document.createRange();
                range.setStart(startContainer, serializedRange.startOffset);
                range.setEnd(endContainer, serializedRange.endOffset);
                return range;
            }
        } catch (e) {
            console.warn('Error during XPath evaluation', e);
        }

        // If nodes not found or an error occurred, wait before retrying
        if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // If it fails after all retries, log a more detailed error and return null.
    console.warn('Could not find container nodes for highlight after multiple retries. This highlight may be permanently broken.', {
        startXPath: serializedRange.startContainerXPath,
        endXPath: serializedRange.endContainerXPath
    });
    return null;
}
