const API = {
  contacts: '/api/contacts',
  stats: '/api/stats',
  tags: '/api/tags',
  categories: '/api/categories',
  sectionCategories: '/api/section-categories',
  counties: '/api/counties',
}

let state = { page: 1, limit: 25, q: '', tag: '', county: '', total: 0 }

function el(id){return document.getElementById(id)}
console.debug('app.js loaded')

async function fetchTags(){
  try{
    const res = await fetch(API.tags)
    const tags = await res.json()
    const sel = el('tagFilter')
    sel.innerHTML = '<option value="">All Tags</option>' + tags.map(t=>`<option value="${t}">${t}</option>`).join('')
  }catch(e){console.warn(e)}
}

async function fetchCategories(){
  try{
    const res = await fetch(API.sectionCategories)
    const cats = await res.json()
    const sel = el('roleTagFilter')
    if(!sel) return
    sel.innerHTML = '<option value="">All Categories</option>' + cats.map(t=>`<option value="${t.tag}">${t.tag} (${t.count||0})</option>`).join('')
  }catch(e){console.warn(e)}
}

async function fetchCounties(){
  try{
    const res = await fetch(API.counties)
    const rows = await res.json()
    const optionsHtml = '<option value="">All Counties</option>' + rows.map(r=>`<option value="${r.county}">${r.county||'Unknown'} (${r.count||0})</option>`).join('')
    // populate both the main Contacts toolbar's county filter and the Roles county filter
    ;['countyFilter', 'mainCountyFilter'].forEach(id=>{
      const sel = el(id)
      if(sel) sel.innerHTML = optionsHtml
    })
  }catch(e){console.warn(e)}
}

async function fetchStats(){
  try{
    const res = await fetch(API.stats)
    const json = await res.json()
    el('statTotal').textContent = json.total ?? '0'
    if(el('statIncomplete')) el('statIncomplete').textContent = json.incomplete ?? '0'
  }catch(e){console.warn(e)}
}

async function fetchSectionStats(){
  try{
    const res = await fetch('/api/section-stats')
    const json = await res.json()
    el('statTotal').textContent = json.total ?? '0'
    if(el('statIncomplete')) el('statIncomplete').textContent = json.no_contact ?? '0'
  }catch(e){console.warn(e)}
}

function renderCard(c){
  console.debug('renderCard called for', c && (c.id || c.email || (c.first_name+' '+c.last_name)))
  const div = document.createElement('div')
  div.className = 'card'
  div.tabIndex = 0
  div.innerHTML = `
    <h3>${c.first_name||''} ${c.last_name||''}</h3>
    <div class="meta">${c.organization||''} — ${c.title||''}</div>
    <div class="pills">${(c.lists||[]).slice(0,3).map(p=>`<span class="pill">${p}</span>`).join('')}</div>
    <div class="category">${c.tag||''}</div>
    <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">
      <button class="btn btn-sm view-btn">View</button>
      <button class="btn btn-sm edit-btn">Edit</button>
    </div>
  `
  // clicking the card background opens detail; Edit opens modal
  div.addEventListener('click', (ev)=>{ if(ev.target && (ev.target.classList && (ev.target.classList.contains('view-btn')||ev.target.classList.contains('edit-btn')))){ return } showContactDetail(c) })
  const viewBtn = div.querySelector('.view-btn')
  if(viewBtn) viewBtn.addEventListener('click', (e)=>{ e.stopPropagation(); showContactDetail(c) })
  const editBtn = div.querySelector('.edit-btn')
  if(editBtn) editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openProfile(c.id) })
  return div
}

async function showContactDetail(contact){
  try{
    let c = contact
    if(typeof contact === 'number' || typeof contact === 'string'){
      const res = await fetch('/api/contacts/' + encodeURIComponent(contact))
      c = await res.json()
    }
    const panel = el('contactDetail')
    if(!panel) return
    const incomplete = ((!c.email || c.email.trim()==='') && (!c.phone_office && !c.phone_cell))
    const hasNotes = c.notes && c.notes.trim().length>0
    panel.innerHTML = `
      <div class="detail-card">
        <div class="detail-photo photo-placeholder">${(c.first_name||c.last_name)? (c.first_name||'').charAt(0) + (c.last_name||'').charAt(0) : '—'}</div>
        <div class="detail-main">
          <h2>${(c.first_name||'') + ' ' + (c.last_name||'')}</h2>
          <div class="detail-sub">${c.title||''} ${c.organization? ' • '+c.organization : ''}</div>
          <div class="detail-row"><strong>Email:</strong> ${c.email? `<a href="mailto:${c.email}">${c.email}</a>` : '<span class="muted">No email</span>'}</div>
          <div class="detail-row"><strong>Phone:</strong> ${c.phone_office? `<a href="tel:${c.phone_office}">${c.phone_office}</a>` : (c.phone_cell? `<a href="tel:${c.phone_cell}">${c.phone_cell}</a>` : '<span class="muted">No phone</span>')}</div>
          <div class="detail-row"><strong>County:</strong> ${c.county || '<span class="muted">Unknown</span>'}</div>
          <div class="detail-row"><strong>Tags:</strong> ${(c.lists||[]).map(x=>`<span class="pill small">${x}</span>`).join(' ') } ${c.tag? `<span class="pill small">${c.tag}</span>`: ''}</div>
          <div class="detail-notes">${hasNotes? `<h4>Notes</h4><div class="notes">${(c.notes||'').replace(/\n/g,'<br>')}</div>` : ''}</div>
          <div class="detail-flags" style="margin-top:10px;display:flex;gap:8px;align-items:center">
            ${incomplete? '<span class="flag flag-warn">Incomplete</span>' : '<span class="flag flag-ok">Complete</span>'}
            ${hasNotes? '<span class="flag flag-info">Has notes</span>' : ''}
            <button id="detailEditBtn" class="btn">Edit</button>
            <a id="detailExport" class="btn" href="/api/export?id=${encodeURIComponent(c.id||'')}">Export</a>
          </div>
          ${activitySectionHtml()}
        </div>
      </div>
    `
    panel.style.display = ''
    const edit = el('detailEditBtn'); if(edit) edit.addEventListener('click', ()=> openProfile(c.id))
    const activityContainer = panel.querySelector('.activity-section')
    loadActivitySection(activityContainer, 'contact', c.id)
    bindActivityForm(activityContainer, 'contact', c.id)
  }catch(e){ console.error(e) }
}

// Outreach history shared by the Contacts detail panel and the Sections
// org detail panel -- lets staff see, before reaching out, whether someone
// (or an organization) has already been contacted, by whom, and why.
function activitySectionHtml(){
  const savedName = localStorage.getItem('jbj_employee_name') || ''
  const today = new Date().toISOString().slice(0,10)
  return `
    <div class="activity-section">
      <h4>Outreach History</h4>
      <div class="activity-badge"></div>
      <div class="activity-list">Loading…</div>
      <div class="activity-form">
        <input class="activity-employee" placeholder="Your name" value="${savedName}">
        <select class="activity-channel">
          <option value="Email">Email</option>
          <option value="Phone">Phone</option>
          <option value="Meeting">Meeting</option>
          <option value="Other">Other</option>
        </select>
        <input type="date" class="activity-date" value="${today}">
        <textarea class="activity-summary" rows="2" placeholder="What was discussed / details"></textarea>
        <button class="btn btn-primary activity-log-btn">Log Outreach</button>
      </div>
    </div>
  `
}

function activityBadgeHtml(activity){
  if(!activity || activity.length === 0) return ''
  const latest = activity[0]
  return `<span class="flag flag-warn">Contacted ${activity.length} time${activity.length===1?'':'s'} — last ${new Date(latest.contacted_on+'T00:00:00').toLocaleDateString()} by ${latest.employee_name}</span>`
}

function activityListHtml(activity){
  if(!activity || activity.length === 0) return '<div class="muted">No outreach logged yet.</div>'
  return activity.map(a=>`
    <div class="activity-item">
      <div class="activity-meta"><strong>${new Date(a.contacted_on+'T00:00:00').toLocaleDateString()}</strong> — ${a.employee_name}${a.channel? ' via '+a.channel : ''}</div>
      <div class="activity-summary">${(a.summary||'').replace(/\n/g,'<br>')}</div>
      <button class="btn btn-sm activity-delete" data-id="${a.id}">Delete</button>
    </div>
  `).join('')
}

function activityUrl(scopeType, scopeId){
  return scopeType === 'contact'
    ? `/api/contacts/${encodeURIComponent(scopeId)}/activity`
    : `/api/organizations/${encodeURIComponent(scopeId)}/activity`
}

async function loadActivitySection(container, scopeType, scopeId){
  if(!container) return
  const listEl = container.querySelector('.activity-list')
  const badgeEl = container.querySelector('.activity-badge')
  try{
    const res = await fetch(activityUrl(scopeType, scopeId))
    const json = await res.json()
    const activity = json.activity || []
    if(badgeEl) badgeEl.innerHTML = activityBadgeHtml(activity)
    if(listEl) listEl.innerHTML = activityListHtml(activity)
    if(listEl) listEl.querySelectorAll('.activity-delete').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(!confirm('Delete this log entry?')) return
        await fetch('/api/activity/'+btn.dataset.id, {method:'DELETE'})
        loadActivitySection(container, scopeType, scopeId)
      })
    })
  }catch(e){ if(listEl) listEl.innerHTML = '<div class="muted">Could not load outreach history.</div>'; console.error(e) }
}

function bindActivityForm(container, scopeType, scopeId){
  if(!container) return
  const btn = container.querySelector('.activity-log-btn')
  if(!btn) return
  btn.addEventListener('click', async ()=>{
    const employee_name = container.querySelector('.activity-employee').value.trim()
    const summary = container.querySelector('.activity-summary').value.trim()
    const channel = container.querySelector('.activity-channel').value
    const contacted_on = container.querySelector('.activity-date').value
    if(!employee_name || !summary){ alert('Your name and a short summary are required.'); return }
    localStorage.setItem('jbj_employee_name', employee_name)
    try{
      const res = await fetch(activityUrl(scopeType, scopeId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ employee_name, summary, channel, contacted_on })
      })
      if(!res.ok){ alert('Could not log outreach.'); return }
      container.querySelector('.activity-summary').value = ''
      loadActivitySection(container, scopeType, scopeId)
    }catch(e){ alert('Could not log outreach.'); console.error(e) }
  })
}

function renderRoleGroup(role, contacts){
  const wrap = document.createElement('div')
  wrap.className = 'role-group'
  const header = document.createElement('h4')
  header.textContent = role || 'Other'
  wrap.appendChild(header)
  const list = document.createElement('div')
  list.className = 'role-contacts'
  contacts.forEach(c=>{
    const r = document.createElement('div')
    r.className = 'role-contact'
    r.innerHTML = `<strong>${c.first_name||''} ${c.last_name||''}</strong> — ${c.organization||''} <div class="email">${c.email||''}</div>`
    r.addEventListener('click', ()=>openProfile(c.id))
    list.appendChild(r)
  })
  wrap.appendChild(list)
  return wrap
}

async function search(){
  console.debug('search() start', {page: state.page, limit: state.limit, q: state.q, tag: state.tag})
  const out = el('results')
  out.innerHTML = '<div>Loading…</div>'
  const params = new URLSearchParams({page: state.page, limit: state.limit})
  if(state.q) params.set('q', state.q)
  if(state.tag) params.set('tag', state.tag)
  if(state.county) params.set('county', state.county)
  try{
    const res = await fetch(API.contacts + '?' + params.toString())
    const j = await res.json()
    console.debug('search() returned', j && (j.contacts ? j.contacts.length : null), 'contacts, meta total=', j.total)
    out.innerHTML = ''
    state.total = j.total || 0
    if(!j.contacts || j.contacts.length===0){ out.innerHTML = '<div>No results</div>'; renderPagination(state.total); return }
    j.contacts.forEach(c=>out.appendChild(renderCard(c)))
    renderPagination(state.total)
  }catch(e){out.innerHTML = '<div>Error loading results</div>';console.error(e)}
}

function renderPagination(total){
  const pagesContainer = el('pages')
  pagesContainer.innerHTML = ''
  const pages = Math.max(1, Math.ceil(total / state.limit))
  const start = Math.max(1, state.page - 2)
  const end = Math.min(pages, start + 4)
  for(let p=start;p<=end;p++){
    const b = document.createElement('button')
    b.className = 'page-number'
    b.textContent = p
    if(p===state.page) b.style.fontWeight='700'
    b.addEventListener('click', ()=>{ state.page = p; search() })
    pagesContainer.appendChild(b)
  }
}

async function openProfile(id, defaults={}){
  try{
    let c = {id:null, first_name:'', last_name:'', organization:'', title:'', email:'', phone_office:'', phone_cell:'', county:'', lists:[], notes:'', tag:'', ...defaults}
    if(id){
      const res = await fetch(`/api/contacts/${id}`)
      c = await res.json()
    }
    const body = el('modalBody')
    body.innerHTML = `
      <h2 id="modalTitle">${id? 'Edit Contact' : 'New Contact'}</h2>
      <form id="contactForm">
        <input type="hidden" id="contactId" value="${c.id||''}" />
        <label>First name<br><input id="cf_first" value="${c.first_name||''}" /></label>
        <label>Last name<br><input id="cf_last" value="${c.last_name||''}" /></label>
        <label>Organization<br><input id="cf_org" value="${c.organization||''}" /></label>
        <label>Title<br><input id="cf_title" value="${c.title||''}" /></label>
        <label>Email<br><input id="cf_email" value="${c.email||''}" /></label>
        <label>Office Phone<br><input id="cf_office" value="${c.phone_office||''}" /></label>
        <label>Cell Phone<br><input id="cf_cell" value="${c.phone_cell||''}" /></label>
        <label>Tag<br><input id="cf_tag" value="${c.tag||''}" /></label>
        <label>Lists (comma separated)<br><input id="cf_lists" value="${(c.lists||[]).join(', ')}" /></label>
        <label>County<br><input id="cf_county" value="${c.county||''}" /></label>
        <label>Notes<br><textarea id="cf_notes">${c.notes||''}</textarea></label>
        <div style="margin-top:10px">
          <button id="saveContactBtn" type="button" class="btn btn-primary">Save</button>
          <button id="closeModalBtn" type="button" class="btn">Close</button>
        </div>
      </form>
    `
    const modal = el('profileModal')
    if(modal){ modal.style.display = '' }
    el('closeModalBtn').addEventListener('click', closeModal)
    el('saveContactBtn').addEventListener('click', saveContact)
  }catch(e){console.error(e)}
}

async function saveContact(){
  const id = el('contactId').value
  const payload = {
    first_name: el('cf_first').value.trim(),
    last_name: el('cf_last').value.trim(),
    organization: el('cf_org').value.trim(),
    title: el('cf_title').value.trim(),
    email: el('cf_email').value.trim(),
    phone_office: el('cf_office').value.trim(),
    phone_cell: el('cf_cell').value.trim(),
    tag: el('cf_tag').value.trim(),
    lists: (el('cf_lists').value||'').split(',').map(s=>s.trim()).filter(Boolean),
    county: el('cf_county').value.trim(),
    notes: el('cf_notes').value.trim(),
  }
  try{
    let res
    if(id){
      res = await fetch('/api/contacts/'+id, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
    } else {
      res = await fetch('/api/contacts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
    }
    if(!res.ok) throw new Error('Save failed')
    const j = await res.json()
    closeModal()
    fetchStats(); fetchTags(); state.page=1; search();
    alert('Saved')
  }catch(e){alert('Save failed'); console.error(e)}
}

function closeModal(){ const m = el('profileModal'); if(m) m.style.display = 'none' }

function bind(){
  el('searchBtn').addEventListener('click', ()=>{ state.q = el('searchInput').value.trim(); state.tag = el('tagFilter').value; state.county = el('mainCountyFilter').value; state.page = 1; search() })
  el('searchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ state.q = el('searchInput').value.trim(); state.county = el('mainCountyFilter').value; state.page = 1; search() } })
  const mainCountySel = el('mainCountyFilter')
  if(mainCountySel) mainCountySel.addEventListener('change', ()=>{ state.county = mainCountySel.value; state.page = 1; search() })
  // Roles search
  el('roleSearchBtn').addEventListener('click', ()=>{ runRoleSearch() })
  el('roleSearchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ runRoleSearch() } })
  const roleTagSel = el('roleTagFilter')
  if(roleTagSel) roleTagSel.addEventListener('change', ()=>{ const t = roleTagSel.value; if(t) loadTagPage(t,1); else searchRoles('') })
  const countySel = el('countyFilter')
  if(countySel) countySel.addEventListener('change', ()=>{ const t = el('roleTagFilter').value; if(t) loadTagPage(t,1); else searchRoles('') })
  // keyboard shortcuts: Ctrl+K and '/'
  window.addEventListener('keydown', (e)=>{
    if((e.ctrlKey && e.key.toLowerCase()==='k') || e.key === '/'){
      e.preventDefault(); el('searchInput').focus();
    }
  })
  el('prevPage').addEventListener('click', ()=>{ if(state.page>1){ state.page--; search() } })
  el('nextPage').addEventListener('click', ()=>{
    const maxPage = Math.max(1, Math.ceil((state.total||0)/state.limit))
    if(state.page < maxPage){ state.page++; search() }
  })
  el('closeModal').addEventListener('click', closeModal)
  const addBtn = el('addContactBtn')
  if(addBtn) addBtn.addEventListener('click', ()=>{ openProfile(null); showSearch(); })
  const backBtn = el('backHomeBtn')
  if(backBtn) backBtn.addEventListener('click', ()=>{ showHome(true) })
  el('tagFilter').addEventListener('change', ()=>{ state.tag = el('tagFilter').value; state.page=1; search() })
  bindExportMenu()
  bindRoleExportMenu()
  bindDraftEmail()
}

function currentExportParams(){
  const params = new URLSearchParams()
  if(state.q) params.set('q', state.q)
  if(state.tag) params.set('tag', state.tag)
  if(state.county) params.set('county', state.county)
  return params
}

function bindExportMenu(){
  const btn = el('exportMenuBtn')
  const menu = el('exportMenu')
  if(!btn || !menu) return
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? '' : 'none' })
  document.addEventListener('click', ()=>{ menu.style.display = 'none' })

  const copyBtn = el('exportCopyEmails')
  if(copyBtn) copyBtn.addEventListener('click', async ()=>{
    menu.style.display = 'none'
    try{
      const res = await fetch('/api/export/emails?' + currentExportParams().toString())
      const j = await res.json()
      if(!j.emails || j.emails.length === 0){ alert('No emails found for the current filter.'); return }
      await navigator.clipboard.writeText(j.joined)
      alert(`Copied ${j.count} email address${j.count===1?'':'es'} to clipboard — paste into BCC.`)
    }catch(e){ alert('Could not copy emails'); console.error(e) }
  })

  const csvBtn = el('exportCsvBtn')
  if(csvBtn) csvBtn.addEventListener('click', ()=>{
    menu.style.display = 'none'
    window.location.href = '/api/export?' + currentExportParams().toString()
  })

  const docxBtn = el('exportDocxBtn')
  if(docxBtn) docxBtn.addEventListener('click', ()=>{
    menu.style.display = 'none'
    window.location.href = '/api/export/docx?' + currentExportParams().toString()
  })
}

function bindDraftEmail(){
  const btn = el('draftEmailBtn')
  const modal = el('draftEmailModal')
  if(!btn || !modal) return

  const describeAudience = ()=>{
    const parts = []
    if(state.tag) parts.push(`tag "${state.tag}"`)
    if(state.county) parts.push(`county "${state.county}"`)
    if(state.q) parts.push(`search "${state.q}"`)
    el('draftEmailAudience').textContent = parts.length
      ? 'Drafting for the current filter: ' + parts.join(', ')
      : 'Drafting for all contacts (no filter applied).'
  }

  btn.addEventListener('click', ()=>{
    describeAudience()
    el('draftEmailPrompt').value = ''
    el('draftEmailOutput').style.display = 'none'
    el('draftEmailOutput').value = ''
    el('draftEmailCopyBtn').style.display = 'none'
    el('draftEmailStatus').textContent = ''
    modal.style.display = ''
    el('draftEmailPrompt').focus()
  })

  el('closeDraftEmailModal').addEventListener('click', ()=>{ modal.style.display = 'none' })

  el('draftEmailGenerateBtn').addEventListener('click', async ()=>{
    const prompt = el('draftEmailPrompt').value.trim()
    if(!prompt){ el('draftEmailStatus').textContent = 'Describe the email you want to draft.'; return }
    const genBtn = el('draftEmailGenerateBtn')
    genBtn.disabled = true
    el('draftEmailStatus').textContent = 'Drafting…'
    el('draftEmailOutput').style.display = 'none'
    el('draftEmailCopyBtn').style.display = 'none'
    try{
      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ prompt, q: state.q, tag: state.tag, county: state.county })
      })
      const j = await res.json()
      if(!res.ok){ el('draftEmailStatus').textContent = j.error || 'Could not draft email.'; return }
      el('draftEmailOutput').value = j.draft || ''
      el('draftEmailOutput').style.display = ''
      el('draftEmailCopyBtn').style.display = ''
      el('draftEmailStatus').textContent = `Drafted for ${j.recipient_count} recipient${j.recipient_count===1?'':'s'}.`
    }catch(e){
      el('draftEmailStatus').textContent = 'Could not reach the server.'
      console.error(e)
    }finally{
      genBtn.disabled = false
    }
  })

  el('draftEmailCopyBtn').addEventListener('click', async ()=>{
    try{
      await navigator.clipboard.writeText(el('draftEmailOutput').value)
      el('draftEmailStatus').textContent = 'Copied to clipboard.'
    }catch(e){ el('draftEmailStatus').textContent = 'Could not copy.' }
  })
}
// Export params for the Roles/Sections tab, scoped to whatever's active in
// its own toolbar (separate from the Contacts tab's currentExportParams()).
function currentRoleExportParams(){
  const params = new URLSearchParams()
  const q = el('roleSearchInput') ? el('roleSearchInput').value.trim() : ''
  const tag = el('roleTagFilter') ? el('roleTagFilter').value : ''
  const county = el('countyFilter') ? el('countyFilter').value : ''
  if(q) params.set('q', q)
  if(tag) params.set('tag', tag)
  if(county) params.set('county', county)
  return params
}

function bindRoleExportMenu(){
  const btn = el('roleExportMenuBtn')
  const menu = el('roleExportMenu')
  if(!btn || !menu) return
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? '' : 'none' })
  document.addEventListener('click', ()=>{ menu.style.display = 'none' })

  const copyBtn = el('roleExportCopyEmails')
  if(copyBtn) copyBtn.addEventListener('click', async ()=>{
    menu.style.display = 'none'
    try{
      const res = await fetch('/api/export/emails?' + currentRoleExportParams().toString())
      const j = await res.json()
      if(!j.emails || j.emails.length === 0){ alert('No emails found for the current filter.'); return }
      await navigator.clipboard.writeText(j.joined)
      alert(`Copied ${j.count} email address${j.count===1?'':'es'} to clipboard — paste into BCC.`)
    }catch(e){ alert('Could not copy emails'); console.error(e) }
  })

  const csvBtn = el('roleExportCsvBtn')
  if(csvBtn) csvBtn.addEventListener('click', ()=>{
    menu.style.display = 'none'
    window.location.href = '/api/export?' + currentRoleExportParams().toString()
  })

  const docxBtn = el('roleExportDocxBtn')
  if(docxBtn) docxBtn.addEventListener('click', ()=>{
    menu.style.display = 'none'
    window.location.href = '/api/export/docx?' + currentRoleExportParams().toString()
  })
}

// Run the "Search Roles" action, respecting the active category filter the
// same way the category/county dropdowns already do — otherwise an empty
// search box would wipe out a category you'd just selected.
function runRoleSearch(){
  const q = el('roleSearchInput').value.trim()
  const tag = el('roleTagFilter') ? el('roleTagFilter').value : ''
  if(!q && tag){ loadTagPage(tag,1); return }
  searchRoles(q)
}

// Roles: show tag list and allow viewing a paginated list per tag.
// rolesRenderSeq guards against races between overlapping calls (e.g. the
// initial unfiltered "show everyone" fetch resolving after a faster,
// later county/tag-filtered fetch and overwriting it with stale results).
let rolesRenderSeq = 0
async function searchRoles(q=''){
  const mySeq = ++rolesRenderSeq
  const out = el('rolesResults')
  out.innerHTML = '<div>Loading sections…</div>'
  fetchSectionStats()
  try{
    const roleTag = el('roleTagFilter') ? el('roleTagFilter').value : ''
    const county = el('countyFilter') ? el('countyFilter').value : ''
    // If q provided, perform a text search across sections and render flattened results
    if(q){
      const params = new URLSearchParams({q, limit:50, page:1})
      if(roleTag) params.set('tag', roleTag)
      if(county) params.set('county', county)
      const res = await fetch('/api/sections?'+params.toString())
      const json = await res.json()
      if(mySeq !== rolesRenderSeq) return
      renderSectionsSearchResults(json, out)
      return
    }

    // If a county is selected, check whether the Sections data (organizations)
    // actually has anything in that county. If not, fall back to listing the
    // raw Contacts for that county instead of an unrelated, unfiltered overview.
    if(county){
      const sres = await fetch('/api/sections?county='+encodeURIComponent(county))
      const sjson = await sres.json()
      if(mySeq !== rolesRenderSeq) return
      if(sjson.meta && sjson.meta.total > 0){
        renderSectionsSearchResults(sjson, out)
        return
      }
      const cres = await fetch('/api/contacts?county='+encodeURIComponent(county)+'&limit=200')
      const cjson = await cres.json()
      if(mySeq !== rolesRenderSeq) return
      renderCountyContactsFallback(cjson, out, county)
      return
    }

    // No filters at all — show every organization across every category,
    // the same way the Contacts tab shows everyone by default.
    const res = await fetch('/api/sections')
    const json = await res.json()
    if(mySeq !== rolesRenderSeq) return
    renderSectionsSearchResults(json, out)
  }catch(e){ if(mySeq === rolesRenderSeq){ out.innerHTML = '<div>Error loading sections</div>' } console.error(e) }
}

// Build one box for an organization/section entry — same card look as the
// Contacts tab's individual contact boxes.
// Shown in the contact-detail panel for an organization that has no contact
// on file yet, with a button to add one (pre-filled with the organization).
function showOrgDetail(item){
  const panel = el('contactDetail')
  if(!panel) return
  panel.innerHTML = `
    <div class="detail-card">
      <div class="detail-photo photo-placeholder">${(item.organization||'?').charAt(0)}</div>
      <div class="detail-main">
        <h2>${item.organization||''}</h2>
        <div class="detail-sub">${item.tag||''}</div>
        <div class="detail-row"><strong>Contacts on file:</strong> ${item.contact_count||0}</div>
        <div class="detail-row"><strong>Last touched:</strong> ${item.latest_updated? new Date(item.latest_updated).toLocaleDateString() : '<span class="muted">Never</span>'}</div>
        <div class="detail-notes">${item.notes? `<h4>Notes</h4><div class="notes">${item.notes.replace(/\|\|/g,', ')}</div>` : '<span class="muted">No notes yet</span>'}</div>
        <div class="detail-flags" style="margin-top:10px;display:flex;gap:8px;align-items:center">
          <span class="flag flag-warn">No contact on file</span>
          <button id="detailAddContactBtn" class="btn btn-primary">Add Contact</button>
        </div>
        ${activitySectionHtml()}
      </div>
    </div>
  `
  panel.style.display = ''
  const addBtn = el('detailAddContactBtn')
  if(addBtn) addBtn.addEventListener('click', ()=> openProfile(null, {organization: item.organization, tag: item.tag||''}))
  const activityContainer = panel.querySelector('.activity-section')
  loadActivitySection(activityContainer, 'org', item.organization)
  bindActivityForm(activityContainer, 'org', item.organization)
}

// tag is passed in separately since grouped section items don't carry their
// own tag field (it's the dict key one level up) -- used to pre-fill the
// category when adding a contact for an org that doesn't have one yet.
function renderSectionCard(item, tag){
  const fullItem = Object.assign({}, item, {tag: item.tag || tag || ''})
  const div = document.createElement('div')
  div.className = 'card'
  div.tabIndex = 0
  const p = item.primary_contact || {}
  const primaryHtml = p.name
    ? `<div class="pc-name">${p.name}</div><div class="pc-meta">${p.title||''}${p.email? ' • '+p.email : ''}${p.phone_cell? ' • '+p.phone_cell : ''}</div>`
    : '<div class="muted">No contact on file</div>'
  div.innerHTML = `
    <h3>${item.organization||''}</h3>
    <div class="meta">${item.contact_count||0} contact${item.contact_count===1?'':'s'}${item.latest_updated? ' • Updated '+new Date(item.latest_updated).toLocaleDateString() : ''}</div>
    ${primaryHtml}
    ${item.notes ? `<div class="category">${item.notes.replace(/\|\|/g,', ')}</div>` : ''}
    <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">
      <button class="btn btn-sm view-btn">View</button>
      <button class="btn btn-sm edit-btn">Edit</button>
    </div>
  `
  const handleView = ()=> p.id ? showContactDetail(p.id) : showOrgDetail(fullItem)
  const handleEdit = ()=> p.id ? openProfile(p.id) : openProfile(null, {organization: fullItem.organization, tag: fullItem.tag})
  div.addEventListener('click', (ev)=>{ if(ev.target && ev.target.classList && (ev.target.classList.contains('view-btn')||ev.target.classList.contains('edit-btn'))){ return } handleView() })
  const viewBtn = div.querySelector('.view-btn')
  if(viewBtn) viewBtn.addEventListener('click', (e)=>{ e.stopPropagation(); handleView() })
  const editBtn = div.querySelector('.edit-btn')
  if(editBtn) editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); handleEdit() })
  return div
}

function buildSectionsGrid(items, tag){
  const grid = document.createElement('div')
  grid.className = 'results-grid'
  items.forEach(item=> grid.appendChild(renderSectionCard(item, tag)))
  return grid
}

// Used when a county has no matching Sections organizations — shows the raw
// Contacts for that county instead (as boxes, same as the Contacts tab), so
// the filter isn't a dead end.
function renderCountyContactsFallback(json, out, county){
  out.innerHTML = ''
  const rows = json.contacts || []
  const note = document.createElement('div')
  note.className = 'tag-meta'
  note.textContent = `No sections found for ${county}. Showing ${rows.length} contact${rows.length===1?'':'s'} in this county.`
  out.appendChild(note)
  if(rows.length === 0) return
  const grid = document.createElement('div')
  grid.className = 'results-grid'
  rows.forEach(c=> grid.appendChild(renderCard(c)))
  out.appendChild(grid)
}

function renderSectionsSearchResults(json, out){
  out.innerHTML = ''
  const sections = json.sections || {}
  const keys = Object.keys(sections)
  if(keys.length === 0){ out.innerHTML = '<div>No sections found</div>'; return }
  keys.forEach(tag=>{
    const header = document.createElement('h3')
    header.textContent = tag
    out.appendChild(header)
    out.appendChild(buildSectionsGrid(sections[tag]||[], tag))
  })
}

async function loadTagPage(tag, page=1, limit=50){
  const mySeq = ++rolesRenderSeq
  const out = el('rolesResults')
  out.innerHTML = '<div>Loading '+tag+' …</div>'
  try{
    const params = new URLSearchParams({tag, page, limit})
    const county = el('countyFilter') ? el('countyFilter').value : ''
    if(county) params.set('county', county)
    const res = await fetch('/api/sections?'+params.toString())
    const json = await res.json()
    if(mySeq !== rolesRenderSeq) return
    const sections = json.sections || {}
    const meta = json.meta || {}
    // sections should contain only the requested tag
    const items = sections[tag] || []
    out.innerHTML = ''
    const headerRow = document.createElement('div')
    headerRow.className = 'tag-header-row'
    headerRow.innerHTML = `<h3>${tag}</h3><div class="tag-meta">Showing page ${meta.page||page} — ${meta.total||items.length} items</div>`
    out.appendChild(headerRow)
    out.appendChild(buildSectionsGrid(items, tag))

    // pager
    const pager = document.createElement('div')
    pager.className = 'sections-pager'
    const maxPage = Math.max(1, Math.ceil((meta.total||0)/limit))
    const current = meta.page || page
    // numeric page buttons (show window of pages)
    const win = 7
    const start = Math.max(1, current - Math.floor(win/2))
    const end = Math.min(maxPage, start + win - 1)
    if(current > 1){
      const first = document.createElement('button'); first.textContent = '«'; first.addEventListener('click', ()=> loadTagPage(tag,1,limit)); pager.appendChild(first)
    }
    for(let p=start;p<=end;p++){
      const b = document.createElement('button')
      b.className = 'page-number'
      b.textContent = p
      if(p===current) b.style.fontWeight='700'
      b.addEventListener('click', ()=> loadTagPage(tag,p,limit))
      pager.appendChild(b)
    }
    if(current < maxPage){
      const last = document.createElement('button'); last.textContent = '»'; last.addEventListener('click', ()=> loadTagPage(tag,maxPage,limit)); pager.appendChild(last)
    }
    out.appendChild(pager)
  }catch(e){ if(mySeq === rolesRenderSeq){ out.innerHTML = '<div>Error loading tag</div>' } console.error(e) }
}

window.addEventListener('load', async ()=>{
  bind();
  await fetchTags();
  await fetchCategories();
  await fetchCounties();
  await fetchStats();
  // navigation: show home or search based on history state
  if(window.location.hash === '#search' || window.location.hash === '#search_roles'){
    const mode = window.location.hash === '#search_roles' ? 'roles' : 'contacts'
    showSearch(false, true, mode)
    if(mode === 'roles') searchRoles('')
  } else {
    showHome(false)
  }
})

function showHome(push=true){
  const hero = el('hero')
  const headerHidden = document.querySelectorAll('.header-hidden')
  const roles = el('rolesSection')
  const results = el('results')
  const pagination = document.querySelector('.pagination')
  const detail = el('contactDetail')
  if(hero) hero.style.display = ''
  headerHidden.forEach(n=> { n.classList.add('header-hidden'); n.style.display = 'none' })
  if(roles) roles.style.display = 'none'
  if(results) results.style.display = 'none'
  if(detail) detail.style.display = 'none'
  if(pagination) pagination.style.display = 'none'
  if(push) history.pushState({page:'home'}, '', '/')
}

// mode: 'contacts' shows the Contacts grid/pagination; 'roles' shows the
// Sections/Roles area instead — they're mutually exclusive so stray results
// from one don't show up underneath the other.
function showSearch(push=true, focus=true, mode='contacts'){
  const hero = el('hero')
  const headerHidden = document.querySelectorAll('.header-hidden')
  const roles = el('rolesSection')
  const results = el('results')
  const pagination = document.querySelector('.pagination')
  const detail = el('contactDetail')
  const contactsSearchBar = document.querySelector('.search-large')
  const roleSearchBar = document.querySelector('.role-search')
  const showRoles = mode === 'roles'
  if(hero) hero.style.display = 'none'
  headerHidden.forEach(n=> { n.classList.remove('header-hidden'); n.style.display = '' })
  if(roles) roles.style.display = showRoles ? '' : 'none'
  if(results) results.style.display = showRoles ? 'none' : ''
  if(pagination) pagination.style.display = showRoles ? 'none' : ''
  if(detail) detail.style.display = 'none'
  // The generic .header-hidden sweep above shows both search bars at once --
  // make them mode-exclusive so typing in one doesn't silently target a
  // hidden grid on the other tab.
  if(contactsSearchBar) contactsSearchBar.style.display = showRoles ? 'none' : ''
  if(roleSearchBar) roleSearchBar.style.display = showRoles ? '' : 'none'
  if(push) history.pushState({page: showRoles ? 'search_roles' : 'search'}, '', showRoles ? '#search_roles' : '#search')
  if(focus){
    if(showRoles){ const ri = el('roleSearchInput'); if(ri) ri.focus() }
    else { const si = el('searchInput'); if(si) si.focus(); state.page = 1; search(); }
  }
}

window.addEventListener('popstate', ()=>{
  const hash = window.location.hash
  if(hash === '#search_roles'){ showSearch(false,false,'roles'); searchRoles('') }
  else if(hash === '#search'){ showSearch(false,false,'contacts'); fetchStats() }
  else showHome(false)
})

// Support hash-based navigation fallback (used by inline hero buttons)
window.addEventListener('hashchange', ()=>{
  if(window.location.hash === '#search' || window.location.hash === '#search_roles'){
    const mode = window.location.hash === '#search_roles' ? 'roles' : 'contacts'
    showSearch(false,false,mode)
    if(mode === 'roles'){
      const r = el('roleSearchInput'); if(r) r.focus()
      searchRoles('')
    } else {
      const s = el('searchInput'); if(s) s.focus()
      fetchStats()
    }
  }
})

// hook home tiles
// Attach hero tile handlers immediately so they work without relying on DOMContentLoaded
{
  const c = el('homeContacts'); if(c) c.addEventListener('click', ()=> { showSearch(true, true, 'contacts'); fetchStats(); })
  const r = el('homeRoles'); if(r) r.addEventListener('click', ()=> { showSearch(true, false, 'roles'); const rs = el('roleSearchInput'); if(rs) rs.focus(); searchRoles(''); })
}
