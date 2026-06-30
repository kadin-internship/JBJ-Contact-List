// Flyer / canvas builder -- free-positioning canvas using pointer events
// (not HTML5 DnD, which is unreliable for free-form placement). Elements
// can be dragged anywhere on the canvas and resized via a corner handle.
// The canvas is displayed at half the render resolution (540px vs 1080px)
// so every coordinate stored is in display pixels; the server doubles
// everything to produce a crisp 1080-wide PNG.
const el = id => document.getElementById(id)

const CANVAS_W = { square: 540, portrait: 540 }
const CANVAS_H = { square: 540, portrait: 768 }
const fmt      = (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.format) || 'square'
const CW = CANVAS_W[fmt]
const CH = CANVAS_H[fmt]

const state = {
  elements:   (window.FLYER_TEMPLATE && window.FLYER_TEMPLATE.elements) || [],
  selectedId: null,
  background: '#ffffff',
}
let dirty = false
let drag = null   // { id, startX, startY, startElX, startElY }
let resize = null // { id, startX, startY, startW, startH }

function uid() { return 'e' + Math.random().toString(36).slice(2, 9) }

function defaultElement(type) {
  const cx = Math.round((CW - 160) / 2)
  const cy = Math.round((CH - 80) / 2)
  switch (type) {
    case 'shape':   return { id: uid(), type, x: cx, y: cy, width: 160, height: 80, color: '#AD0304', opacity: 100, radius: 0 }
    case 'heading': return { id: uid(), type, x: cx, y: cy, width: 240, height: 60, text: 'Heading', fontSize: 28, color: '#000000', bold: true, align: 'left' }
    case 'text':    return { id: uid(), type, x: cx, y: cy, width: 220, height: 80, text: 'Text here', fontSize: 16, color: '#000000', bold: false, align: 'left' }
    case 'logo':    return { id: uid(), type, x: cx, y: cy, width: 160, height: 60 }
    case 'image':   return { id: uid(), type, x: cx, y: cy, width: 160, height: 120, assetId: null }
    default:        return { id: uid(), type: 'shape', x: cx, y: cy, width: 100, height: 60, color: '#AD0304', opacity: 100, radius: 0 }
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function elementCss(e) {
  return `left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px;`
}

function elementInnerHtml(e) {
  switch (e.type) {
    case 'shape': {
      const alpha = Math.round((e.opacity ?? 100) / 100 * 255).toString(16).padStart(2, '0')
      const radius = e.radius ? `border-radius:${e.radius}px;` : ''
      return `<div style="width:100%;height:100%;background:${e.color}${alpha};${radius}"></div>`
    }
    case 'heading':
    case 'text': {
      const fw = e.bold ? '700' : '400'
      const ff = e.bold ? "'Archivo Black',sans-serif" : 'inherit'
      return `<div class="fb-element-text" style="font-size:${e.fontSize}px;color:${e.color};font-weight:${fw};font-family:${ff};text-align:${e.align || 'left'};">${escapeHtml(e.text)}</div>`
    }
    case 'logo':
      return `<img src="/static/img/logo.png" alt="JBJ Management" style="width:100%;height:100%;object-fit:contain;">`
    case 'image':
      if (!e.assetId) return `<div style="width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:12px;color:#888;">Click to upload image</div>`
      return `<img src="/flyer-builder/assets/${e.assetId}" alt="" style="width:100%;height:100%;object-fit:cover;">`
    default:
      return ''
  }
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
  if (e.type === 'shape') {
    fields += styleField('Fill color', `<input type="color" data-prop="color" value="${e.color || '#AD0304'}">`)
    fields += `<div class="fb-style-row">${styleField('Opacity %', `<input type="number" min="0" max="100" data-prop="opacity" value="${e.opacity ?? 100}">`)}${styleField('Corner radius', `<input type="number" min="0" max="200" data-prop="radius" value="${e.radius || 0}">`)}</div>`
  } else if (e.type === 'heading' || e.type === 'text') {
    fields += styleField('Text', `<textarea data-prop="text" rows="3">${escapeHtml(e.text || '')}</textarea>`)
    fields += `<div class="fb-style-row">${styleField('Font size', `<input type="number" min="8" max="200" data-prop="fontSize" value="${e.fontSize || 16}">`)}${styleField('Color', `<input type="color" data-prop="color" value="${e.color || '#000000'}">`)}</div>`
    fields += styleField('Align', `<select data-prop="align"><option value="left" ${e.align === 'left' ? 'selected' : ''}>Left</option><option value="center" ${e.align === 'center' ? 'selected' : ''}>Center</option><option value="right" ${e.align === 'right' ? 'selected' : ''}>Right</option></select>`)
    fields += styleField('Bold', `<select data-prop="bold"><option value="true" ${e.bold ? 'selected' : ''}>Yes</option><option value="false" ${!e.bold ? 'selected' : ''}>No</option></select>`)
  } else if (e.type === 'image') {
    fields += `<div class="fb-style-field"><label>Image file</label><button class="btn" id="fbUploadImgBtn" type="button"><i class="fas fa-upload"></i> Choose image</button></div>`
    if (e.assetId) fields += `<p class="muted" style="font-size:12px;">Image uploaded ✓</p>`
  } else if (e.type === 'logo') {
    fields += `<p class="muted">Logo uses the company logo image. Resize by dragging the corner.</p>`
  }
  fields += `<div class="fb-style-row">${styleField('Width', `<input type="number" min="10" max="${CW}" data-prop="width" value="${e.width}">`)}${styleField('Height', `<input type="number" min="10" max="${CH}" data-prop="height" value="${e.height}">`)}</div>`
  fields += `<div class="fb-style-row">${styleField('X', `<input type="number" min="0" max="${CW}" data-prop="x" value="${e.x}">`)}${styleField('Y', `<input type="number" min="0" max="${CH}" data-prop="y" value="${e.y}">`)}</div>`
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
      element.x = Math.max(0, Math.min(CW - element.width,  Math.round(drag.startElX + dx)))
      element.y = Math.max(0, Math.min(CH - element.height, Math.round(drag.startElY + dy)))
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
}

// --- Save / Export -----------------------------------------------------

async function saveTemplate() {
  const status = el('fbSaveStatus')
  status.textContent = 'Saving…'
  const body = {
    name: el('fbNameInput').value.trim() || 'Untitled flyer',
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
  renderCanvas()
  renderStylePanel()
  setupCanvasPointer()
  setupPalette()
  setupBackground()
  setupRenderModal()
  el('fbSaveBtn').addEventListener('click', saveTemplate)
  el('fbNameInput').addEventListener('input', markDirty)
  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = '' }
  })
}

init()
