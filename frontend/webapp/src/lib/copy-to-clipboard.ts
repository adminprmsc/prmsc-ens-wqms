/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only works in secure contexts (HTTPS or localhost).
 * Production on plain HTTP must use the legacy execCommand fallback.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('Clipboard is not available')
  }

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)

    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error("execCommand('copy') returned false")
    }
  } finally {
    document.body.removeChild(textarea)
  }
}
