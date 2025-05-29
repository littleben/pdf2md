// script is now type="module"

// import TurndownService from './lib/turndown.js'; // Removed import

document.addEventListener('DOMContentLoaded', function () {
    console.log('Popup DOMContentLoaded - Running script');
    // Initialize internationalization
    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const messageKey = elem.getAttribute('data-i18n');
        const message = chrome.i18n.getMessage(messageKey);
        if (message) {
            if (elem.tagName === 'TITLE') {
                document.title = message;
            } else if (elem.hasAttribute('placeholder')) {
                elem.placeholder = message;
            } else {
                elem.innerHTML = message; // Use innerHTML to support HTML in messages
            }
        }
    });

    console.log('Popup DOMContentLoaded'); // Log 1

    const fileInput = document.getElementById('fileInput');
    const fileNameSpan = document.getElementById('fileName');
    const markdownOutput = document.getElementById('markdownOutput');
    const outputContainer = document.getElementById('outputContainer');
    const copyButton = document.getElementById('copyButton');
    const downloadButton = document.getElementById('downloadButton');
    const statusDiv = document.getElementById('status');
    const converterSection = document.querySelector('.converter-section');

    console.log('converterSection selected:', converterSection); // Log: Check if element is found

    // Initialize pdf.js worker
    if (window.pdfjsLib) {
        console.log('pdf.js library found'); // Log 2
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    } else {
        console.error("pdf.js library (window.pdfjsLib) not found. Ensure lib/pdf.min.js is loaded.");
        setStatus(chrome.i18n.getMessage('statusUnknownError') + " (PDF lib missing)", 'error');
        return;
    }

    let turndownService;
    if (window.TurndownService) { // Now expect TurndownService on window object
        console.log('TurndownService found on window object');
        turndownService = new window.TurndownService();
    } else {
        console.error("TurndownService not found on window object. Ensure lib/turndown.min.js is loaded and correct.");
        setStatus(chrome.i18n.getMessage('statusUnknownError') + " (Markdown lib missing or not a constructor)", 'error');
        return;
    }

    fileInput.addEventListener('change', handleFileSelect);
    copyButton.addEventListener('click', handleCopy);
    downloadButton.addEventListener('click', handleDownload);

    if (!converterSection) {
        console.error('.converter-section element not found in HTML!');
        //setStatus('UI Error: Missing converter section', 'error'); // Optional: inform user
        // return; // Might be too disruptive, but good for debugging
    }

    function setStatus(message, type = 'info') {
        console.log(`Setting status: ${message}, type: ${type}`); // Log status changes
        statusDiv.textContent = message;
        statusDiv.className = type; // Use for styling (e.g., 'info', 'success', 'error')
        // Clear status after some time
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 5000);
    }

    async function handleFileSelect(event) {
        console.log('handleFileSelect triggered');
        const file = event.target.files[0];

        if (!converterSection) {
            console.warn('converterSection is null inside handleFileSelect');
        }

        if (!file) {
            fileNameSpan.textContent = chrome.i18n.getMessage('initialFileName');
            outputContainer.style.display = 'none';
            if (converterSection) converterSection.classList.remove('minimized');
            console.log('No file selected, removed minimized class. Current classes:', converterSection ? converterSection.className : 'converterSection not found');
            return;
        }

        if (file.type !== 'application/pdf') {
            setStatus(chrome.i18n.getMessage('statusSelectFile'), 'error');
            fileNameSpan.textContent = chrome.i18n.getMessage('initialFileName');
            outputContainer.style.display = 'none';
            if (converterSection) converterSection.classList.remove('minimized');
            fileInput.value = ''; 
            console.log('Incorrect file type, removed minimized class. Current classes:', converterSection ? converterSection.className : 'converterSection not found');
            return;
        }

        fileNameSpan.textContent = file.name;
        setStatus(chrome.i18n.getMessage('statusConverting'), 'info');
        outputContainer.style.display = 'none';
        markdownOutput.value = '';
        console.log(`Processing file: ${file.name}`);

        try {
            const arrayBuffer = await file.arrayBuffer();
            console.log('File read into ArrayBuffer', arrayBuffer); // Log 8
            
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            console.log('PDF document loaded', pdf); // Log 9
            console.log(`Number of pages: ${pdf.numPages}`); // Log 10
            let fullTextContent = '';

            // Basic text extraction - for more complex PDFs, might need HTML extraction
            for (let i = 1; i <= pdf.numPages; i++) {
                console.log(`Processing page ${i}`); // Log 11
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                console.log(`Text content for page ${i}:`, textContent); // Log 12
                // textContent.items is an array of text items. Join them.
                // This basic concatenation might lose some formatting. 
                // For better results, one might render to an offscreen canvas/HTML and then convert.
                textContent.items.forEach(item => {
                    fullTextContent += item.str + (item.hasEOL ? '\n' : ' ');
                });
                if (i < pdf.numPages) {
                   fullTextContent += '\n\n'; // Add a separator between pages 
                }
            }
            console.log('Full extracted text content:', fullTextContent.substring(0, 200) + "..."); // Log 13 (preview)
            
            // Convert extracted text (or HTML if a more complex method was used) to Markdown
            // Since pdf.js getTextContent() gives plain text, direct use might be fine for simple cases,
            // but Turndown expects HTML. For now, we'll wrap in <pre> for basic Markdown conversion.
            // A more robust solution would involve converting PDF to HTML first.
            // For now, let's assume fullTextContent is pseudo-HTML or plain text that Turndown can handle.
            // If fullTextContent is plain text, it might not be well-formatted by Turndown.
            // A better approach would be to convert PDF to HTML representation first.
            // Let's try a simple direct conversion. If results are poor, we might need an intermediate PDF->HTML step.

            // Simple approach: treat the extracted text as preformatted.
            // This won't create rich Markdown (headings, lists, etc.) from PDF structure.
            // It will mostly preserve line breaks from the text extraction.
            const htmlInputForTurndown = `<pre>${escapeHtml(fullTextContent)}</pre>`;
            console.log('HTML input for Turndown (preview):', htmlInputForTurndown.substring(0, 200) + "..."); // Log 14

            const markdown = turndownService.turndown(htmlInputForTurndown);
            console.log('Markdown generated (preview):', markdown.substring(0, 200) + "..."); // Log 15
            
            markdownOutput.value = markdown.trim();
            outputContainer.style.display = 'block';
            if (converterSection) converterSection.classList.add('minimized');
            console.log('Conversion successful, added minimized class. Current classes:', converterSection ? converterSection.className : 'converterSection not found');
            setStatus(chrome.i18n.getMessage('statusSuccess'), 'success');

        } catch (error) {
            console.error('Error during PDF processing:', error);
            let errorMessage = chrome.i18n.getMessage('statusUnknownError');
            // Check if error is an object and has a message property
            const errorDetail = (typeof error === 'object' && error !== null && error.message) ? error.message : String(error);
            errorMessage = chrome.i18n.getMessage('statusConversionError', { errorMessage: errorDetail });
            setStatus(errorMessage, 'error');
            outputContainer.style.display = 'none';
            if (converterSection) converterSection.classList.remove('minimized');
            console.log('Error in processing, removed minimized class. Current classes:', converterSection ? converterSection.className : 'converterSection not found');
        }
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }

    function handleCopy() {
        if (!markdownOutput.value) return;
        navigator.clipboard.writeText(markdownOutput.value)
            .then(() => setStatus(chrome.i18n.getMessage('statusCopySuccess'), 'success'))
            .catch(err => {
                console.error('Failed to copy: ', err);
                setStatus(chrome.i18n.getMessage('statusCopyError'), 'error');
            });
    }

    function handleDownload() {
        if (!markdownOutput.value) return;
        const blob = new Blob([markdownOutput.value], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        let fileNameBase = document.getElementById('fileName').textContent || 'converted';
        if (fileNameBase.toLowerCase().endsWith('.pdf')) {
            fileNameBase = fileNameBase.substring(0, fileNameBase.length - 4);
        }
        a.download = `${fileNameBase}.md`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus(chrome.i18n.getMessage('statusDownloadStarted'), 'info');
    }
});