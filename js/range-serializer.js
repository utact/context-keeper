function getXPath(node) {
    if (node.id !== '') {
        return `id("${node.id}")`;
    }
    if (node === document.body) {
        return node.tagName;
    }

    let ix = 0;
    const siblings = node.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === node) {
            return `${getXPath(node.parentNode)}/${node.tagName}[${ix + 1}]`;
        }
        if (sibling.nodeType === 1 && sibling.tagName === node.tagName) {
            ix++;
        }
    }
}

function serializeRange(range) {
    return {
        startContainerXPath: getXPath(range.startContainer),
        startOffset: range.startOffset,
        endContainerXPath: getXPath(range.endContainer),
        endOffset: range.endOffset,
    };
}

function deserializeRange(serializedRange) {
    const startContainer = document.evaluate(serializedRange.startContainerXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const endContainer = document.evaluate(serializedRange.endContainerXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

    const range = document.createRange();
    range.setStart(startContainer, serializedRange.startOffset);
    range.setEnd(endContainer, serializedRange.endOffset);
    return range;
}
