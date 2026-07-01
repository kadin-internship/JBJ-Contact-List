// Flyer / canvas builder -- free-positioning canvas using pointer events.
// Supports multiple platform canvas sizes (Instagram, Facebook, TikTok,
// print flyers, etc.).  All element coordinates are stored in display
// pixels; the server scales them to the full render resolution at export.
const el = id => document.getElementById(id)

const CANVAS_FORMATS = {
  'square':      { label: 'Instagram Post (Square)',    group: 'Instagram',   dw: 540, dh: 540  },
  'in_portrait': { label: 'Instagram Post (Portrait)',  group: 'Instagram',   dw: 540, dh: 675  },
  'story':       { label: 'Instagram / TikTok Story',   group: 'Instagram',   dw: 405, dh: 720  },
  'fb_post':     { label: 'Facebook Post',              group: 'Facebook',    dw: 540, dh: 284  },
  'fb_cover':    { label: 'Facebook Cover Photo',       group: 'Facebook',    dw: 540, dh: 200  },
  'twitter':     { label: 'Twitter / X Post',           group: 'Twitter / X', dw: 540, dh: 304  },
  'linkedin':    { label: 'LinkedIn Post',              group: 'LinkedIn',    dw: 540, dh: 283  },
  'pinterest':   { label: 'Pinterest Pin',              group: 'Pinterest',   dw: 480, dh: 720  },
  'yt_thumb':    { label: 'YouTube Thumbnail',          group: 'YouTube',     dw: 540, dh: 304  },
  'tiktok':      { label: 'TikTok Video Cover',         group: 'TikTok',      dw: 405, dh: 720  },
  'flyer':       { label: 'Letter Flyer (8.5 × 11 in)','group': 'Print',     dw: 408, dh: 528  },
  'portrait':    { label: 'Tall Flyer / Poster',        group: 'Print',       dw: 432, dh: 648  },
  'a4':          { label: 'A4 Poster',                  group: 'Print',       dw: 398, dh: 562  },
}

const state = {
  elements:   (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.elements) || [],
  selectedId: null,
  background: '#ffffff',
  format:     (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.format) || 'square',
}

function cw() { return (CANVAS_FORMATS[state.format] || CANVAS_FORMATS['square']).dw }
function ch() { return (CANVAS_FORMATS[state.format] || CANVAS_FORMATS['square']).dh }
let dirty = false
let drag = null   // { id, startX, startY, startElX, startElY }
let resize = null // { id, startX, startY, startW, startH }

function uid() { return 'e' + Math.random().toString(36).slice(2, 9) }

function defaultElement(type) {
  const cx = Math.round((cw() - 160) / 2)
  const cy = Math.round((ch() - 80) / 2)
  switch (type) {
    case 'shape':      return { id: uid(), type, x: cx, y: cy, width: 160, height: 80, color: '#AD0304', opacity: 100, radius: 0 }
    case 'ellipse':    return { id: uid(), type, x: cx, y: cy, width: 120, height: 120, color: '#AD0304', opacity: 100 }
    case 'line':       return { id: uid(), type, x: 40, y: cy, width: cw() - 80, height: 4, color: '#AD0304', opacity: 100 }
    case 'badge':      return { id: uid(), type, x: cx, y: cy, width: 160, height: 40, text: 'BADGE', color: '#AD0304', textColor: '#ffffff', fontSize: 16, bold: true }
    case 'heading':    return { id: uid(), type, x: cx - 40, y: cy, width: 280, height: 70, text: 'Main Heading', fontSize: 36, color: '#000000', bold: true, align: 'center' }
    case 'subheading': return { id: uid(), type, x: cx - 20, y: cy, width: 240, height: 50, text: 'Subheading', fontSize: 22, color: '#555555', bold: true, align: 'center' }
    case 'text':       return { id: uid(), type, x: cx - 30, y: cy, width: 260, height: 80, text: 'Body text here', fontSize: 16, color: '#333333', bold: false, align: 'left' }
    case 'caption':    return { id: uid(), type, x: cx, y: cy, width: 200, height: 36, text: 'Caption text', fontSize: 12, color: '#888888', bold: false, align: 'center' }
    case 'logo':       return { id: uid(), type, x: cx, y: cy, width: 180, height: 70 }
    case 'image':      return { id: uid(), type, x: cx - 20, y: cy - 20, width: 200, height: 140, assetId: null }
    default:           return { id: uid(), type: 'shape', x: cx, y: cy, width: 120, height: 60, color: '#AD0304', opacity: 100, radius: 0 }
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function elementCss(e) {
  return `left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px;`
}

function elementInnerHtml(e) {
  const alpha8 = () => Math.round((e.opacity ?? 100) / 100 * 255).toString(16).padStart(2, '0')
  switch (e.type) {
    case 'shape': {
      const radius = e.radius ? `border-radius:${e.radius}px;` : ''
      return `<div style="width:100%;height:100%;background:${e.color}${alpha8()};${radius}"></div>`
    }
    case 'ellipse': {
      return `<div style="width:100%;height:100%;background:${e.color}${alpha8()};border-radius:50%;"></div>`
    }
    case 'line': {
      return `<div style="width:100%;height:100%;background:${e.color}${alpha8()};border-radius:2px;"></div>`
    }
    case 'badge': {
      return `<div style="width:100%;height:100%;background:${e.color};border-radius:999px;display:flex;align-items:center;justify-content:center;"><span style="color:${e.textColor || '#fff'};font-size:${e.fontSize || 16}px;font-weight:${e.bold ? 700 : 400};font-family:${e.bold ? "'Archivo Black',sans-serif" : 'inherit'};letter-spacing:1px;">${escapeHtml(e.text || 'BADGE')}</span></div>`
    }
    case 'heading':
    case 'subheading':
    case 'caption':
    case 'text': {
      const fw = e.bold ? '700' : '400'
      const ff = e.bold ? "'Archivo Black',sans-serif" : 'inherit'
      return `<div class="fb-element-text" style="font-size:${e.fontSize}px;color:${e.color};font-weight:${fw};font-family:${ff};text-align:${e.align || 'left'};line-height:1.3;">${escapeHtml(e.text || '')}</div>`
    }
    case 'logo':
      return `<img src="/static/img/logo.png" alt="JBJ Management" style="width:100%;height:100%;object-fit:contain;">`
    case 'image':
      if (!e.assetId) return `<div style="width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;color:#aaa;font-size:12px;"><i class="fas fa-image" style="font-size:20px;"></i>Upload image</div>`
      return `<img src="/flyer-builder/assets/${e.assetId}" alt="" style="width:100%;height:100%;object-fit:cover;">`
    default:
      return ''
  }
}

function applyCanvasSize() {
  const canvas = el('fbCanvas')
  canvas.style.width  = cw() + 'px'
  canvas.style.height = ch() + 'px'
  const lbl = el('fbCanvasSizeLabel')
  if (lbl) lbl.textContent = (CANVAS_FORMATS[state.format] || {}).label || state.format
}

function renderCanvas() {
  const canvas = el('fbCanvas')
  canvas.style.background = state.background
  canvas.innerHTML = state.elements.map(e => `
    <div class="fb-element${e.id === state.selectedId ? ' selected' : ''}"
         data-id="${e.id}" style="${elementCss(e)}">
      <div class="fb-element-content">${elementInnerHtml(e)}</div>
      <div class="fb-resize-handle"></div>
    </div>
  `).join('')
}

function selectElement(id) {
  state.selectedId = id
  renderCanvas()
  renderStylePanel()
}

function deleteElement(id) {
  state.elements = state.elements.filter(e => e.id !== id)
  state.selectedId = null
  renderCanvas()
  renderStylePanel()
  markDirty()
}

function markDirty() {
  dirty = true
  const s = el('fbSaveStatus')
  if (s) s.textContent = 'Unsaved changes'
}

// --- Style panel -------------------------------------------------------

function styleField(label, inputHtml) {
  return `<div class="fb-style-field"><label>${label}</label>${inputHtml}</div>`
}

function stylePanelHtml(e) {
  if (!e) return '<p class="muted">Select an element to edit it.</p>'
  let fields = `<div class="fb-z-btns">
    <button class="btn" id="fbBringFront" type="button"><i class="fas fa-layer-group"></i> Front</button>
    <button class="btn" id="fbSendBack" type="button"><i class="fas fa-layer-group" style="opacity:.4"></i> Back</button>
  </div>`
  const isShapeType = ['shape', 'ellipse', 'line'].includes(e.type)
  const isTextType  = ['heading', 'subheading', 'text', 'caption'].includes(e.type)

  if (isShapeType) {
    fields += styleField('Fill color', `<input type="color" data-prop="color" value="${e.color || '#AD0304'}">`)
    fields += `<div class="fb-style-row">${styleField('Opacity %', `<input type="number" min="0" max="100" data-prop="opacity" value="${e.opacity ?? 100}">`)}${e.type === 'shape' ? styleField('Corner radius', `<input type="number" min="0" max="200" data-prop="radius" value="${e.radius || 0}">`) : ''}</div>`
  } else if (isTextType) {
    fields += styleField('Text', `<textarea data-prop="text" rows="3">${escapeHtml(e.text || '')}</textarea>`)
    fields += `<div class="fb-style-row">${styleField('Font size', `<input type="number" min="8" max="200" data-prop="fontSize" value="${e.fontSize || 16}">`)}${styleField('Color', `<input type="color" data-prop="color" value="${e.color || '#000000'}">`)}</div>`
    fields += styleField('Align', `<select data-prop="align"><option value="left" ${e.align === 'left' ? 'selected' : ''}>Left</option><option value="center" ${e.align === 'center' ? 'selected' : ''}>Center</option><option value="right" ${e.align === 'right' ? 'selected' : ''}>Right</option></select>`)
    fields += styleField('Bold', `<select data-prop="bold"><option value="true" ${e.bold ? 'selected' : ''}>Yes (Archivo Black)</option><option value="false" ${!e.bold ? 'selected' : ''}>No (Inter)</option></select>`)
  } else if (e.type === 'badge') {
    fields += styleField('Text', `<input type="text" data-prop="text" value="${escapeHtml(e.text || 'BADGE')}">`)
    fields += `<div class="fb-style-row">${styleField('Background', `<input type="color" data-prop="color" value="${e.color || '#AD0304'}">`)}${styleField('Text color', `<input type="color" data-prop="textColor" value="${e.textColor || '#ffffff'}">`)}</div>`
    fields += `<div class="fb-style-row">${styleField('Font size', `<input type="number" min="8" max="80" data-prop="fontSize" value="${e.fontSize || 16}">`)}${styleField('Bold', `<select data-prop="bold"><option value="true" ${e.bold ? 'selected' : ''}>Yes</option><option value="false" ${!e.bold ? 'selected' : ''}>No</option></select>`)}</div>`
  } else if (e.type === 'image') {
    fields += `<div class="fb-style-field"><label>Image file</label><button class="btn" id="fbUploadImgBtn" type="button" style="width:100%;justify-content:center;"><i class="fas fa-upload"></i> ${e.assetId ? 'Replace image' : 'Choose image'}</button></div>`
    if (e.assetId) fields += `<p class="muted" style="font-size:12px;color:#1E7B34;"><i class="fas fa-check"></i> Image uploaded</p>`
  } else if (e.type === 'logo') {
    fields += `<p class="muted" style="font-size:12px;">Displays the JBJ Management logo. Resize by dragging the corner handle.</p>`
  }
  fields += `<div class="fb-style-row">${styleField('Width', `<input type="number" min="10" max="${cw()}" data-prop="width" value="${e.width}">`)}${styleField('Height', `<input type="number" min="10" max="${ch()}" data-prop="height" value="${e.height}">`)}</div>`
  fields += `<div class="fb-style-row">${styleField('X', `<input type="number" min="0" max="${cw()}" data-prop="x" value="${e.x}">`)}${styleField('Y', `<input type="number" min="0" max="${ch()}" data-prop="y" value="${e.y}">`)}</div>`
  fields += `<button class="btn" id="fbDeleteElBtn" type="button" style="width:100%;color:var(--maroon);border-color:rgba(173,3,4,0.4);"><i class="fas fa-trash"></i> Delete</button>`
  return fields
}

function renderStylePanel() {
  const body = el('fbStylePanelBody')
  const element = state.elements.find(e => e.id === state.selectedId)
  body.innerHTML = stylePanelHtml(element || null)
  if (!element) return

  body.querySelectorAll('[data-prop]').forEach(input => {
    const handler = () => {
      const prop = input.dataset.prop
      let val = input.value
      if (input.type === 'number') val = Number(val)
      else if (prop === 'bold') val = val === 'true'
      element[prop] = val
      renderCanvas()
      markDirty()
    }
    input.addEventListener(input.tagName === 'SELECT' || input.type === 'color' ? 'change' : 'input', handler)
  })

  const delBtn = el('fbDeleteElBtn')
  if (delBtn) delBtn.addEventListener('click', () => deleteElement(element.id))

  const frontBtn = el('fbBringFront')
  if (frontBtn) frontBtn.addEventListener('click', () => {
    const idx = state.elements.findIndex(e => e.id === element.id)
    if (idx < state.elements.length - 1) {
      state.elements.push(state.elements.splice(idx, 1)[0])
      renderCanvas()
      markDirty()
    }
  })
  const backBtn = el('fbSendBack')
  if (backBtn) backBtn.addEventListener('click', () => {
    const idx = state.elements.findIndex(e => e.id === element.id)
    if (idx > 0) {
      state.elements.unshift(state.elements.splice(idx, 1)[0])
      renderCanvas()
      markDirty()
    }
  })

  const uploadBtn = el('fbUploadImgBtn')
  if (uploadBtn) uploadBtn.addEventListener('click', () => {
    el('fbImageUpload').dataset.pendingId = element.id
    el('fbImageUpload').click()
  })
}

// --- Canvas pointer events (drag + resize) -----------------------------

function setupCanvasPointer() {
  const canvas = el('fbCanvas')
  canvas.addEventListener('pointerdown', e => {
    const elNode = e.target.closest('[data-id]')
    if (!elNode) { selectElement(null); return }
    const id = elNode.dataset.id
    canvas.setPointerCapture(e.pointerId)
    const element = state.elements.find(e => e.id === id)
    if (!element) return
    selectElement(id)
    if (e.target.classList.contains('fb-resize-handle')) {
      resize = { id, startX: e.clientX, startY: e.clientY, startW: element.width, startH: element.height }
    } else {
      drag = { id, startX: e.clientX, startY: e.clientY, startElX: element.x, startElY: element.y }
    }
    e.preventDefault()
  })
  canvas.addEventListener('pointermove', e => {
    if (!drag && !resize) return
    const dx = e.clientX - (drag || resize).startX
    const dy = e.clientY - (drag || resize).startY
    const element = state.elements.find(e => e.id === (drag || resize).id)
    if (!element) return
    if (drag) {
      element.x = Math.max(0, Math.min(cw() - element.width,  Math.round(drag.startElX + dx)))
      element.y = Math.max(0, Math.min(ch() - element.height, Math.round(drag.startElY + dy)))
    } else {
      element.width  = Math.max(20, Math.round(resize.startW + dx))
      element.height = Math.max(20, Math.round(resize.startH + dy))
    }
    renderCanvas()
  })
  canvas.addEventListener('pointerup', () => {
    if (drag || resize) { markDirty(); renderStylePanel() }
    drag = null
    resize = null
  })
}

// --- Palette -----------------------------------------------------------

function setupPalette() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.add
      if (type === 'image') {
        el('fbImageUpload').dataset.pendingId = 'new'
        el('fbImageUpload').click()
        return
      }
      const newEl = defaultElement(type)
      state.elements.push(newEl)
      state.selectedId = newEl.id
      renderCanvas()
      renderStylePanel()
      markDirty()
    })
  })

  el('fbImageUpload').addEventListener('change', async () => {
    const file = el('fbImageUpload').files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/flyer-assets', { method: 'POST', body: formData })
    const j = await res.json().catch(() => ({}))
    el('fbImageUpload').value = ''
    if (!res.ok) { alert(j.error || 'Upload failed.'); return }

    const pendingId = el('fbImageUpload').dataset.pendingId
    if (pendingId === 'new') {
      const newEl = defaultElement('image')
      newEl.assetId = j.id
      state.elements.push(newEl)
      state.selectedId = newEl.id
    } else {
      const existing = state.elements.find(e => e.id === pendingId)
      if (existing) existing.assetId = j.id
    }
    renderCanvas()
    renderStylePanel()
    markDirty()
  })
}

// --- Background --------------------------------------------------------

function setupBackground() {
  const bgInput = el('fbBgColor')
  bgInput.addEventListener('change', () => {
    state.background = bgInput.value
    renderCanvas()
    markDirty()
  })
  document.querySelectorAll('.fb-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      state.background = btn.dataset.color
      bgInput.value = btn.dataset.color
      renderCanvas()
      markDirty()
    })
  })
}

// --- Save / Export -----------------------------------------------------

function buildCanvasSizeMenuHtml() {
  const groups = {}
  for (const [key, f] of Object.entries(CANVAS_FORMATS)) {
    if (!groups[f.group]) groups[f.group] = []
    groups[f.group].push({ key, ...f })
  }
  let html = ''
  for (const [group, items] of Object.entries(groups)) {
    html += `<div style="padding:6px 12px 2px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">${group}</div>`
    items.forEach(f => {
      html += `<button class="export-menu-item" data-fmt="${f.key}">${f.label}</button>`
    })
  }
  return html
}

function refreshCanvasSizeActiveState() {
  const menu = el('fbCanvasSizeMenu')
  if (!menu) return
  menu.querySelectorAll('[data-fmt]').forEach(btn => {
    const active = btn.dataset.fmt === state.format
    btn.style.background = active ? 'rgba(173,3,4,0.08)' : ''
    btn.style.fontWeight  = active ? '700' : ''
  })
}

function setupCanvasSizeMenu() {
  const btn  = el('fbCanvasSizeBtn')
  const menu = el('fbCanvasSizeMenu')
  if (!btn || !menu) return

  menu.innerHTML = buildCanvasSizeMenuHtml()
  refreshCanvasSizeActiveState()

  // Listeners attached ONCE — not re-registered on every format change.
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    menu.style.display = menu.style.display === 'none' ? '' : 'none'
  })

  document.addEventListener('click', () => { menu.style.display = 'none' })

  menu.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-fmt]')
    if (!tile) return
    const newFmt = tile.dataset.fmt
    menu.style.display = 'none'
    if (newFmt === state.format) return
    if (state.elements.length && !confirm('Changing canvas size may move some elements out of bounds. Continue?')) return
    state.format = newFmt
    applyCanvasSize()
    renderCanvas()
    refreshCanvasSizeActiveState()
    markDirty()
  })
}

async function saveTemplate() {
  const status = el('fbSaveStatus')
  status.textContent = 'Saving…'
  const body = {
    name: el('fbNameInput').value.trim() || 'Untitled flyer',
    format: state.format,
    elements: state.elements,
  }
  try {
    const res = await fetch(`/api/flyer-templates/${window.FLYER_TEMPLATE_ID}`, {
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
  } catch { status.textContent = 'Could not reach the server.' }
}

function setupRenderModal() {
  el('fbRenderBtn').addEventListener('click', async () => {
    el('fbRenderOutput').style.display = 'none'
    el('fbDownloadBtn').style.display  = 'none'
    el('fbRenderStatus').textContent   = 'Rendering…'
    el('fbRenderModal').style.display  = ''
    try {
      const res = await fetch(`/api/flyer-templates/${window.FLYER_TEMPLATE_ID}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements: state.elements, background: state.background }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { el('fbRenderStatus').textContent = j.error || 'Render failed.'; return }
      el('fbRenderOutput').src          = j.image
      el('fbRenderOutput').style.display = ''
      el('fbDownloadBtn').href          = j.image
      el('fbDownloadBtn').style.display = ''
      el('fbRenderStatus').textContent  = `${j.width}×${j.height} PNG ready`
    } catch { el('fbRenderStatus').textContent = 'Could not reach the server.' }
  })
  el('fbCloseRenderModal').addEventListener('click', () => { el('fbRenderModal').style.display = 'none' })
}

function init() {
  applyCanvasSize()
  renderCanvas()
  renderStylePanel()
  setupCanvasPointer()
  setupPalette()
  setupBackground()
  setupCanvasSizeMenu()
  setupRenderModal()
  el('fbSaveBtn').addEventListener('click', saveTemplate)
  el('fbNameInput').addEventListener('input', markDirty)
  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = '' }
  })
}

init()
