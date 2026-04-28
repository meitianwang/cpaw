// Klaus Desktop — Custom dialog (replaces native confirm/alert)
// DO NOT use window.confirm / window.alert / window.prompt in the renderer.
// Use klausDialog.confirm({...}) / klausDialog.alert({...}) instead.

(function () {
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])
  const tt = (k, fb) => {
    const v = window.tt ? window.tt(k) : k
    return v === k ? (fb ?? k) : v
  }

  function ensureRoot() {
    let root = document.getElementById('klaus-dialog-root')
    if (!root) {
      root = document.createElement('div')
      root.id = 'klaus-dialog-root'
      document.body.appendChild(root)
    }
    return root
  }

  function openDialog(opts) {
    const {
      type = 'confirm', // 'confirm' | 'alert'
      title = '',
      message = '',
      confirmText,
      cancelText,
      danger = false,
      checkbox = null, // { label: string, defaultChecked?: boolean } — when set, confirm result is { confirmed, checked }
    } = opts || {}

    return new Promise((resolve) => {
      const root = ensureRoot()
      const overlay = document.createElement('div')
      overlay.className = 'klaus-dialog-overlay'

      const okFallback = danger ? tt('delete_title', 'Delete') : tt('dialog_ok', 'OK')
      const ct = esc(confirmText ?? okFallback)
      const cx = esc(cancelText ?? tt('cancel', 'Cancel'))
      const checkboxId = checkbox ? `klaus-dialog-cb-${Math.random().toString(36).slice(2, 8)}` : ''

      overlay.innerHTML = `
        <div class="klaus-dialog-backdrop"></div>
        <div class="klaus-dialog-card" role="dialog" aria-modal="true">
          ${title ? `<div class="klaus-dialog-title">${esc(title)}</div>` : ''}
          <div class="klaus-dialog-message">${esc(message)}</div>
          ${checkbox ? `
            <label class="klaus-dialog-checkbox" for="${checkboxId}">
              <input type="checkbox" id="${checkboxId}" ${checkbox.defaultChecked ? 'checked' : ''} />
              <span>${esc(checkbox.label || '')}</span>
            </label>
          ` : ''}
          <div class="klaus-dialog-footer">
            ${type === 'confirm' ? `<button class="klaus-dialog-btn klaus-dialog-cancel" type="button">${cx}</button>` : ''}
            <button class="klaus-dialog-btn klaus-dialog-confirm${danger ? ' klaus-dialog-danger' : ''}" type="button">${ct}</button>
          </div>
        </div>
      `
      root.appendChild(overlay)
      requestAnimationFrame(() => overlay.classList.add('active'))

      const cb = checkbox ? overlay.querySelector(`#${checkboxId}`) : null

      let closed = false
      const close = (confirmed) => {
        if (closed) return
        closed = true
        overlay.classList.remove('active')
        document.removeEventListener('keydown', onKey, true)
        setTimeout(() => overlay.remove(), 160)
        if (checkbox && type === 'confirm') {
          resolve({ confirmed, checked: !!(confirmed && cb?.checked) })
        } else {
          resolve(confirmed)
        }
      }
      const cancelValue = type === 'confirm' ? false : undefined
      const confirmValue = type === 'confirm' ? true : undefined

      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(cancelValue) }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(confirmValue) }
      }
      document.addEventListener('keydown', onKey, true)

      overlay.querySelector('.klaus-dialog-backdrop').addEventListener('click', () => close(cancelValue))
      overlay.querySelector('.klaus-dialog-confirm').addEventListener('click', () => close(confirmValue))
      overlay.querySelector('.klaus-dialog-cancel')?.addEventListener('click', () => close(false))

      setTimeout(() => overlay.querySelector('.klaus-dialog-confirm')?.focus(), 0)
    })
  }

  function normalize(input, extra) {
    if (input && typeof input === 'object' && !Array.isArray(input)) return { ...input, ...(extra || {}) }
    return { message: String(input ?? ''), ...(extra || {}) }
  }

  window.klausDialog = {
    confirm: (input, extra) => openDialog({ type: 'confirm', ...normalize(input, extra) }),
    alert: (input, extra) => openDialog({ type: 'alert', ...normalize(input, extra) }),
  }
})()
