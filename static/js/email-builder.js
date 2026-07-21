// Email builder -- a single rich-text compose area with a formatting
// toolbar, modeled on Gmail/Outlook's compose window rather than a
// drag-and-drop block canvas (native HTML5 drag-and-drop turned out to be
// unreliable across browsers and wasn't how people expect to write an
// email anyway). The "build your own" counterpart to the AI Draft Email
// tool on the main page, not a replacement for it.
const el = (id) => document.getElementById(id)

let dirty = false
let isPublic = !!(window.EMAIL_TEMPLATE && window.EMAIL_TEMPLATE.is_public)
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

// Save the current selection range so we can restore it when a modal closes
// (the modal steals focus and wipes the selection)
let _savedRange = null
function saveSelection() {
  const sel = window.getSelection()
  _savedRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null
}
function restoreSelection() {
  if (!_savedRange) return
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(_savedRange)
}

function setupToolbar() {
  document.querySelectorAll('.eb-toolbar button[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      runCmd(btn.dataset.cmd)
    })
  })

  const undoBtn = el('ebUndoBtn')
  const redoBtn = el('ebRedoBtn')
  if (undoBtn) undoBtn.addEventListener('mousedown', (e) => { e.preventDefault(); el('ebEditor').focus(); document.execCommand('undo'); markDirty() })
  if (redoBtn) redoBtn.addEventListener('mousedown', (e) => { e.preventDefault(); el('ebEditor').focus(); document.execCommand('redo'); markDirty() })

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

  // Merge tags dropdown
  setupMergeTags()

  // Hyperlink button
  setupLinkModal()

  // Attach / image dropdown
  setupAttachMenu()
}

// --- Merge tags -----------------------------------------------------------

function setupMergeTags() {
  const btn  = el('ebMergeBtn')
  const menu = el('ebMergeMenu')
  if (!btn || !menu) return

  btn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    saveSelection()
    menu.style.display = menu.style.display === 'none' ? '' : 'none'
  })

  document.addEventListener('click', (e) => {
    if (menu.style.display !== 'none' && !menu.contains(e.target) && e.target !== btn) {
      menu.style.display = 'none'
    }
  })

  menu.querySelectorAll('[data-merge]').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault()
      menu.style.display = 'none'
      restoreSelection()
      insertHtmlAtCursor(item.dataset.merge)
    })
  })
}

// --- Hyperlink modal ------------------------------------------------------

function setupLinkModal() {
  const btn   = el('ebLinkBtn')
  const modal = el('ebLinkModal')
  if (!btn || !modal) return

  function openLinkModal() {
    saveSelection()
    // Pre-fill text from selection
    const sel = window.getSelection()
    const selectedText = (sel && sel.rangeCount) ? sel.toString() : ''
    el('ebLinkText').value = selectedText
    el('ebLinkUrl').value = ''
    el('ebLinkNewTab').checked = true
    modal.style.display = ''
    el('ebLinkUrl').focus()
  }

  btn.addEventListener('click', openLinkModal)

  function closeModal() { modal.style.display = 'none' }
  el('ebLinkModalClose').addEventListener('click', closeModal)
  el('ebLinkModalClose2').addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

  el('ebLinkInsertBtn').addEventListener('click', () => {
    const text    = el('ebLinkText').value.trim()
    const url     = el('ebLinkUrl').value.trim()
    const newTab  = el('ebLinkNewTab').checked
    if (!url) { el('ebLinkUrl').focus(); return }
    closeModal()
    restoreSelection()
    const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : ''
    if (text) {
      insertHtmlAtCursor(`<a href="${escapeAttr(url)}"${target}>${escapeAttr(text)}</a>`)
    } else {
      runCmd('createLink', url)
      // Apply target to the just-created link
      if (newTab) {
        const sel = window.getSelection()
        if (sel && sel.anchorNode) {
          let node = sel.anchorNode
          while (node && node.tagName !== 'A') node = node.parentElement
          if (node) { node.target = '_blank'; node.rel = 'noopener noreferrer' }
        }
      }
    }
  })

  // Allow Enter key in URL field to insert
  el('ebLinkUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el('ebLinkInsertBtn').click() }
  })
}

// --- Attach menu + image upload -------------------------------------------

function closeAttachMenu() {
  const menu = el('ebAttachMenu')
  if (menu) menu.style.display = 'none'
}

function setupAttachMenu() {
  const attachBtn  = el('ebAttachBtn')
  const menu       = el('ebAttachMenu')
  const fileInput  = el('ebFileInput')
  const imgInput   = el('ebImgUploadInput')
  if (!attachBtn || !menu) return

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

  el('ebInsertImgItem').addEventListener('click', () => {
    closeAttachMenu()
    saveSelection()
    imgInput.value = ''
    imgInput.click()
  })

  imgInput.addEventListener('change', async () => {
    const file = imgInput.files[0]
    imgInput.value = ''
    if (!file) return
    const status = el('ebSaveStatus')
    if (status) status.textContent = 'Uploading image…'
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/flyer-assets', { method: 'POST', body: form })
      const j   = await res.json().catch(() => ({}))
      if (!res.ok) { if (status) status.textContent = j.error || 'Upload failed.'; return }
      restoreSelection()
      const src = `/flyer-builder/assets/${j.id}`
      insertHtmlAtCursor(`<img src="${escapeAttr(src)}" alt="" style="max-width:100%;display:block;margin:8px 0;border-radius:4px;">`)
      if (status) status.textContent = ''
    } catch (e) {
      if (status) status.textContent = 'Could not upload image.'
    }
  })
}

// --- Attachment chips ------------------------------------------------------

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
  const fileInput = el('ebFileInput')
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

// --- Send modal -----------------------------------------------------------

let _allTags = []

async function loadTagsForBulk() {
  try {
    const res = await fetch('/api/tags')
    _allTags  = await res.json().catch(() => [])
    const sel = el('ebBulkTagSelect')
    if (!sel) return
    sel.innerHTML = '<option value="">- All contacts with email -</option>'
    _allTags.forEach(t => {
      const o = document.createElement('option')
      o.value = t; o.textContent = t
      sel.appendChild(o)
    })
  } catch (e) { /* non-fatal */ }
}

async function updateBulkPreview() {
  const tag = el('ebBulkTagSelect').value
  const preview = el('ebBulkPreview')
  if (!preview) return
  try {
    const params = new URLSearchParams({ limit: 0 })
    if (tag) params.set('tag', tag)
    const res = await fetch(`/api/contacts?${params}`)
    const j   = await res.json().catch(() => ({}))
    const contacts = j.contacts || []
    const withEmail = contacts.filter(c => c.email).length
    preview.textContent = withEmail
      ? `${withEmail} contact${withEmail === 1 ? '' : 's'} with email address${tag ? ` tagged "${tag}"` : ''} will receive this email.`
      : `No contacts with email addresses${tag ? ` tagged "${tag}"` : ''} found.`
  } catch (e) {
    preview.textContent = ''
  }
}

function setupSendModal() {
  const modal = el('sendEmailModal')
  if (!modal) return

  el('ebSendBtn').addEventListener('click', async () => {
    el('sendEmailStatus').textContent = ''
    el('sendEmailTo').value = ''
    el('ebBulkStatus').textContent = ''
    updateSendAttachmentSummary()
    modal.style.display = ''
    el('sendEmailTo').focus()
    // Load tags lazily
    if (_allTags.length === 0) await loadTagsForBulk()
    updateBulkPreview()
  })

  el('closeSendEmailModal').addEventListener('click', () => { modal.style.display = 'none' })
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none' })

  // Tab switching
  el('ebSendTabSingle').addEventListener('click', () => {
    el('ebSendTabSingle').classList.add('active')
    el('ebSendTabBulk').classList.remove('active')
    el('ebSendPaneSingle').style.display = ''
    el('ebSendPaneBulk').style.display = 'none'
  })
  el('ebSendTabBulk').addEventListener('click', () => {
    el('ebSendTabBulk').classList.add('active')
    el('ebSendTabSingle').classList.remove('active')
    el('ebSendPaneBulk').style.display = ''
    el('ebSendPaneSingle').style.display = 'none'
  })

  el('ebBulkTagSelect').addEventListener('change', updateBulkPreview)

  // Single send
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
        method: 'POST', body: formData, signal: controller.signal,
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
      status.textContent = e.name === 'AbortError' ? 'Timed out - check your SMTP settings or try again.' : 'Could not reach the server.'
    } finally {
      btn.disabled = false
    }
  })

  // Bulk send
  el('ebBulkSendBtn').addEventListener('click', async () => {
    const status = el('ebBulkStatus')
    const tag    = el('ebBulkTagSelect').value
    const html   = el('ebEditor').innerHTML
    const subject = el('ebSubjectInput').value.trim() || el('ebNameInput').value.trim()
    if (!html.trim()) { status.textContent = 'Email has no content yet.'; return }

    const confirmed = confirm(
      tag
        ? `Send this email to all contacts tagged "${tag}" who have an email address?`
        : 'Send this email to ALL contacts with an email address? This may be a large group.'
    )
    if (!confirmed) return

    const btn = el('ebBulkSendBtn')
    btn.disabled = true
    status.textContent = 'Sending…'
    try {
      const res = await fetch(`/api/email-templates/${window.EMAIL_TEMPLATE_ID}/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, subject, html }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        const failed = j.failed ? ` (${j.failed} failed)` : ''
        status.textContent = `Sent to ${j.sent} contact${j.sent === 1 ? '' : 's'}.${failed}`
        if (j.errors && j.errors.length) console.warn('Bulk send errors:', j.errors)
      } else {
        status.textContent = j.error || 'Could not send.'
      }
    } catch (e) {
      status.textContent = 'Could not reach the server.'
    } finally {
      btn.disabled = false
    }
  })
}

// --- Preview mode ---------------------------------------------------------

function setPreview(mode) {
  el('ebEditor').classList.toggle('eb-canvas-mobile', mode === 'mobile')
  el('ebDesktopBtn').classList.toggle('active', mode === 'desktop')
  el('ebMobileBtn').classList.toggle('active', mode === 'mobile')
}

// --- Block palette --------------------------------------------------------

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
  image:        () => null,  // handled by image upload flow below
  social:       () => `<div style="text-align:center;padding:14px 0;font-size:14px;letter-spacing:0.5px;"><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">Facebook</a><span style="color:#ccc;">·</span><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">Instagram</a><span style="color:#ccc;">·</span><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">LinkedIn</a></div>`,
  signature:    () => `<div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:14px;line-height:1.6;"><strong>Your Name</strong><br><span style="color:#555;">Title · JBJ Management</span><br><span style="color:#888;">email@jbj-management.com · (555) 000-0000</span></div>`,
  footer:       () => `<div style="text-align:center;font-size:12px;color:#aaa;padding:20px 0;margin-top:24px;border-top:1px solid #eee;line-height:1.6;">JBJ Management · Dallas, TX<br>This email was sent to you because you are part of our outreach network.<br><a href="#" style="color:#aaa;">Unsubscribe</a></div>`,
}

const LOGO_HTML = `<div style="text-align:center;margin:0 0 24px;"><img src="/static/img/logo.png" alt="JBJ Management" style="width:160px;max-width:100%;"></div>`
const FOOTER_HTML = `<div style="text-align:center;font-size:12px;color:#aaa;padding:20px 0;margin-top:24px;border-top:1px solid #eee;line-height:1.6;">JBJ Management · Dallas, TX<br>This email was sent to you because you are part of our outreach network.<br><a href="#" style="color:#aaa;">Unsubscribe</a></div>`
const SIGNATURE_HTML = `<div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:14px;line-height:1.6;"><strong>Your Name</strong><br><span style="color:#555;">Title · JBJ Management</span><br><span style="color:#888;">email@jbj-management.com · (555) 000-0000</span></div>`

// Each template wraps the existing body content — preserving the user's words
const TEMPLATES = {
  simple: (body) => `${LOGO_HTML}${body}${SIGNATURE_HTML}${FOOTER_HTML}`,

  meeting: (body) => `${LOGO_HTML}
<h2 style="font-family:'Archivo Black',sans-serif;color:#AD0304;border-bottom:2px solid #AD0304;padding-bottom:8px;margin:0 0 16px;">You're Invited</h2>
<table width="100%" style="border-collapse:collapse;background:#fafafa;border-radius:8px;margin:0 0 20px;padding:16px;border:1px solid #eee;">
  <tr><td style="padding:8px 12px;font-size:14px;"><strong>📅 Date:</strong> [DATE]</td></tr>
  <tr><td style="padding:8px 12px;font-size:14px;"><strong>🕐 Time:</strong> [TIME]</td></tr>
  <tr><td style="padding:8px 12px;font-size:14px;"><strong>📍 Location:</strong> [LOCATION]</td></tr>
</table>
${body}
<div style="text-align:center;margin:20px 0;"><a href="#" style="background:#AD0304;color:#ffffff;display:inline-block;padding:14px 32px;border-radius:999px;font-weight:600;text-decoration:none;font-size:16px;">RSVP Now</a></div>
${SIGNATURE_HTML}${FOOTER_HTML}`,

  newsletter: (body) => `${LOGO_HTML}
<h2 style="font-family:'Archivo Black',sans-serif;color:#AD0304;border-bottom:2px solid #AD0304;padding-bottom:8px;margin:0 0 16px;">Newsletter</h2>
${body}
<div style="text-align:center;padding:14px 0;font-size:14px;letter-spacing:0.5px;"><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">Facebook</a><span style="color:#ccc;">·</span><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">Instagram</a><span style="color:#ccc;">·</span><a href="#" style="color:#AD0304;text-decoration:none;margin:0 10px;font-weight:600;">LinkedIn</a></div>
${FOOTER_HTML}`,

  announcement: (body) => `${LOGO_HTML}
<div style="background:#1a1a1a;color:#ffffff;padding:16px 20px;border-radius:8px;text-align:center;margin:0 0 20px;"><strong style="font-size:18px;">📢 Important Announcement</strong></div>
${body}
<div style="text-align:center;margin:20px 0;"><a href="#" style="background:#AD0304;color:#ffffff;display:inline-block;padding:14px 32px;border-radius:999px;font-weight:600;text-decoration:none;font-size:16px;">Learn More</a></div>
${SIGNATURE_HTML}${FOOTER_HTML}`,
}

function setupTemplatePalette() {
  document.querySelectorAll('[data-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.template
      if (!TEMPLATES[type]) return
      const editor = el('ebEditor')
      const currentBody = editor.innerHTML.trim() || '<p><br></p>'
      const newHtml = TEMPLATES[type](currentBody)
      editor.focus()
      document.execCommand('selectAll')
      document.execCommand('insertHTML', false, newHtml)
      markDirty()
      editor.scrollTop = 0
    })
  })
}

function setupBlockPalette() {
  document.querySelectorAll('[data-insert]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.insert
      if (type === 'image') {
        // Use the same image upload flow as the toolbar
        saveSelection()
        const imgInput = el('ebImgUploadInput')
        if (imgInput) { imgInput.value = ''; imgInput.click() }
        return
      }
      if (!BLOCKS[type]) return
      const html = BLOCKS[type]()
      if (!html) return
      el('ebEditor').focus()
      insertHtmlAtCursor(html)
    })
  })
}

// --- Visibility toggle ----------------------------------------------------

function setupVisibilityToggle() {
  const btn = el('ebVisibilityBtn')
  if (!btn) return
  function refresh() {
    el('ebVisibilityIcon').className = isPublic ? 'fas fa-globe' : 'fas fa-lock'
    el('ebVisibilityLabel').textContent = isPublic ? 'Public' : 'Private'
    btn.style.color = isPublic ? 'var(--success, green)' : ''
  }
  refresh()
  btn.addEventListener('click', () => {
    isPublic = !isPublic
    refresh()
    markDirty()
  })
}

// --- Save -----------------------------------------------------------------

async function saveTemplate() {
  const status = el('ebSaveStatus')
  status.textContent = 'Saving…'
  const body = {
    name: el('ebNameInput').value.trim() || 'Untitled email',
    subject: el('ebSubjectInput').value.trim(),
    blocks: [{ id: 'body', type: 'richtext', html: el('ebEditor').innerHTML }],
    is_public: isPublic,
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

// --- Send tab style -------------------------------------------------------
// Injected at runtime since the CSS lives inline here to keep the HTML clean
;(function() {
  const style = document.createElement('style')
  style.textContent = `.eb-send-tab{background:none;border:none;padding:8px 16px;font-size:14px;font-weight:500;color:#888;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;}.eb-send-tab.active{color:#AD0304;border-bottom-color:#AD0304;font-weight:600;}`
  document.head.appendChild(style)
})()

// --- Init -----------------------------------------------------------------

function init() {
  el('ebEditor').innerHTML = existingHtml()
  setupToolbar()
  setupTemplatePalette()
  setupBlockPalette()
  setupAttachments()
  setupSendModal()
  setupVisibilityToggle()
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
