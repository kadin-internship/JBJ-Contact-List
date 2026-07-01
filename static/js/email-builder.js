// Email builder -- a single rich-text compose area with a formatting
// toolbar, modeled on Gmail/Outlook's compose window rather than a
// drag-and-drop block canvas (native HTML5 drag-and-drop turned out to be
// unreliable across browsers and wasn't how people expect to write an
// email anyway). The "build your own" counterpart to the AI Draft Email
// tool on the main page, not a replacement for it.
const el = (id) => document.getElementById(id)

let dirty = false
let pendingAttachments = []
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENTS_BYTES = 15 * 1024 * 1024

function existingHtml() {
  const blocks = (window.EMAIL_TEMPLATE && window.EMAIL_TEMPLATE.blocks) || []
  const body = blocks.find((b) => b.type === 'richtext')
  return (body && body.html) || '<p><br></p>'
}

function markDirty() {
  dirty = true
  const status = el('ebSaveStatus')
  if (status) status.textContent = 'Unsaved changes'
}

function runCmd(cmd, value) {
  el('ebEditor').focus()
  document.execCommand(cmd, false, value)
  markDirty()
  updateToolbarState()
}

function insertHtmlAtCursor(html) {
  el('ebEditor').focus()
  document.execCommand('insertHTML', false, html)
  markDirty()
}

// Toolbar buttons otherwise look identical whether the cursor is in bold
// text or not -- highlight whichever commands are active at the current
// selection, same as Gmail/Word's toolbar, so formatting is visible at a
// glance instead of only showing up as a (sometimes hard to notice) style
// change in the text itself.
const TRACKED_COMMANDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight']

function updateToolbarState() {
  document.querySelectorAll('.eb-toolbar button[data-cmd]').forEach((btn) => {
    const cmd = btn.dataset.cmd
    if (!TRACKED_COMMANDS.includes(cmd)) return
    let active = false
    try { active = document.queryCommandState(cmd) } catch (e) { active = false }
    btn.classList.toggle('active', active)
  })

  const sel = window.getSelection()
  const editor = el('ebEditor')
  const formatSelect = el('ebFormatSelect')
  if (!sel || !sel.anchorNode || !formatSelect) return
  let node = sel.anchorNode
  if (node.nodeType === 3) node = node.parentElement
  let blockTag = 'P'
  while (node && node !== editor) {
    if (['H2', 'H3', 'P'].includes(node.tagName)) { blockTag = node.tagName; break }
    node = node.parentElement
  }
  formatSelect.value = blockTag
}

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function setupToolbar() {
  document.querySelectorAll('.eb-toolbar button[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      runCmd(btn.dataset.cmd)
    })
  })

  el('ebFormatSelect').addEventListener('mousedown', () => el('ebEditor').focus())
  el('ebFormatSelect').addEventListener('change', () => {
    runCmd('formatBlock', el('ebFormatSelect').value)
  })

  const fontSizeSelect = el('ebFontSizeSelect')
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', () => {
      const size = fontSizeSelect.value
      if (!size) return
      el('ebEditor').focus()
      document.execCommand('fontSize', false, '7')
      el('ebEditor').querySelectorAll('font[size="7"]').forEach(node => {
        node.removeAttribute('size')
        node.style.fontSize = size
      })
      fontSizeSelect.value = ''
      updateToolbarState()
      markDirty()
    })
  }

  const colorInput = el('ebColorInput')
  colorInput.addEventListener('mousedown', () => el('ebEditor').focus())
  colorInput.addEventListener('input', () => runCmd('foreColor', colorInput.value))

  const highlightInput = el('ebHighlightInput')
  if (highlightInput) {
    highlightInput.addEventListener('mousedown', () => el('ebEditor').focus())
    highlightInput.addEventListener('input', () => runCmd('hiliteColor', highlightInput.value))
  }

  document.querySelectorAll('.eb-toolbar button[data-action]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const action = btn.dataset.action
      if (action === 'link') {
        closeAttachMenu()
        const url = prompt('Link URL:')
        if (!url) return
        runCmd('createLink', url)
      } else if (action === 'image') {
        closeAttachMenu()
        const url = prompt('Image URL:')
        if (!url) return
        insertHtmlAtCursor(`<img src="${escapeAttr(url)}" alt="" style="max-width:100%;display:block;margin:8px 0;">`)
      } else if (action === 'button') {
        const text = prompt('Button text:', 'Click here')
        if (!text) return
        const url = prompt('Button link URL:')
        if (!url) return
        insertHtmlAtCursor(`<div style="text-align:center;margin:12px 0;"><a href="${escapeAttr(url)}" style="background:#AD0304;color:#ffffff;display:inline-block;padding:12px 24px;border-radius:999px;font-weight:600;text-decoration:none;">${escapeAttr(text)}</a></div>`)
      } else if (action === 'divider') {
        insertHtmlAtCursor('<hr style="border:none;border-top:2px solid #cccccc;margin:16px 0;">')
      } else if (action === 'logo') {
        insertHtmlAtCursor('<div style="text-align:center;margin:8px 0;"><img src="/static/img/logo.png" alt="JBJ Management" style="width:160px;max-width:100%;"></div>')
      }
    })
  })
}

function setPreview(mode) {
  el('ebEditor').classList.toggle('eb-canvas-mobile', mode === 'mobile')
  el('ebDesktopBtn').classList.toggle('active', mode === 'desktop')
  el('ebMobileBtn').classList.toggle('active', mode === 'mobile')
}

function closeAttachMenu() {
  const menu = el('ebAttachMenu')
  if (menu) menu.style.display = 'none'
}

function renderAttachmentChips() {
  const list = el('ebAttachmentList')
  list.innerHTML = pendingAttachments.map((f, i) => `
    <span class="eb-attachment-chip">
      <i class="fas fa-paperclip"></i> ${escapeAttr(f.name)}
      <button type="button" data-remove-index="${i}" title="Remove"><i class="fas fa-xmark"></i></button>
    </span>
  `).join('')
  list.querySelectorAll('[data-remove-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingAttachments.splice(Number(btn.dataset.removeIndex), 1)
      renderAttachmentChips()
      markDirty()
    })
  })
  updateSendAttachmentSummary()
}

function updateSendAttachmentSummary() {
  const summary = el('sendEmailAttachmentSummary')
  if (!summary) return
  if (!pendingAttachments.length) {
    summary.innerHTML = 'No files attached. Use the <i class="fas fa-paperclip"></i> button in the toolbar to attach one.'
  } else {
    summary.textContent = `${pendingAttachments.length} file(s) attached: ${pendingAttachments.map((f) => f.name).join(', ')}`
  }
}

function setupAttachments() {
  const attachBtn = el('ebAttachBtn')
  const menu = el('ebAttachMenu')
  const fileInput = el('ebFileInput')

  attachBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    menu.style.display = menu.style.display === 'none' ? '' : 'none'
  })
  document.addEventListener('click', (e) => {
    if (menu.style.display !== 'none' && !menu.contains(e.target) && e.target !== attachBtn) closeAttachMenu()
  })

  el('ebAttachFileItem').addEventListener('click', () => {
    closeAttachMenu()
    fileInput.click()
  })

  fileInput.addEventListener('change', () => {
    const status = el('ebSaveStatus')
    const incoming = Array.from(fileInput.files)
    if (pendingAttachments.length + incoming.length > MAX_ATTACHMENTS) {
      if (status) status.textContent = `You can attach at most ${MAX_ATTACHMENTS} files.`
      fileInput.value = ''
      return
    }
    const totalBytes = [...pendingAttachments, ...incoming].reduce((sum, f) => sum + f.size, 0)
    if (totalBytes > MAX_ATTACHMENTS_BYTES) {
      if (status) status.textContent = 'Attachments are too large (15MB total limit).'
      fileInput.value = ''
      return
    }
    pendingAttachments.push(...incoming)
    fileInput.value = ''
    renderAttachmentChips()
    markDirty()
  })
}

function setupSendModal() {
  const modal = el('sendEmailModal')
  if (!modal) return
  el('ebSendBtn').addEventListener('click', () => {
    el('sendEmailStatus').textContent = ''
    el('sendEmailTo').value = ''
    updateSendAttachmentSummary()
    modal.style.display = ''
    el('sendEmailTo').focus()
  })
  el('closeSendEmailModal').addEventListener('click', () => { modal.style.display = 'none' })

  el('sendEmailConfirmBtn').addEventListener('click', async () => {
    const status = el('sendEmailStatus')
    const to = el('sendEmailTo').value.trim()
    if (!to) { status.textContent = 'Enter a recipient email address.'; return }

    const formData = new FormData()
    formData.append('to', to)
    formData.append('subject', el('ebSubjectInput').value.trim() || el('ebNameInput').value.trim())
    formData.append('html', el('ebEditor').innerHTML)
    pendingAttachments.forEach((f) => formData.append('attachments', f))

    const btn = el('sendEmailConfirmBtn')
    btn.disabled = true
    status.textContent = 'Sending…'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45000)
    try {
      const res = await fetch(`/api/email-templates/${window.EMAIL_TEMPLATE_ID}/send`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timer)
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        status.textContent = `Sent to ${to}.`
        setTimeout(() => { modal.style.display = 'none' }, 1200)
      } else {
        status.textContent = j.error || 'Could not send.'
      }
    } catch (e) {
      clearTimeout(timer)
      status.textContent = e.name === 'AbortError' ? 'Timed out — check your SMTP settings or try again.' : 'Could not reach the server.'
    } finally {
      btn.disabled = false
    }
  })
}

async function saveTemplate() {
  const status = el('ebSaveStatus')
  status.textContent = 'Saving…'
  const body = {
    name: el('ebNameInput').value.trim() || 'Untitled email',
    subject: el('ebSubjectInput').value.trim(),
    blocks: [{ id: 'body', type: 'richtext', html: el('ebEditor').innerHTML }],
  }
  try {
    const res = await fetch(`/api/email-templates/${window.EMAIL_TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      dirty = false
      status.textContent = 'Saved.'
      setTimeout(() => { if (!dirty) status.textContent = '' }, 2000)
    } else {
      status.textContent = 'Could not save.'
    }
  } catch (e) {
    status.textContent = 'Could not reach the server.'
  }
}

const BLOCKS = {
  heading:      () => `<h2 style="font-family:'Archivo Black',sans-serif;color:#AD0304;border-bottom:2px solid #AD0304;padding-bottom:8px;margin:20px 0 12px;">Section Heading</h2>`,
  subheading:   () => `<h3 style="color:#3D4041;margin:16px 0 8px;">Subheading</h3>`,
  paragraph:    () => `<p style="line-height:1.6;color:#333;margin:0 0 12px;">Your paragraph text here.</p>`,
  quote:        () => `<blockquote style="border-left:4px solid #AD0304;margin:16px 0;padding:12px 16px;background:#fafafa;font-style:italic;color:#555;">"Your quote text here."</blockquote>`,
  divider:      () => `<hr style="border:none;border-top:2px solid #e0e0e0;margin:20px 0;">`,
  spacer:       () => `<div style="height:32px;">&nbsp;</div>`,
  columns:      () => `<table width="100%" style="border-collapse:collapse;margin:12px 0;"><tr><td width="48%" style="padding-right:8px;vertical-align:top;">Left column text here.</td><td width="4%"></td><td width="48%" style="padding-left:8px;vertical-align:top;">Right column text here.</td></tr></table>`,
  announcement: () => `<div style="background:#1a1a1a;color:#ffffff;padding:16px 20px;border-radius:8px;text-align:center;margin:16px 0;"><strong style="font-size:18px;">📢 Important Announcement</strong><p style="margin:8px 0 0;opacity:0.85;">Your announcement message here.</p></div>`,
  logo:         () => `<div style="text-align:center;margin:16px 0;"><img src="/static/img/logo.png" alt="JBJ Management" style="width:160px;max-width:100%;"></div>`,
  cta:          () => {
    const text = prompt('Button text:', 'Register Here') || 'Register Here'
    const url  = prompt('Button link URL:', 'https://') || '#'
    return `<div style="text-align:center;margin:20px 0;"><a href="${escapeAttr(url)}" style="background:#AD0304;color:#ffffff;display:inline-block;padding:14px 32px;border-radius:999px;font-weight:600;text-decoration:none;font-size:16px;">${escapeAttr(text)}</a></div>`
  },
  image:        () => {
    const url = prompt('Image URL:', 'https://')
    if (!url) return null
    return `<div style="text-align:center;margin:12px 0;"><img src="${escapeAttr(url)}" alt="" style="max-width:100%;border-radius:6px;"></div>`
  },
  social:       () => `<div style="text-align:center;padding:14px 0;font-size:14px;letter-spacing:0.5px;"><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">Facebook</a><span style="color:#ccc;">·</span><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">Instagram</a><span style="color:#ccc;">·</span><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">LinkedIn</a></div>`,
  signature:    () => `<div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:14px;line-height:1.6;"><strong>Your Name</strong><br><span style="color:#555;">Title · JBJ Management</span><br><span style="color:#888;">email@jbj-management.com · (555) 000-0000</span></div>`,
  footer:       () => `<div style="text-align:center;font-size:12px;color:#aaa;padding:20px 0;margin-top:24px;border-top:1px solid #eee;line-height:1.6;">JBJ Management · Dallas, TX<br>This email was sent to you because you are part of our outreach network.<br><a href="#" style="color:#aaa;">Unsubscribe</a></div>`,
}

function setupBlockPalette() {
  document.querySelectorAll('[data-insert]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.insert
      if (!BLOCKS[type]) return
      const html = BLOCKS[type]()
      if (!html) return
      el('ebEditor').focus()
      insertHtmlAtCursor(html)
    })
  })
}

function init() {
  el('ebEditor').innerHTML = existingHtml()
  setupToolbar()
  setupBlockPalette()
  setupAttachments()
  setupSendModal()
  el('ebEditor').addEventListener('input', markDirty)
  el('ebSaveBtn').addEventListener('click', saveTemplate)
  el('ebNameInput').addEventListener('input', markDirty)
  el('ebSubjectInput').addEventListener('input', markDirty)
  el('ebDesktopBtn').addEventListener('click', () => setPreview('desktop'))
  el('ebMobileBtn').addEventListener('click', () => setPreview('mobile'))
  document.addEventListener('selectionchange', () => {
    const editor = el('ebEditor')
    if (document.activeElement === editor || editor.contains(document.activeElement)) {
      updateToolbarState()
    }
  })
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = '' }
  })
}

init()
