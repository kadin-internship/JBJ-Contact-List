// Flyer / canvas builder -- free-positioning canvas using pointer events.
const el = id => document.getElementById(id)

const CANVAS_FORMATS = window.FORMATS = {
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
  'flyer':       { label: 'Letter Flyer (8.5 × 11 in)', group: 'Print',      dw: 408, dh: 528  },
  'portrait':    { label: 'Tall Flyer / Poster',        group: 'Print',       dw: 432, dh: 648  },
  'a4':          { label: 'A4 Poster',                  group: 'Print',       dw: 398, dh: 562  },
}

const state = {
  elements:   (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.elements) || [],
  selectedId: null,
  background: (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.background) || '#ffffff',
  bgAssetId:  (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.bg_asset_id) || null,
  format:     (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.format) || 'square',
}

// Undo / redo
const MAX_HISTORY = 50
let history = []
let historyIndex = -1

function cw() { return (CANVAS_FORMATS[state.format] || CANVAS_FORMATS['square']).dw }
function ch() { return (CANVAS_FORMATS[state.format] || CANVAS_FORMATS['square']).dh }
let dirty = false
let isPublic = !!(window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.is_public)
let drag      = null  // { id, startX, startY, startElX, startElY, moved }
let resize    = null  // { id, startX, startY, startW, startH, moved }
let clipboard = null  // copied element

function uid() { return 'e' + Math.random().toString(36).slice(2, 9) }

function defaultElement(type) {
  const cx = Math.round((cw() - 160) / 2)
  const cy = Math.round((ch() - 80) / 2)
  switch (type) {
    case 'shape':      return { id: uid(), type, x: cx, y: cy, width: 160, height: 80,  color: '#AD0304', opacity: 100, radius: 0 }
    case 'ellipse':    return { id: uid(), type, x: cx, y: cy, width: 120, height: 120, color: '#AD0304', opacity: 100 }
    case 'line':       return { id: uid(), type, x: 40, y: cy, width: cw() - 80, height: 4, color: '#AD0304', opacity: 100 }
    case 'badge':      return { id: uid(), type, x: cx, y: cy, width: 160, height: 40,  text: 'BADGE', color: '#AD0304', textColor: '#ffffff', fontSize: 16, bold: true, opacity: 100 }
    case 'heading':    return { id: uid(), type, x: cx - 40, y: cy, width: 280, height: 70, text: 'Main Heading',  fontSize: 36, color: '#000000', bold: true,  align: 'center', opacity: 100 }
    case 'subheading': return { id: uid(), type, x: cx - 20, y: cy, width: 240, height: 50, text: 'Subheading',    fontSize: 22, color: '#555555', bold: true,  align: 'center', opacity: 100 }
    case 'text':       return { id: uid(), type, x: cx - 30, y: cy, width: 260, height: 80, text: 'Body text here',fontSize: 16, color: '#333333', bold: false, align: 'left',   opacity: 100 }
    case 'caption':    return { id: uid(), type, x: cx, y: cy, width: 200, height: 36,     text: 'Caption text',  fontSize: 12, color: '#888888', bold: false, align: 'center', opacity: 100 }
    case 'logo':       return { id: uid(), type, x: cx, y: cy, width: 180, height: 70, opacity: 100 }
    case 'image':      return { id: uid(), type, x: cx - 20, y: cy - 20, width: 200, height: 140, assetId: null, opacity: 100 }
    default:           return { id: uid(), type: 'shape', x: cx, y: cy, width: 120, height: 60, color: '#AD0304', opacity: 100, radius: 0 }
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Opacity is now applied as CSS on the element wrapper for all types
function elementCss(e) {
  const op = (e.opacity ?? 100) / 100
  const opStr = op < 1 ? `opacity:${op.toFixed(2)};` : ''
  return `left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px;${opStr}`
}

function elementInnerHtml(e) {
  switch (e.type) {
    case 'shape': {
      const radius = e.radius ? `border-radius:${e.radius}px;` : ''
      return `<div style="width:100%;height:100%;background:${e.color};${radius}"></div>`
    }
    case 'ellipse':
      return `<div style="width:100%;height:100%;background:${e.color};border-radius:50%;"></div>`
    case 'line':
      return `<div style="width:100%;height:100%;background:${e.color};border-radius:2px;"></div>`
    case 'badge': {
      const bff = e.fontFamily ? `"${e.fontFamily}",sans-serif` : (e.bold ? "'Archivo Black',sans-serif" : 'inherit')
      return `<div style="width:100%;height:100%;background:${e.color};border-radius:999px;display:flex;align-items:center;justify-content:center;"><span style="color:${e.textColor || '#fff'};font-size:${e.fontSize || 16}px;font-weight:${e.bold ? 700 : 400};font-family:${bff};letter-spacing:1px;">${escapeHtml(e.text || 'BADGE')}</span></div>`
    }
    case 'heading':
    case 'subheading':
    case 'caption':
    case 'text': {
      const fw = e.bold ? '700' : '400'
      const ff = e.fontFamily ? `"${e.fontFamily}",sans-serif` : (e.bold ? "'Archivo Black',sans-serif" : 'inherit')
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

let editingId = null  // id of element currently being inline-edited

function renderCanvas() {
  const canvas = el('fbCanvas')
  canvas.style.background = state.background
  if (state.bgAssetId) {
    canvas.style.backgroundImage = `url('/flyer-builder/assets/${state.bgAssetId}')`
    canvas.style.backgroundSize = 'cover'
    canvas.style.backgroundPosition = 'center'
  } else {
    canvas.style.backgroundImage = ''
  }
  canvas.innerHTML = state.elements.map(e => `
    <div class="fb-element${e.id === state.selectedId ? ' selected' : ''}"
         data-id="${e.id}" style="${elementCss(e)}">
      <div class="fb-element-content">${elementInnerHtml(e)}</div>
      <div class="fb-resize-handle" data-dir="nw"></div>
      <div class="fb-resize-handle" data-dir="n"></div>
      <div class="fb-resize-handle" data-dir="ne"></div>
      <div class="fb-resize-handle" data-dir="e"></div>
      <div class="fb-resize-handle" data-dir="se"></div>
      <div class="fb-resize-handle" data-dir="s"></div>
      <div class="fb-resize-handle" data-dir="sw"></div>
      <div class="fb-resize-handle" data-dir="w"></div>
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

// --- Undo / Redo -------------------------------------------------------

function pushHistory() {
  history.splice(historyIndex + 1)
  history.push({
    elements:   JSON.parse(JSON.stringify(state.elements)),
    background: state.background,
    bgAssetId:  state.bgAssetId,
  })
  if (history.length > MAX_HISTORY) history.shift()
  else historyIndex++
  updateUndoRedoBtns()
}

function updateUndoRedoBtns() {
  const u = el('fbUndoBtn'), r = el('fbRedoBtn')
  if (u) u.disabled = historyIndex <= 0
  if (r) r.disabled = historyIndex >= history.length - 1
}

function restoreSnapshot(snap) {
  state.elements   = JSON.parse(JSON.stringify(snap.elements))
  state.background = snap.background
  state.bgAssetId  = snap.bgAssetId ?? null
  state.selectedId = null
  const bgInput = el('fbBgColor')
  if (bgInput) bgInput.value = state.background
  updateBgImageUI()
  renderCanvas()
  renderStylePanel()
  updateUndoRedoBtns()
  markDirty()
}

function undo() {
  if (historyIndex <= 0) return
  historyIndex--
  restoreSnapshot(history[historyIndex])
}

function redo() {
  if (historyIndex >= history.length - 1) return
  historyIndex++
  restoreSnapshot(history[historyIndex])
}

// --- Style panel -------------------------------------------------------

const FONTS = [
  { value: '',                 label: 'Inter (default)' },
  { value: 'Archivo Black',   label: 'Archivo Black' },
  { value: 'Bebas Neue',      label: 'Bebas Neue' },
  { value: 'Oswald',          label: 'Oswald' },
  { value: 'Montserrat',      label: 'Montserrat' },
  { value: 'Playfair Display',label: 'Playfair Display' },
  { value: 'Roboto Condensed',label: 'Roboto Condensed' },
]
function fontSelect(current) {
  const opts = FONTS.map(f => `<option value="${f.value}"${(current ?? '') === f.value ? ' selected' : ''}>${f.label}</option>`).join('')
  return `<select data-prop="fontFamily">${opts}</select>`
}

function styleField(label, inputHtml) {
  return `<div class="fb-style-field"><label>${label}</label>${inputHtml}</div>`
}

function alignBtns(current) {
  return `<div class="fb-align-btns">
    <button type="button" class="btn btn-sm fb-align-btn${(current || 'left') === 'left'   ? ' active' : ''}" data-align="left"   title="Left"><i class="fas fa-align-left"></i></button>
    <button type="button" class="btn btn-sm fb-align-btn${current === 'center' ? ' active' : ''}" data-align="center" title="Center"><i class="fas fa-align-center"></i></button>
    <button type="button" class="btn btn-sm fb-align-btn${current === 'right'  ? ' active' : ''}" data-align="right"  title="Right"><i class="fas fa-align-right"></i></button>
  </div>`
}

function stylePanelHtml(e) {
  if (!e) return '<p class="muted">Select an element to edit it.</p>'

  let fields = `<div class="fb-z-btns">
    <button class="btn" id="fbBringFront" type="button" title="Bring to front"><i class="fas fa-layer-group"></i> Front</button>
    <button class="btn" id="fbSendBack"   type="button" title="Send to back"><i class="fas fa-layer-group" style="opacity:.4"></i> Back</button>
  </div>
  <button class="btn" id="fbDuplicateElBtn" type="button" style="width:100%;margin-bottom:8px;"><i class="fas fa-copy"></i> Duplicate</button>`

  const isShapeType = ['shape', 'ellipse', 'line'].includes(e.type)
  const isTextType  = ['heading', 'subheading', 'text', 'caption'].includes(e.type)

  if (isShapeType) {
    fields += styleField('Fill color', `<input type="color" data-prop="color" value="${e.color || '#AD0304'}">`)
    fields += `<div class="fb-style-row">${
      styleField('Opacity %', `<input type="number" min="0" max="100" data-prop="opacity" value="${e.opacity ?? 100}">`)
    }${
      e.type === 'shape' ? styleField('Corner radius', `<input type="number" min="0" max="200" data-prop="radius" value="${e.radius || 0}">`) : ''
    }</div>`
  } else if (isTextType) {
    fields += styleField('Text', `<textarea data-prop="text" rows="3">${escapeHtml(e.text || '')}</textarea>`)
    fields += styleField('Font', fontSelect(e.fontFamily))
    fields += `<div class="fb-style-row">${
      styleField('Size', `<input type="number" min="8" max="200" data-prop="fontSize" value="${e.fontSize || 16}">`)
    }${
      styleField('Color', `<input type="color" data-prop="color" value="${e.color || '#000000'}">`)
    }</div>`
    fields += styleField('Align', alignBtns(e.align))
    fields += `<div class="fb-style-row">${
      styleField('Bold', `<select data-prop="bold"><option value="true" ${e.bold ? 'selected' : ''}>Yes</option><option value="false" ${!e.bold ? 'selected' : ''}>No</option></select>`)
    }${
      styleField('Opacity %', `<input type="number" min="0" max="100" data-prop="opacity" value="${e.opacity ?? 100}">`)
    }</div>`
  } else if (e.type === 'badge') {
    fields += styleField('Text', `<input type="text" data-prop="text" value="${escapeHtml(e.text || 'BADGE')}">`)
    fields += `<div class="fb-style-row">${
      styleField('Background', `<input type="color" data-prop="color" value="${e.color || '#AD0304'}">`)
    }${
      styleField('Text color', `<input type="color" data-prop="textColor" value="${e.textColor || '#ffffff'}">`)
    }</div>`
    fields += styleField('Font', fontSelect(e.fontFamily))
    fields += `<div class="fb-style-row">${
      styleField('Size', `<input type="number" min="8" max="80" data-prop="fontSize" value="${e.fontSize || 16}">`)
    }${
      styleField('Bold', `<select data-prop="bold"><option value="true" ${e.bold ? 'selected' : ''}>Yes</option><option value="false" ${!e.bold ? 'selected' : ''}>No</option></select>`)
    }</div>`
    fields += styleField('Opacity %', `<input type="number" min="0" max="100" data-prop="opacity" value="${e.opacity ?? 100}">`)
  } else if (e.type === 'image') {
    fields += `<div class="fb-style-field"><label>Image file</label><div style="position:relative;"><div class="btn" style="width:100%;justify-content:center;pointer-events:none;"><i class="fas fa-upload"></i> ${e.assetId ? 'Replace image' : 'Choose image'}</div><input type="file" id="fbUploadImgInput" data-replace-id="${e.id}" accept="image/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0.001;cursor:pointer;pointer-events:auto;z-index:10;"></div></div>`
    if (e.assetId) fields += `<p class="muted" style="font-size:12px;color:#1E7B34;"><i class="fas fa-check"></i> Image uploaded</p>`
    fields += styleField('Opacity %', `<input type="number" min="0" max="100" data-prop="opacity" value="${e.opacity ?? 100}">`)
  } else if (e.type === 'logo') {
    fields += `<p class="muted" style="font-size:12px;">Displays the JBJ Management logo. Resize by dragging the corner handle.</p>`
    fields += styleField('Opacity %', `<input type="number" min="0" max="100" data-prop="opacity" value="${e.opacity ?? 100}">`)
  }

  fields += `<div class="fb-style-row">${
    styleField('Width',  `<input type="number" min="10" max="${cw()}" data-prop="width"  value="${e.width}">`)
  }${
    styleField('Height', `<input type="number" min="10" max="${ch()}" data-prop="height" value="${e.height}">`)
  }</div>`
  fields += `<div class="fb-style-row">${
    styleField('X', `<input type="number" min="0" max="${cw()}" data-prop="x" value="${e.x}">`)
  }${
    styleField('Y', `<input type="number" min="0" max="${ch()}" data-prop="y" value="${e.y}">`)
  }</div>`
  fields += `<button class="btn" id="fbDeleteElBtn" type="button" style="width:100%;color:var(--maroon);border-color:rgba(173,3,4,0.4);"><i class="fas fa-trash"></i> Delete element</button>`
  return fields
}

function renderStylePanel() {
  const body = el('fbStylePanelBody')
  const element = state.elements.find(e => e.id === state.selectedId)
  body.innerHTML = stylePanelHtml(element || null)
  if (!element) return

  // Bind style fields
  body.querySelectorAll('[data-prop]').forEach(input => {
    let _histPushed = false
    const applyChange = () => {
      const prop = input.dataset.prop
      let val = input.value
      if (input.type === 'number') val = Number(val)
      else if (prop === 'bold') val = val === 'true'
      element[prop] = val
      renderCanvas()
      markDirty()
    }
    if (input.tagName === 'SELECT' || input.type === 'color') {
      input.addEventListener('change', () => { pushHistory(); applyChange() })
    } else {
      // Push once when editing starts, not on every keystroke
      input.addEventListener('focus', () => { if (!_histPushed) { pushHistory(); _histPushed = true } })
      input.addEventListener('blur',  () => { _histPushed = false })
      input.addEventListener('input', applyChange)
    }
  })

  // Text alignment icon buttons
  body.querySelectorAll('.fb-align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pushHistory()
      element.align = btn.dataset.align
      body.querySelectorAll('.fb-align-btn').forEach(b => b.classList.toggle('active', b.dataset.align === element.align))
      renderCanvas()
      markDirty()
    })
  })

  const delBtn = el('fbDeleteElBtn')
  if (delBtn) delBtn.addEventListener('click', () => { pushHistory(); deleteElement(element.id) })

  const dupBtn = el('fbDuplicateElBtn')
  if (dupBtn) dupBtn.addEventListener('click', () => {
    pushHistory()
    const copy = JSON.parse(JSON.stringify(element))
    copy.id = uid()
    copy.x = Math.min(cw() - copy.width,  copy.x + 16)
    copy.y = Math.min(ch() - copy.height, copy.y + 16)
    state.elements.push(copy)
    state.selectedId = copy.id
    renderCanvas()
    renderStylePanel()
    markDirty()
  })

  const frontBtn = el('fbBringFront')
  if (frontBtn) frontBtn.addEventListener('click', () => {
    pushHistory()
    const idx = state.elements.findIndex(e => e.id === element.id)
    if (idx < state.elements.length - 1) {
      state.elements.push(state.elements.splice(idx, 1)[0])
      renderCanvas(); markDirty()
    }
  })
  const backBtn = el('fbSendBack')
  if (backBtn) backBtn.addEventListener('click', () => {
    pushHistory()
    const idx = state.elements.findIndex(e => e.id === element.id)
    if (idx > 0) {
      state.elements.unshift(state.elements.splice(idx, 1)[0])
      renderCanvas(); markDirty()
    }
  })

  const uploadInput = el('fbUploadImgInput')
  if (uploadInput) uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files[0]
    if (!file) return
    const replaceId = uploadInput.dataset.replaceId
    uploadInput.value = ''
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/flyer-assets', { method: 'POST', body: formData })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { alert(j.error || 'Upload failed.'); return }
    pushHistory()
    const existing = state.elements.find(e => e.id === replaceId)
    if (existing) existing.assetId = j.id
    renderCanvas()
    renderStylePanel()
    markDirty()
  })
}

// --- Snap guides -------------------------------------------------------

const SNAP_PX = 8

function showGuides(guides) {
  const canvas = el('fbCanvas')
  canvas.querySelectorAll('.fb-guide-line').forEach(l => l.remove())
  guides.forEach(g => {
    const line = document.createElement('div')
    line.className = 'fb-guide-line'
    if (g.type === 'v') {
      line.style.cssText = `position:absolute;top:0;bottom:0;left:${g.pos}px;width:1px;background:rgba(173,3,4,0.75);pointer-events:none;z-index:99;`
    } else {
      line.style.cssText = `position:absolute;left:0;right:0;top:${g.pos}px;height:1px;background:rgba(173,3,4,0.75);pointer-events:none;z-index:99;`
    }
    canvas.appendChild(line)
  })
}

function clearGuides() {
  el('fbCanvas').querySelectorAll('.fb-guide-line').forEach(l => l.remove())
}

function computeSnap(elem, rawX, rawY) {
  const others = state.elements.filter(e => e.id !== elem.id)
  const W = cw(), H = ch()

  const xTargets = [0, W / 2, W]
  const yTargets = [0, H / 2, H]
  others.forEach(o => {
    xTargets.push(o.x, o.x + o.width / 2, o.x + o.width)
    yTargets.push(o.y, o.y + o.height / 2, o.y + o.height)
  })

  const eW = elem.width, eH = elem.height
  const xOffsets = [0, eW / 2, eW]   // left / center / right of dragged el
  const yOffsets = [0, eH / 2, eH]   // top  / center / bottom

  let snappedX = rawX, snappedY = rawY
  const guides = []

  let bestX = SNAP_PX
  for (const off of xOffsets) {
    for (const tx of xTargets) {
      const d = Math.abs((rawX + off) - tx)
      if (d < bestX) { bestX = d; snappedX = tx - off; guides[0] = { type: 'v', pos: Math.round(tx) } }
    }
  }

  let bestY = SNAP_PX
  for (const off of yOffsets) {
    for (const ty of yTargets) {
      const d = Math.abs((rawY + off) - ty)
      if (d < bestY) { bestY = d; snappedY = ty - off; guides[1] = { type: 'h', pos: Math.round(ty) } }
    }
  }

  return {
    x: Math.round(Math.max(0, Math.min(W - eW, snappedX))),
    y: Math.round(Math.max(0, Math.min(H - eH, snappedY))),
    guides: guides.filter(Boolean),
  }
}

// --- Inline text editing -----------------------------------------------

function editTextElement(id) {
  const element = state.elements.find(e => e.id === id)
  if (!element || !['heading','subheading','text','caption','badge'].includes(element.type)) return
  editingId = id
  const node = el('fbCanvas').querySelector(`[data-id="${id}"]`)
  if (!node) return
  const savedText = element.text || ''
  const content = node.querySelector('.fb-element-content')
  const ta = document.createElement('textarea')
  ta.value = savedText
  const ff = element.fontFamily ? `"${element.fontFamily}",sans-serif` : (element.bold ? "'Archivo Black',sans-serif" : 'inherit')
  ta.style.cssText = `width:100%;height:100%;background:transparent;border:none;outline:none;resize:none;padding:0;margin:0;box-sizing:border-box;font-size:${element.fontSize || 16}px;font-weight:${element.bold ? 700 : 400};color:${element.color || '#000'};text-align:${element.align || 'left'};font-family:${ff};line-height:1.3;overflow:hidden;cursor:text;`
  content.innerHTML = ''
  content.appendChild(ta)
  ta.focus()
  ta.select()
  function finish() {
    editingId = null
    if (ta.value !== savedText) { pushHistory(); element.text = ta.value; markDirty() }
    renderCanvas()
    renderStylePanel()
  }
  ta.addEventListener('blur', finish)
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ta.value = savedText; ta.blur() }
    ev.stopPropagation()  // prevent Delete/arrows from firing canvas shortcuts
  })
}

// --- Canvas pointer events (drag + resize) -----------------------------

function setupCanvasPointer() {
  const canvas = el('fbCanvas')

  canvas.addEventListener('dblclick', e => {
    const elNode = e.target.closest('[data-id]')
    if (elNode) editTextElement(elNode.dataset.id)
  })

  canvas.addEventListener('pointerdown', e => {
    if (e.target.tagName === 'TEXTAREA') return  // don't interrupt inline editing
    const elNode = e.target.closest('[data-id]')
    if (!elNode) { selectElement(null); return }
    const id = elNode.dataset.id
    canvas.setPointerCapture(e.pointerId)
    const element = state.elements.find(elem => elem.id === id)
    if (!element) return
    selectElement(id)
    if (e.target.classList.contains('fb-resize-handle')) {
      const dir = e.target.dataset.dir || 'se'
      resize = { id, startX: e.clientX, startY: e.clientY, startElX: element.x, startElY: element.y, startW: element.width, startH: element.height, dir, moved: false }
    } else {
      drag = { id, startX: e.clientX, startY: e.clientY, startElX: element.x, startElY: element.y, moved: false }
    }
    e.preventDefault()
  })

  canvas.addEventListener('pointermove', e => {
    if (!drag && !resize) return
    const op  = drag || resize
    const dx  = e.clientX - op.startX
    const dy  = e.clientY - op.startY
    // Push history on first real movement (ignore tiny jitter)
    if (!op.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      pushHistory()
      op.moved = true
    }
    if (!op.moved) return
    const element = state.elements.find(elem => elem.id === op.id)
    if (!element) return
    if (drag) {
      const { x, y, guides } = computeSnap(element, Math.round(drag.startElX + dx), Math.round(drag.startElY + dy))
      element.x = x
      element.y = y
      renderCanvas()
      showGuides(guides)
    } else {
      const dir = resize.dir || 'se'
      let newX = resize.startElX, newY = resize.startElY
      let newW = resize.startW,   newH = resize.startH
      if (dir.includes('e')) newW = Math.max(20, Math.round(resize.startW + dx))
      if (dir.includes('s')) newH = Math.max(20, Math.round(resize.startH + dy))
      if (dir.includes('w')) { newW = Math.max(20, Math.round(resize.startW - dx)); newX = resize.startElX + (resize.startW - newW) }
      if (dir.includes('n')) { newH = Math.max(20, Math.round(resize.startH - dy)); newY = resize.startElY + (resize.startH - newH) }
      element.x = newX; element.y = newY; element.width = newW; element.height = newH
      renderCanvas()
    }
  })

  canvas.addEventListener('pointerup', () => {
    const op = drag || resize
    if (op && op.moved) { markDirty(); renderStylePanel() }
    drag = null
    resize = null
    clearGuides()
  })
}

// --- Palette -----------------------------------------------------------

function setupPalette() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      pushHistory()
      const newEl = defaultElement(btn.dataset.add)
      state.elements.push(newEl)
      state.selectedId = newEl.id
      renderCanvas()
      renderStylePanel()
      markDirty()
    })
  })

  // Palette image tile — file input is inline in the tile, user clicks it directly
  const paletteImgInput = el('fbImageUpload')
  if (paletteImgInput) paletteImgInput.addEventListener('change', async () => {
    const file = paletteImgInput.files[0]
    if (!file) return
    paletteImgInput.value = ''
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/flyer-assets', { method: 'POST', body: formData })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { alert(j.error || 'Upload failed.'); return }
    pushHistory()
    const newEl = defaultElement('image')
    newEl.assetId = j.id
    state.elements.push(newEl)
    state.selectedId = newEl.id
    renderCanvas()
    renderStylePanel()
    markDirty()
  })
}

// --- Background --------------------------------------------------------

function updateBgImageUI() {
  const status    = el('fbBgImageStatus')
  const removeBtn = el('fbBgImageRemoveBtn')
  const uploadBtn = el('fbBgImageBtnText')
  if (!removeBtn) return
  if (state.bgAssetId) {
    if (status)    status.style.display = ''
    removeBtn.style.display = ''
    if (uploadBtn) uploadBtn.innerHTML = '<i class="fas fa-image"></i> Change image'
  } else {
    if (status)    status.style.display = 'none'
    removeBtn.style.display = 'none'
    if (uploadBtn) uploadBtn.innerHTML = '<i class="fas fa-image"></i> Upload image'
  }
}

function setupBackground() {
  const bgInput = el('fbBgColor')
  bgInput.value = state.background
  bgInput.addEventListener('change', () => {
    pushHistory()
    state.background = bgInput.value
    renderCanvas()
    markDirty()
  })
  document.querySelectorAll('.fb-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      pushHistory()
      state.background = btn.dataset.color
      bgInput.value = btn.dataset.color
      renderCanvas()
      markDirty()
    })
  })

  const bgImageRemove = el('fbBgImageRemoveBtn')

  async function uploadBgImage(file) {
    if (!file || !file.type.startsWith('image/')) return
    const btn = el('fbBgImageBtn')
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/flyer-assets', { method: 'POST', body: formData })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j.error || 'Upload failed.'); return }
      pushHistory()
      state.bgAssetId = j.id
      renderCanvas()
      markDirty()
    } finally {
      updateBgImageUI()
    }
  }

  const bgImageUpload = el('fbBgImageUpload')
  if (bgImageUpload) {
    bgImageUpload.addEventListener('change', () => {
      const file = bgImageUpload.files[0]
      bgImageUpload.value = ''
      if (file) uploadBgImage(file)
    })
  }

  if (bgImageRemove) {
    bgImageRemove.addEventListener('click', () => {
      pushHistory()
      state.bgAssetId = null
      updateBgImageUI()
      renderCanvas()
      markDirty()
    })
  }

  // Drag-and-drop image onto canvas → set as background
  const canvasArea = el('fbCanvas')
  canvasArea.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      canvasArea.classList.add('fb-drag-over')
    }
  })
  canvasArea.addEventListener('dragleave', () => canvasArea.classList.remove('fb-drag-over'))
  canvasArea.addEventListener('drop', e => {
    e.preventDefault()
    canvasArea.classList.remove('fb-drag-over')
    const file = e.dataTransfer.files[0]
    if (file) uploadBgImage(file)
  })

  updateBgImageUI()
}

// --- Keyboard shortcuts ------------------------------------------------

function setupKeyboard() {
  const arrowMap = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

  document.addEventListener('keydown', e => {
    const active = document.activeElement
    const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')

    // Ctrl+S works everywhere
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault(); saveTemplate(); return
    }

    if (inInput) return

    // Ctrl+C: copy selected element
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && state.selectedId) {
      e.preventDefault()
      const elem = state.elements.find(e2 => e2.id === state.selectedId)
      if (elem) clipboard = JSON.parse(JSON.stringify(elem))
      return
    }
    // Ctrl+V: paste copied element
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
      e.preventDefault()
      pushHistory()
      const copy = { ...JSON.parse(JSON.stringify(clipboard)), id: uid(), x: clipboard.x + 20, y: clipboard.y + 20 }
      state.elements.push(copy)
      state.selectedId = copy.id
      clipboard = copy  // next paste offsets further
      renderCanvas()
      renderStylePanel()
      markDirty()
      return
    }

    // Ctrl+Z: undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault(); undo(); return
    }
    // Ctrl+Y or Ctrl+Shift+Z: redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault(); redo(); return
    }

    // Delete / Backspace: remove selected element
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
      e.preventDefault()
      pushHistory()
      deleteElement(state.selectedId)
      return
    }

    // Arrow keys: nudge (Shift = 10px step)
    const arrow = arrowMap[e.key]
    if (arrow && state.selectedId) {
      e.preventDefault()
      if (!e.repeat) pushHistory()
      const elem = state.elements.find(e2 => e2.id === state.selectedId)
      if (elem) {
        const step = e.shiftKey ? 10 : 1
        elem.x = Math.max(0, Math.min(cw() - elem.width,  elem.x + arrow[0] * step))
        elem.y = Math.max(0, Math.min(ch() - elem.height, elem.y + arrow[1] * step))
        renderCanvas()
        markDirty()
      }
    }
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
    items.forEach(f => { html += `<button class="export-menu-item" data-fmt="${f.key}">${f.label}</button>` })
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
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? '' : 'none' })
  document.addEventListener('click', () => { menu.style.display = 'none' })
  menu.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-fmt]')
    if (!tile) return
    const newFmt = tile.dataset.fmt
    menu.style.display = 'none'
    if (newFmt === state.format) return
    if (state.elements.length && !confirm('Changing canvas size may move some elements out of bounds. Continue?')) return
    pushHistory()
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
    name:        el('fbNameInput').value.trim() || 'Untitled flyer',
    format:      state.format,
    elements:    state.elements,
    is_public:   isPublic,
    background:  state.background,
    bg_asset_id: state.bgAssetId,
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
        body: JSON.stringify({ elements: state.elements, background: state.background, bg_asset_id: state.bgAssetId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { el('fbRenderStatus').textContent = j.error || 'Render failed.'; return }
      el('fbRenderOutput').src           = j.image
      el('fbRenderOutput').style.display = ''
      el('fbDownloadBtn').href           = j.image
      el('fbDownloadBtn').style.display  = ''
      el('fbRenderStatus').textContent   = `${j.width}×${j.height} PNG ready`
    } catch { el('fbRenderStatus').textContent = 'Could not reach the server.' }
  })
  el('fbCloseRenderModal').addEventListener('click', () => { el('fbRenderModal').style.display = 'none' })
}

function setupSendModal() {
  const modal = el('fbSendModal')
  if (!modal) return
  el('fbSendBtn').addEventListener('click', async () => {
    el('fbSendStatus').textContent = ''
    el('fbSendConfirmBtn').disabled = false
    if (!el('fbSendSubject').value) el('fbSendSubject').value = el('fbNameInput').value.trim()
    modal.style.display = ''
    const tagSel = el('fbSendTag')
    if (tagSel.options.length <= 1) {
      try {
        const res = await fetch('/api/tags')
        const j = await res.json()
        ;(Array.isArray(j) ? j : j.tags || []).filter(Boolean).sort().forEach(t => {
          const o = document.createElement('option')
          o.value = t; o.textContent = t
          tagSel.appendChild(o)
        })
      } catch {}
    }
  })
  el('fbCloseSendModal').addEventListener('click', () => { modal.style.display = 'none' })
  el('fbSendCancelBtn').addEventListener('click',  () => { modal.style.display = 'none' })
  el('fbSendConfirmBtn').addEventListener('click', async () => {
    const status = el('fbSendStatus')
    const subject = el('fbSendSubject').value.trim()
    if (!subject) { status.textContent = 'Enter a subject line.'; status.style.color = 'var(--danger,#c00)'; return }
    const btn = el('fbSendConfirmBtn')
    btn.disabled = true
    status.style.color = 'var(--muted)'
    status.textContent = 'Rendering flyer and sending… this may take a moment.'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    try {
      const res = await fetch(`/api/flyer-templates/${window.FLYER_TEMPLATE_ID}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          subject,
          message:    el('fbSendMessage').value.trim(),
          tag:        el('fbSendTag').value,
          county:     el('fbSendCounty').value.trim(),
          background:  state.background || '#ffffff',
          bg_asset_id: state.bgAssetId,
        }),
      })
      clearTimeout(timer)
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        status.style.color = 'green'
        status.textContent = `Sent to ${j.sent} contact${j.sent === 1 ? '' : 's'}${j.failed ? `, ${j.failed} failed` : ''}.`
        btn.disabled = false
      } else {
        status.style.color = 'var(--danger,#c00)'
        status.textContent = j.error || 'Could not send.'
        btn.disabled = false
      }
    } catch (err) {
      clearTimeout(timer)
      status.style.color = 'var(--danger,#c00)'
      status.textContent = err.name === 'AbortError' ? 'Timed out — the send may still be in progress.' : 'Could not reach the server.'
      btn.disabled = false
    }
  })
}

function setupVisibilityToggle() {
  const btn = el('fbVisibilityBtn')
  if (!btn) return
  function refresh() {
    el('fbVisibilityIcon').className = isPublic ? 'fas fa-globe' : 'fas fa-lock'
    el('fbVisibilityLabel').textContent = isPublic ? 'Public' : 'Private'
    btn.style.color = isPublic ? 'var(--success, green)' : ''
  }
  refresh()
  btn.addEventListener('click', () => { isPublic = !isPublic; refresh(); markDirty() })
}

function setupShareSocialModal() {
  const modal    = el('fbShareSocialModal')
  const shareBtn = el('fbShareSocialBtn')
  if (!modal || !shareBtn) return
  shareBtn.addEventListener('click', async () => {
    el('fbShareStatus').textContent = ''
    el('fbSharePostBtn').disabled = false
    modal.style.display = ''
    try {
      const res    = await fetch('/api/social/status')
      const status = await res.json()
      const liCheck = el('fbShareLinkedIn'), fbCheck = el('fbShareFacebook')
      const liLabel = el('fbShareLinkedInLabel'), fbLabel = el('fbShareFacebookLabel')
      if (status.linkedin && status.linkedin.connected) {
        liCheck.disabled = false; liCheck.checked = true
        el('fbShareLinkedInStatus').textContent = `@${status.linkedin.account_name || 'connected'}`
        liLabel.title = ''
      }
      if (status.facebook && status.facebook.connected) {
        fbCheck.disabled = false; fbCheck.checked = true
        el('fbShareFacebookStatus').textContent = status.facebook.page_name || status.facebook.account_name || 'connected'
        fbLabel.title = ''
      }
    } catch {}
  })
  el('fbCloseShareSocialModal').addEventListener('click', () => { modal.style.display = 'none' })
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none' })
  el('fbSharePostBtn').addEventListener('click', async () => {
    const caption   = (el('fbShareCaption').value || '').trim()
    const platforms = []
    if (el('fbShareLinkedIn').checked) platforms.push('linkedin')
    if (el('fbShareFacebook').checked) platforms.push('facebook')
    if (!caption)         { el('fbShareStatus').textContent = 'Add a caption first.'; return }
    if (!platforms.length){ el('fbShareStatus').textContent = 'Select at least one platform.'; return }
    el('fbSharePostBtn').disabled = true
    el('fbShareStatus').textContent = 'Rendering and posting…'
    try {
      const res = await fetch('/api/social/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: window.FLYER_TEMPLATE_ID, elements: state.elements, background: state.background, bg_asset_id: state.bgAssetId, caption, platforms }),
      })
      const j = await res.json()
      if (!res.ok) { el('fbShareStatus').textContent = j.error || 'Post failed.'; return }
      const msgs = Object.entries(j.results).map(([p, r]) => r.ok ? `✓ ${p}` : `✗ ${p}: ${r.error}`).join('  |  ')
      el('fbShareStatus').textContent = msgs
      if (j.ok) setTimeout(() => { modal.style.display = 'none' }, 2000)
    } catch { el('fbShareStatus').textContent = 'Could not reach the server.' }
    finally { el('fbSharePostBtn').disabled = false }
  })
}

function setupBrowseTemplates() {
  const btn   = el('fbBrowseTemplatesBtn')
  const modal = el('fbBrowseTemplatesModal')
  const close = el('fbCloseBrowseTemplatesModal')
  if (!btn || !modal) return

  let built = false
  btn.addEventListener('click', () => {
    // Deselect any active element so its handles don't bleed through the modal
    state.selectedId = null
    renderCanvas()
    renderStylePanel()
    modal.style.display = ''
    if (!built) {
      built = true
      buildStarterGrid('fbBuilderStarterGrid', tpl => {
        modal.style.display = 'none'
        if (state.elements.length &&
            !confirm(`Replace current design with "${tpl.name}"?\nYou can undo with Ctrl+Z.`)) return
        pushHistory()
        state.elements  = tpl.elements.map(e => ({ ...e, id: 'e' + Math.random().toString(36).slice(2, 9) }))
        state.selectedId = null
        state.bgAssetId  = null
        updateBgImageUI()
        if (tpl.format && tpl.format !== state.format) {
          state.format = tpl.format
          applyCanvasSize()
          refreshCanvasSizeActiveState()
        }
        renderCanvas()
        renderStylePanel()
        markDirty()
      })
    }
  })
  if (close) close.addEventListener('click', () => { modal.style.display = 'none' })
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none' })
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
  setupSendModal()
  setupShareSocialModal()
  setupVisibilityToggle()
  setupBrowseTemplates()
  setupKeyboard()

  // Undo / Redo buttons
  const undoBtn = el('fbUndoBtn'), redoBtn = el('fbRedoBtn')
  if (undoBtn) undoBtn.addEventListener('click', undo)
  if (redoBtn) redoBtn.addEventListener('click', redo)

  el('fbSaveBtn').addEventListener('click', saveTemplate)
  el('fbNameInput').addEventListener('input', markDirty)

  pushHistory() // baseline — so Ctrl+Z can't go before the loaded state

  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = '' }
  })
}

init()
