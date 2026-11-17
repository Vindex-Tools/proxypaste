/**
 * Clipboard and text selection abstractions.
 */

/**
 * Copies text to the system clipboard.
 * Supports modern Clipboard API and fallback for extension popup contexts.
 * @param {string} text 
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (typeof text !== 'string') return false;

  // Attempt modern navigator.clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, using fallback:', err);
    }
  }

  // Fallback: temporary hidden textarea
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('execCommand copy failed:', err);
    return false;
  }
}

/**
 * Selects/highlights all text within a DOM element for visual selection.
 * @param {HTMLElement} element 
 */
export function selectElementText(element) {
  if (!element) return;
  try {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (err) {
    console.warn('Failed to programmatically select element text:', err);
  }
}

/**
 * Displays an animated toast message in a given container.
 * @param {HTMLElement} toastElement 
 * @param {string} message 
 * @param {'success'|'error'|'info'} type 
 * @param {number} durationMs 
 */
let toastTimeout = null;
export function showToast(toastElement, message, type = 'info', durationMs = 2500) {
  if (!toastElement) return;

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  toastElement.textContent = message;
  toastElement.className = `toast toast-${type} toast-visible`;

  toastTimeout = setTimeout(() => {
    toastElement.className = 'toast';
    toastTimeout = null;
  }, durationMs);
}
