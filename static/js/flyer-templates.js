// Shared starter template definitions — used by both the list page and the in-builder browser.
const STARTER_TEMPLATES = [
  // ---- Square (540×540) -----------------------------------------------
  {
    name: 'Bold Event Post',
    format: 'square',
    preview_desc: 'Vibrant red design for event announcements',
    elements: [
      { type:'shape',      x:0,   y:0,   width:540, height:540, color:'#AD0304', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:540, height:88,  color:'#6D0712', opacity:100, radius:0 },
      { type:'logo',       x:22,  y:18,  width:156, height:50,  opacity:100 },
      { type:'heading',    x:30,  y:120, width:480, height:100, text:'EVENT TITLE',                  fontSize:46, color:'#ffffff', bold:true,  align:'center', opacity:100 },
      { type:'line',       x:175, y:232, width:190, height:3,   color:'#ffffff', opacity:60 },
      { type:'subheading', x:30,  y:250, width:480, height:44,  text:'SATURDAY, AUGUST 1  ·  7 PM', fontSize:18, color:'#ffffff', bold:false, align:'center', opacity:100 },
      { type:'text',       x:60,  y:304, width:420, height:56,  text:'Event venue · City, State',   fontSize:15, color:'#ffffff', bold:false, align:'center', opacity:100 },
      { type:'badge',      x:155, y:430, width:230, height:46,  text:'RSVP NOW', color:'#ffffff', textColor:'#AD0304', fontSize:15, bold:true, opacity:100 },
    ]
  },
  {
    name: 'Clean Minimal',
    format: 'square',
    preview_desc: 'White layout with bold type and red accents',
    elements: [
      { type:'shape',      x:0,   y:0,   width:540, height:540, color:'#ffffff', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:540, height:10,  color:'#AD0304', opacity:100, radius:0 },
      { type:'heading',    x:40,  y:40,  width:460, height:100, text:'YOUR HEADLINE',                          fontSize:44, color:'#111111', bold:true,  align:'left', opacity:100 },
      { type:'shape',      x:40,  y:148, width:100, height:5,   color:'#AD0304', opacity:100, radius:0 },
      { type:'text',       x:40,  y:170, width:460, height:120, text:'Add your event details or a short description. Keep it concise and easy to read.', fontSize:15, color:'#444444', bold:false, align:'left', opacity:100 },
      { type:'subheading', x:40,  y:310, width:460, height:48,  text:'DATE  ·  VENUE  ·  TIME',              fontSize:17, color:'#AD0304', bold:false, align:'left', opacity:100 },
      { type:'logo',       x:40,  y:460, width:150, height:48,  opacity:100 },
      { type:'text',       x:40,  y:514, width:460, height:30,  text:'www.jbj-management.com',                fontSize:13, color:'#888888', bold:false, align:'left', opacity:100 },
    ]
  },
  {
    name: 'Breaking News',
    format: 'square',
    preview_desc: 'Urgent announcement or press release style',
    elements: [
      { type:'shape',      x:0,   y:0,   width:540, height:540, color:'#ffffff', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:8,   height:540, color:'#AD0304', opacity:100, radius:0 },
      { type:'badge',      x:24,  y:30,  width:130, height:36,  text:'BREAKING', color:'#AD0304', textColor:'#ffffff', fontSize:13, bold:true, opacity:100 },
      { type:'heading',    x:24,  y:80,  width:492, height:130, text:'Big Announcement Headline Here', fontSize:38, color:'#111111', bold:true,  align:'left', opacity:100 },
      { type:'shape',      x:24,  y:220, width:492, height:2,   color:'#eeeeee', opacity:100, radius:0 },
      { type:'text',       x:24,  y:236, width:492, height:160, text:'Your announcement details go here. Explain what happened, who is involved, and why it matters. Keep your message clear and direct.', fontSize:15, color:'#444444', bold:false, align:'left', opacity:100 },
      { type:'caption',    x:24,  y:408, width:492, height:28,  text:'SOURCE: JBJ MANAGEMENT', fontSize:11, color:'#AD0304', bold:false, align:'left', opacity:100 },
      { type:'logo',       x:24,  y:462, width:140, height:44,  opacity:100 },
      { type:'text',       x:24,  y:508, width:492, height:26,  text:'www.jbj-management.com',    fontSize:12, color:'#888888', bold:false, align:'left', opacity:100 },
    ]
  },
  {
    name: 'Quote Card',
    format: 'square',
    preview_desc: 'Dark pull-quote or inspirational card',
    elements: [
      { type:'shape',      x:0,   y:0,   width:540, height:540, color:'#111111', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:540, height:10,  color:'#AD0304', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:530, width:540, height:10,  color:'#AD0304', opacity:100, radius:0 },
      { type:'text',       x:36,  y:60,  width:100, height:160, text:'“', fontSize:130, color:'#AD0304', bold:true, align:'left', opacity:25 },
      { type:'text',       x:60,  y:130, width:420, height:200, text:'Your inspiring quote or key message goes here. Make it powerful and memorable.', fontSize:24, color:'#ffffff', bold:false, align:'center', opacity:100 },
      { type:'shape',      x:195, y:348, width:150, height:3,   color:'#AD0304', opacity:100, radius:0 },
      { type:'text',       x:60,  y:364, width:420, height:38,  text:'— ATTRIBUTED NAME', fontSize:15, color:'#AD0304', bold:false, align:'center', opacity:100 },
      { type:'logo',       x:190, y:450, width:160, height:50,  opacity:100 },
    ]
  },

  // ---- Portrait (432×648) ---------------------------------------------
  {
    name: 'Artist Spotlight',
    format: 'portrait',
    preview_desc: 'Dark dramatic layout for artist features',
    elements: [
      { type:'shape',      x:0,   y:0,   width:432, height:648, color:'#111111', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:8,   height:648, color:'#AD0304', opacity:100, radius:0 },
      { type:'logo',       x:24,  y:22,  width:150, height:48,  opacity:100 },
      { type:'shape',      x:0,   y:300, width:432, height:2,   color:'#AD0304', opacity:40,  radius:0 },
      { type:'caption',    x:24,  y:318, width:384, height:32,  text:'PRESENTED BY JBJ MANAGEMENT', fontSize:11, color:'#AD0304', bold:false, align:'left', opacity:100 },
      { type:'heading',    x:24,  y:358, width:384, height:100, text:'ARTIST NAME',   fontSize:44, color:'#ffffff', bold:true,  align:'left', opacity:100 },
      { type:'subheading', x:24,  y:466, width:384, height:48,  text:'Genre  ·  City', fontSize:18, color:'#cccccc', bold:false, align:'left', opacity:100 },
      { type:'badge',      x:24,  y:554, width:200, height:42,  text:'BOOKING OPEN', color:'#AD0304', textColor:'#ffffff', fontSize:14, bold:true, opacity:100 },
    ]
  },
  {
    name: 'Tour Poster',
    format: 'portrait',
    preview_desc: 'Show and tour date announcement',
    elements: [
      { type:'shape',      x:0,   y:0,   width:432, height:648, color:'#ffffff', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:432, height:100, color:'#AD0304', opacity:100, radius:0 },
      { type:'logo',       x:20,  y:22,  width:150, height:56,  opacity:100 },
      { type:'caption',    x:24,  y:118, width:384, height:28,  text:'WORLD TOUR 2025', fontSize:12, color:'#AD0304', bold:false, align:'left', opacity:100 },
      { type:'heading',    x:24,  y:148, width:384, height:86,  text:'ARTIST NAME', fontSize:40, color:'#111111', bold:true, align:'left', opacity:100 },
      { type:'shape',      x:24,  y:242, width:80,  height:4,   color:'#AD0304', opacity:100, radius:0 },
      { type:'text',       x:24,  y:260, width:384, height:36,  text:'JUL 10  ·  City, State', fontSize:15, color:'#333333', bold:false, align:'left', opacity:100 },
      { type:'shape',      x:24,  y:298, width:384, height:1,   color:'#dddddd', opacity:100, radius:0 },
      { type:'text',       x:24,  y:308, width:384, height:36,  text:'JUL 14  ·  City, State', fontSize:15, color:'#333333', bold:false, align:'left', opacity:100 },
      { type:'shape',      x:24,  y:346, width:384, height:1,   color:'#dddddd', opacity:100, radius:0 },
      { type:'text',       x:24,  y:356, width:384, height:36,  text:'JUL 18  ·  City, State', fontSize:15, color:'#333333', bold:false, align:'left', opacity:100 },
      { type:'shape',      x:24,  y:394, width:384, height:1,   color:'#dddddd', opacity:100, radius:0 },
      { type:'text',       x:24,  y:404, width:384, height:36,  text:'JUL 22  ·  City, State', fontSize:15, color:'#333333', bold:false, align:'left', opacity:100 },
      { type:'badge',      x:24,  y:478, width:200, height:42,  text:'GET TICKETS', color:'#AD0304', textColor:'#ffffff', fontSize:14, bold:true, opacity:100 },
      { type:'text',       x:24,  y:600, width:384, height:30,  text:'www.jbj-management.com', fontSize:13, color:'#888888', bold:false, align:'left', opacity:100 },
    ]
  },

  // ---- Story (405×720) ------------------------------------------------
  {
    name: 'Story Announcement',
    format: 'story',
    preview_desc: 'Tall format for Instagram & TikTok stories',
    elements: [
      { type:'shape',      x:0,   y:0,   width:405, height:720, color:'#AD0304', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:560, width:405, height:160, color:'#ffffff', opacity:100, radius:0 },
      { type:'logo',       x:24,  y:28,  width:140, height:44,  opacity:100 },
      { type:'heading',    x:24,  y:180, width:357, height:100, text:'BIG HEADLINE',              fontSize:46, color:'#ffffff', bold:true,  align:'center', opacity:100 },
      { type:'subheading', x:24,  y:294, width:357, height:52,  text:'Supporting text goes here', fontSize:20, color:'#ffffff', bold:false, align:'center', opacity:100 },
      { type:'line',       x:128, y:358, width:149, height:3,   color:'#ffffff', opacity:50 },
      { type:'text',       x:24,  y:374, width:357, height:44,  text:'Date  ·  Time  ·  Location', fontSize:15, color:'#ffffff', bold:false, align:'center', opacity:100 },
      { type:'heading',    x:24,  y:578, width:357, height:52,  text:'LEARN MORE',                fontSize:22, color:'#AD0304', bold:true,  align:'center', opacity:100 },
      { type:'text',       x:24,  y:634, width:357, height:36,  text:'www.jbj-management.com',   fontSize:14, color:'#888888', bold:false, align:'center', opacity:100 },
    ]
  },

  // ---- Wide social formats --------------------------------------------
  {
    name: 'Facebook Event',
    format: 'fb_post',
    preview_desc: 'Eye-catching Facebook post or event cover',
    elements: [
      { type:'shape',      x:0,   y:0,   width:540, height:284, color:'#AD0304', opacity:100, radius:0 },
      { type:'shape',      x:300, y:0,   width:240, height:284, color:'#6D0712', opacity:60,  radius:0 },
      { type:'logo',       x:20,  y:20,  width:130, height:40,  opacity:100 },
      { type:'heading',    x:20,  y:80,  width:360, height:90,  text:'EVENT TITLE', fontSize:40, color:'#ffffff', bold:true, align:'left', opacity:100 },
      { type:'text',       x:20,  y:178, width:360, height:36,  text:'Date  ·  Time  ·  Location', fontSize:16, color:'#ffffff', bold:false, align:'left', opacity:100 },
      { type:'badge',      x:20,  y:226, width:160, height:38,  text:'LEARN MORE', color:'#ffffff', textColor:'#AD0304', fontSize:13, bold:true, opacity:100 },
    ]
  },
  {
    name: 'LinkedIn Post',
    format: 'linkedin',
    preview_desc: 'Professional wide format for LinkedIn',
    elements: [
      { type:'shape',      x:0,   y:0,   width:540, height:283, color:'#1a1a2e', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:6,   height:283, color:'#AD0304', opacity:100, radius:0 },
      { type:'logo',       x:400, y:20,  width:120, height:38,  opacity:100 },
      { type:'caption',    x:24,  y:36,  width:340, height:28,  text:'JBJ MANAGEMENT  ·  ANNOUNCEMENT', fontSize:11, color:'#AD0304', bold:false, align:'left', opacity:100 },
      { type:'heading',    x:24,  y:72,  width:490, height:90,  text:'Professional Announcement', fontSize:32, color:'#ffffff', bold:true, align:'left', opacity:100 },
      { type:'subheading', x:24,  y:172, width:490, height:44,  text:'Supporting detail or key information', fontSize:16, color:'#cccccc', bold:false, align:'left', opacity:100 },
      { type:'shape',      x:24,  y:226, width:80,  height:3,   color:'#AD0304', opacity:100, radius:0 },
      { type:'text',       x:24,  y:238, width:490, height:30,  text:'www.jbj-management.com', fontSize:13, color:'#888888', bold:false, align:'left', opacity:100 },
    ]
  },

  // ---- Print ----------------------------------------------------------
  {
    name: 'Classic Print Flyer',
    format: 'flyer',
    preview_desc: 'Letter-size flyer ready to print or email',
    elements: [
      { type:'shape',      x:0,   y:0,   width:408, height:528, color:'#ffffff', opacity:100, radius:0 },
      { type:'shape',      x:0,   y:0,   width:408, height:100, color:'#AD0304', opacity:100, radius:0 },
      { type:'logo',       x:20,  y:22,  width:150, height:56,  opacity:100 },
      { type:'shape',      x:0,   y:100, width:408, height:6,   color:'#6D0712', opacity:100, radius:0 },
      { type:'heading',    x:24,  y:126, width:360, height:90,  text:'EVENT TITLE HERE', fontSize:36, color:'#111111', bold:true,  align:'center', opacity:100 },
      { type:'subheading', x:24,  y:226, width:360, height:44,  text:'Date  ·  Time  ·  Location',  fontSize:18, color:'#AD0304', bold:false, align:'center', opacity:100 },
      { type:'shape',      x:60,  y:282, width:288, height:2,   color:'#cccccc', opacity:100, radius:0 },
      { type:'text',       x:40,  y:300, width:328, height:120, text:'Join us for this special event. Add details about the program, speakers, or activities here. Keep it brief and engaging.', fontSize:14, color:'#333333', bold:false, align:'center', opacity:100 },
      { type:'badge',      x:104, y:448, width:200, height:42,  text:'FREE ADMISSION', color:'#AD0304', textColor:'#ffffff', fontSize:14, bold:true, opacity:100 },
    ]
  },
]

// Shared mini-canvas renderer
function renderMiniElement(e, scale) {
  const op = (e.opacity ?? 100) / 100
  const opStr = op < 1 ? `opacity:${op.toFixed(2)};` : ''
  const x = Math.round((e.x || 0) * scale)
  const y = Math.round((e.y || 0) * scale)
  const w = Math.max(2, Math.round((e.width  || 40) * scale))
  const h = Math.max(2, Math.round((e.height || 20) * scale))
  function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
  let inner = ''
  if (e.type === 'shape')   inner = `<div style="width:100%;height:100%;background:${e.color||'#AD0304'};${e.radius ? 'border-radius:'+Math.round(e.radius*scale)+'px;' : ''}"></div>`
  else if (e.type === 'ellipse') inner = `<div style="width:100%;height:100%;background:${e.color||'#AD0304'};border-radius:50%;"></div>`
  else if (e.type === 'line')   inner = `<div style="width:100%;height:100%;background:${e.color||'#AD0304'};"></div>`
  else if (e.type === 'badge')  inner = `<div style="width:100%;height:100%;background:${e.color||'#AD0304'};border-radius:999px;"></div>`
  else if (['heading','subheading','text','caption'].includes(e.type)) {
    const fs = Math.max(5, Math.round((e.fontSize || 16) * scale))
    inner = `<div style="font-size:${fs}px;color:${e.color||'#000'};font-weight:${e.bold?700:400};text-align:${e.align||'left'};overflow:hidden;white-space:nowrap;line-height:1.2;">${esc(e.text||'')}</div>`
  } else if (e.type === 'logo') {
    inner = `<img src="/static/img/logo.png" style="width:100%;height:100%;object-fit:contain;">`
  }
  if (!inner) return ''
  return `<div class="tpl-preview-el" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${opStr}">${inner}</div>`
}

// Build a grid of starter template cards inside a container element.
// onSelect(tpl) is called when the user clicks a card.
function buildStarterGrid(containerId, onSelect) {
  const grid = document.getElementById(containerId)
  if (!grid) return
  grid.innerHTML = ''
  STARTER_TEMPLATES.forEach(tpl => {
    const FORMATS_MAP = window.FORMATS || window.CANVAS_FORMATS_PX || {}
    // Fallback dimensions if the host page hasn't defined FORMATS
    const fmt = FORMATS_MAP[tpl.format] || { dw: 540, dh: 540 }
    const maxW = 180
    const scale = maxW / fmt.dw
    const previewH = Math.round(fmt.dh * scale)

    const card = document.createElement('div')
    card.className = 'fb-starter-card'
    card.innerHTML = `
      <div class="fb-starter-preview" style="position:relative;width:${maxW}px;height:${previewH}px;overflow:hidden;border-radius:6px;background:#f4f4f2;box-shadow:0 2px 8px rgba(0,0,0,0.1);"></div>
      <div class="fb-starter-name">${tpl.name}</div>
      <div class="fb-starter-desc">${tpl.preview_desc}</div>
    `
    const preview = card.querySelector('.fb-starter-preview')
    tpl.elements.forEach(e => {
      const html = renderMiniElement(e, scale)
      if (html) preview.insertAdjacentHTML('beforeend', html)
    })
    card.addEventListener('click', () => onSelect(tpl))
    grid.appendChild(card)
  })
}
