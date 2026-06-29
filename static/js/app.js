const API = {
  contacts: '/api/contacts',
  sections: '/api/sections',
  stats: '/api/stats',
  tags: '/api/tags',
  sectionCategories: '/api/section-categories',
  counties: '/api/counties',
}

let state = { page: 1, limit: 25, q: '', tags: [], counties: [], followup: '', total: 0, view: 'people' }

function el(id){return document.getElementById(id)}
function initials(first, last, fallback){
  const text = (first||'').charAt(0) + (last||'').charAt(0)
  return text || (fallback || '—')
}

// Lightweight toast notification -- replaces native alert() for save/
// delete/error feedback, since alert() blocks the whole page.
function toast(message, type){
  let stack = document.querySelector('.toast-stack')
  if(!stack){
    stack = document.createElement('div')
    stack.className = 'toast-stack'
    document.body.appendChild(stack)
  }
  const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'
  const t = document.createElement('div')
  t.className = 'toast' + (type === 'error' ? ' toast-error' : '')
  t.innerHTML = `<i class="fas ${icon}"></i> ${message}`
  stack.appendChild(t)
  requestAnimationFrame(()=> t.classList.add('show'))
  setTimeout(()=>{
    t.classList.remove('show')
    setTimeout(()=> t.remove(), 250)
  }, 3200)
}
console.debug('app.js loaded')

// The Tag, County, and Export dropdowns are independent toggle buttons, but
// each one's own click handler calls stopPropagation() (so opening it
// doesn't immediately trigger its own "click outside closes it" listener) --
// which also stops that click from reaching the *other* dropdowns'
// outside-click listeners, so they never close. Closing every other menu
// before opening one keeps only one open at a time.
function closeOtherFilterMenus(exceptId){
  ;['tagFilterMenu', 'countyFilterMenu', 'exportMenu'].forEach(id => {
    if(id === exceptId) return
    const m = el(id)
    if(m) m.style.display = 'none'
  })
}

function updateTagFilterLabel(){
  const label = el('tagFilterLabel')
  if(!label) return
  const noun = state.view === 'organizations' ? 'Categories' : 'Tags'
  if(state.tags.length === 0) label.textContent = `All ${noun}`
  else if(state.tags.length === 1) label.textContent = state.tags[0]
  else label.textContent = `${state.tags.length} ${noun}`
}

// The category dropdown is shared by both views, but People (Contact.tag)
// and Organizations (OutreachOrg.tag) use different category names for the
// same kind of grouping -- so it's repopulated from a different endpoint
// whenever the view changes, rather than trying to merge the two lists.
async function fetchTagOptions(){
  const menu = el('tagFilterMenu')
  if(!menu) return
  try{
    const url = state.view === 'organizations' ? API.sectionCategories : API.tags
    const res = await fetch(url)
    const names = await res.json()
    if(!names.length){
      menu.innerHTML = '<div class="filter-menu-empty">No tags on file yet.</div>'
      updateTagFilterLabel()
      return
    }
    menu.innerHTML = names.map(name => `
      <label class="filter-option">
        <input type="checkbox" value="${name}" ${state.tags.includes(name) ? 'checked' : ''}>
        <span>${name}</span>
      </label>
    `).join('')
    menu.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', ()=>{
        if(cb.checked){
          if(!state.tags.includes(cb.value)) state.tags.push(cb.value)
        } else {
          state.tags = state.tags.filter(t => t !== cb.value)
        }
        updateTagFilterLabel()
        state.page = 1
        search()
      })
    })
    updateTagFilterLabel()
  }catch(e){console.warn(e)}
}

function bindTagFilter(){
  const btn = el('tagFilterBtn')
  const menu = el('tagFilterMenu')
  if(!btn || !menu) return
  btn.addEventListener('click', (e)=>{
    e.stopPropagation()
    const opening = menu.style.display === 'none'
    closeOtherFilterMenus('tagFilterMenu')
    menu.style.display = opening ? '' : 'none'
  })
  menu.addEventListener('click', (e)=> e.stopPropagation())
  document.addEventListener('click', ()=>{ menu.style.display = 'none' })
}

function updateCountyFilterLabel(){
  const label = el('countyFilterLabel')
  if(!label) return
  if(state.counties.length === 0) label.textContent = 'All Counties'
  else if(state.counties.length === 1) label.textContent = state.counties[0]
  else label.textContent = `${state.counties.length} Counties`
}

async function fetchCounties(){
  try{
    const res = await fetch(API.counties)
    const names = await res.json()
    const menu = el('countyFilterMenu')
    if(!menu) return
    if(!names.length){
      menu.innerHTML = '<div class="filter-menu-empty">No counties on file yet.</div>'
      return
    }
    menu.innerHTML = names.map(name => `
      <label class="filter-option">
        <input type="checkbox" value="${name}" ${state.counties.includes(name) ? 'checked' : ''}>
        <span>${name}</span>
      </label>
    `).join('')
    menu.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', ()=>{
        if(cb.checked){
          if(!state.counties.includes(cb.value)) state.counties.push(cb.value)
        } else {
          state.counties = state.counties.filter(c => c !== cb.value)
        }
        updateCountyFilterLabel()
        state.page = 1
        search()
      })
    })
    updateCountyFilterLabel()
  }catch(e){console.warn(e)}
}

function bindCountyFilter(){
  const btn = el('countyFilterBtn')
  const menu = el('countyFilterMenu')
  if(!btn || !menu) return
  btn.addEventListener('click', (e)=>{
    e.stopPropagation()
    const opening = menu.style.display === 'none'
    closeOtherFilterMenus('countyFilterMenu')
    menu.style.display = opening ? '' : 'none'
  })
  menu.addEventListener('click', (e)=> e.stopPropagation())
  document.addEventListener('click', ()=>{ menu.style.display = 'none' })
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
  const div = document.createElement('div')
  div.className = 'card'
  div.tabIndex = 0
  div.innerHTML = `
    <div class="card-top">
      <div class="avatar md">${initials(c.first_name, c.last_name)}</div>
      <div>
        <h3>${c.first_name||''} ${c.last_name||''}</h3>
        <div class="meta">${c.organization||''} — ${c.title||''}</div>
      </div>
    </div>
    <div class="pills">${(c.lists||[]).slice(0,3).map(p=>`<span class="pill">${p}</span>`).join('')}</div>
    <div class="category">${c.tag||''}</div>
    <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">
      <button class="btn btn-sm view-btn"><i class="fas fa-eye"></i> View</button>
      <button class="btn btn-sm edit-btn"><i class="fas fa-pen"></i> Edit</button>
    </div>
  `
  div.addEventListener('click', (ev)=>{ if(ev.target && (ev.target.classList && (ev.target.classList.contains('view-btn')||ev.target.classList.contains('edit-btn')))){ return } showContactDetail(c) })
  const viewBtn = div.querySelector('.view-btn')
  if(viewBtn) viewBtn.addEventListener('click', (e)=>{ e.stopPropagation(); showContactDetail(c) })
  const editBtn = div.querySelector('.edit-btn')
  if(editBtn) editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openProfile(c.id) })
  return div
}

// Organizations view card -- lists every contact at the organization (not
// just one "primary" contact), since coworkers sharing an organization
// should show up together.
function renderOrgCard(item){
  const div = document.createElement('div')
  div.className = 'card'
  div.tabIndex = 0
  const contacts = item.contacts || []
  const contactsHtml = contacts.length
    ? `<div class="org-contacts">${contacts.map(c=>`<div class="org-contact-row" data-id="${c.id}"><span class="pc-name">${c.name||'(no name)'}</span><span class="pc-meta">${c.title? ' — '+c.title : ''}</span></div>`).join('')}</div>`
    : '<div class="muted">No contact on file</div>'
  div.innerHTML = `
    <div class="card-top">
      <div class="avatar md">${(item.organization||'?').charAt(0).toUpperCase()}</div>
      <div>
        <h3>${item.organization||''}</h3>
        <div class="meta">${item.contact_count||0} contact${item.contact_count===1?'':'s'}${item.latest_updated? ' • Updated '+new Date(item.latest_updated+'T00:00:00').toLocaleDateString() : ''}</div>
      </div>
    </div>
    ${contactsHtml}
    ${item.notes ? `<div class="category">${item.notes.replace(/\|\|/g,', ')}</div>` : ''}
    <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">
      <button class="btn btn-sm view-btn"><i class="fas fa-eye"></i> View</button>
      <button class="btn btn-sm add-btn"><i class="fas fa-plus"></i> Add Contact</button>
    </div>
  `
  div.addEventListener('click', (ev)=>{
    const row = ev.target.closest('.org-contact-row')
    if(row){ ev.stopPropagation(); showContactDetail(parseInt(row.dataset.id,10)); return }
    if(ev.target && ev.target.classList && (ev.target.classList.contains('view-btn')||ev.target.classList.contains('add-btn'))){ return }
    showOrgDetail(item)
  })
  const viewBtn = div.querySelector('.view-btn')
  if(viewBtn) viewBtn.addEventListener('click', (e)=>{ e.stopPropagation(); showOrgDetail(item) })
  const addBtn = div.querySelector('.add-btn')
  if(addBtn) addBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openProfile(null, {organization: item.organization, tag: item.tag||''}) })
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
            <button id="detailEditBtn" class="btn"><i class="fas fa-pen"></i> Edit</button>
            <a id="detailExport" class="btn" href="/api/export?id=${encodeURIComponent(c.id||'')}"><i class="fas fa-download"></i> Export</a>
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

// Org-level detail: full contact list (each clickable into their own detail
// or edit), notes, last-touched date, and the shared outreach-activity log.
function showOrgDetail(item){
  const panel = el('contactDetail')
  if(!panel) return
  const contacts = item.contacts || []
  const contactsHtml = contacts.length
    ? `<div class="detail-row"><strong>Contacts:</strong></div><div class="org-contact-list">${contacts.map(c=>`
        <div class="org-contact-item">
          <div class="org-contact-info">
            <div class="avatar sm">${c.name ? c.name.split(' ').filter(Boolean).map(s=>s.charAt(0)).slice(0,2).join('') : '—'}</div>
            <div class="org-contact-text">
              <div class="pc-name">${c.name||'(no name)'}</div>
              <div class="pc-meta">${c.title||''}${c.email? ' • '+c.email : ''}</div>
            </div>
          </div>
          <div class="org-contact-actions">
            <button class="btn btn-sm view-person-btn" data-id="${c.id}"><i class="fas fa-eye"></i> View</button>
            <button class="btn btn-sm edit-person-btn" data-id="${c.id}"><i class="fas fa-pen"></i> Edit</button>
          </div>
        </div>
      `).join('')}</div>`
    : '<div class="detail-row"><span class="flag flag-warn">No contact on file</span></div>'
  panel.innerHTML = `
    <div class="detail-card">
      <div class="detail-photo photo-placeholder">${(item.organization||'?').charAt(0)}</div>
      <div class="detail-main">
        <h2>${item.organization||''}</h2>
        <div class="detail-sub">${item.tag||''}</div>
        <div class="detail-row"><strong>Last touched:</strong> ${item.latest_updated? new Date(item.latest_updated+'T00:00:00').toLocaleDateString() : '<span class="muted">Never</span>'}</div>
        <div class="detail-notes">${item.notes? `<h4>Notes</h4><div class="notes">${item.notes.replace(/\|\|/g,', ')}</div>` : ''}</div>
        ${contactsHtml}
        <div class="detail-flags" style="margin-top:10px;display:flex;gap:8px;align-items:center">
          <button id="detailAddContactBtn" class="btn btn-primary"><i class="fas fa-plus"></i> Add Contact</button>
        </div>
        ${activitySectionHtml()}
      </div>
    </div>
  `
  panel.style.display = ''
  const addBtn = el('detailAddContactBtn')
  if(addBtn) addBtn.addEventListener('click', ()=> openProfile(null, {organization: item.organization, tag: item.tag||''}))
  panel.querySelectorAll('.view-person-btn').forEach(b=> b.addEventListener('click', ()=> showContactDetail(parseInt(b.dataset.id,10))))
  panel.querySelectorAll('.edit-person-btn').forEach(b=> b.addEventListener('click', ()=> openProfile(parseInt(b.dataset.id,10))))
  const activityContainer = panel.querySelector('.activity-section')
  loadActivitySection(activityContainer, 'org', item.organization)
  bindActivityForm(activityContainer, 'org', item.organization)
}

// Outreach history shared by the Contacts detail panel and the Organizations
// detail panel -- lets staff see, before reaching out, whether someone
// (or an organization) has already been contacted, by whom, and why.
function activitySectionHtml(){
  const today = new Date().toISOString().slice(0,10)
  return `
    <div class="activity-section">
      <h4>Outreach History</h4>
      <div class="activity-badge"></div>
      <div class="activity-list">Loading…</div>
      <div class="activity-form">
        <select class="activity-channel">
          <option value="Email">Email</option>
          <option value="Phone">Phone</option>
          <option value="Meeting">Meeting</option>
          <option value="Other">Other</option>
        </select>
        <input type="date" class="activity-date" value="${today}">
        <textarea class="activity-summary" rows="2" placeholder="What was discussed / details"></textarea>
        <button class="btn btn-primary activity-log-btn"><i class="fas fa-phone"></i> Log Outreach</button>
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
      <button class="btn btn-sm activity-delete" data-id="${a.id}"><i class="fas fa-trash"></i> Delete</button>
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
    const summary = container.querySelector('.activity-summary').value.trim()
    const channel = container.querySelector('.activity-channel').value
    const contacted_on = container.querySelector('.activity-date').value
    if(!summary){ toast('A short summary is required.', 'error'); return }
    try{
      const res = await fetch(activityUrl(scopeType, scopeId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ summary, channel, contacted_on })
      })
      if(!res.ok){ toast('Could not log outreach.', 'error'); return }
      container.querySelector('.activity-summary').value = ''
      loadActivitySection(container, scopeType, scopeId)
      toast('Outreach logged')
    }catch(e){ toast('Could not log outreach.', 'error'); console.error(e) }
  })
}

// searchSeq guards against races between overlapping calls (e.g. a slower
// earlier fetch resolving after a faster, later one and overwriting it).
let searchSeq = 0
async function search(){
  const mySeq = ++searchSeq
  const out = el('results')
  out.innerHTML = '<div>Loading…</div>'
  if(state.view === 'organizations') fetchSectionStats(); else fetchStats()
  const params = new URLSearchParams({page: state.page, limit: state.limit})
  if(state.q) params.set('q', state.q)
  if(state.tags.length) params.set('tag', state.tags.join(','))
  if(state.counties.length) params.set('county', state.counties.join(','))
  if(state.view !== 'organizations' && state.followup) params.set('followup', state.followup)
  try{
    if(state.view === 'organizations'){
      const res = await fetch(API.sections + '?' + params.toString())
      const j = await res.json()
      if(mySeq !== searchSeq) return
      out.innerHTML = ''
      state.total = j.total || 0
      if(!j.organizations || j.organizations.length === 0){ out.innerHTML = '<div>No organizations found</div>'; renderPagination(state.total); return }
      j.organizations.forEach(item=>out.appendChild(renderOrgCard(item)))
      renderPagination(state.total)
    } else {
      const res = await fetch(API.contacts + '?' + params.toString())
      const j = await res.json()
      if(mySeq !== searchSeq) return
      out.innerHTML = ''
      state.total = j.total || 0
      if(!j.contacts || j.contacts.length===0){ out.innerHTML = '<div>No results</div>'; renderPagination(state.total); return }
      j.contacts.forEach(c=>out.appendChild(renderCard(c)))
      renderPagination(state.total)
    }
  }catch(e){ if(mySeq===searchSeq) out.innerHTML = '<div>Error loading results</div>'; console.error(e) }
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
        <div id="duplicateWarning" class="flag flag-warn" style="display:none;margin-top:10px;"></div>
        <div style="margin-top:10px">
          <button id="saveContactBtn" type="button" class="btn btn-primary"><i class="fas fa-check"></i> Save</button>
          <button id="addAnywayBtn" type="button" class="btn" style="display:none;">Add Anyway</button>
          <button id="closeModalBtn" type="button" class="btn">Close</button>
        </div>
      </form>
    `
    const modal = el('profileModal')
    if(modal){ modal.style.display = '' }
    el('closeModalBtn').addEventListener('click', closeModal)
    el('saveContactBtn').addEventListener('click', ()=> saveContact(false))
    el('addAnywayBtn').addEventListener('click', ()=> saveContact(true))
  }catch(e){console.error(e)}
}

async function saveContact(force){
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
  if(!id && force) payload.force_create = true
  try{
    let res
    if(id){
      res = await fetch('/api/contacts/'+id, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
    } else {
      res = await fetch('/api/contacts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
    }
    const j = await res.json()
    if(!res.ok){
      if(j.warning === 'possible_duplicate'){
        const warn = el('duplicateWarning')
        warn.textContent = j.message || 'A similar contact already exists.'
        warn.style.display = ''
        el('addAnywayBtn').style.display = ''
        return
      }
      const msg = j.error === 'email exists' ? 'That email is already used by another contact.' : (j.error || 'Save failed')
      toast(msg, 'error')
      return
    }
    closeModal()
    fetchTagOptions()
    state.page = 1
    search()
    if(j && j.id) showContactDetail(j.id)
    toast('Saved')
  }catch(e){toast('Save failed', 'error'); console.error(e)}
}

function closeModal(){ const m = el('profileModal'); if(m) m.style.display = 'none' }

// Switches between the People grid (Contact rows) and the Organizations
// grid (OutreachOrg rows, cross-referenced with Contacts). The category
// filter is reset on an actual view change since People/Organization
// categories are different namespaces -- carrying one over would silently
// filter against the wrong field.
function switchView(view, userInitiated){
  const changed = state.view !== view
  state.view = view
  if(changed){
    state.page = 1
    state.tags = []
  }
  const peopleBtn = el('viewPeopleBtn'); const orgBtn = el('viewOrgBtn')
  if(peopleBtn) peopleBtn.classList.toggle('active', view === 'people')
  if(orgBtn) orgBtn.classList.toggle('active', view === 'organizations')
  // Follow-up status is tracked per-Contact, not per-Organization, so the
  // filter doesn't apply (but isn't reset) when browsing Organizations.
  const followupFilter = el('followupFilter')
  if(followupFilter) followupFilter.disabled = (view === 'organizations')
  const si = el('searchInput')
  if(si) si.placeholder = view === 'people'
    ? 'Search by Name, Organization, Title, or Email...'
    : 'Search by Organization or Category...'
  if(userInitiated && changed){
    history.pushState({page: view === 'organizations' ? 'search_roles' : 'search'}, '', view === 'organizations' ? '#search_roles' : '#search')
  }
  fetchTagOptions()
  search()
}

function bind(){
  el('searchBtn').addEventListener('click', ()=>{ state.q = el('searchInput').value.trim(); state.page = 1; search() })
  el('searchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ state.q = el('searchInput').value.trim(); state.page = 1; search() } })

  const viewPeopleBtn = el('viewPeopleBtn')
  const viewOrgBtn = el('viewOrgBtn')
  if(viewPeopleBtn) viewPeopleBtn.addEventListener('click', ()=> switchView('people', true))
  if(viewOrgBtn) viewOrgBtn.addEventListener('click', ()=> switchView('organizations', true))

  const followupFilter = el('followupFilter')
  if(followupFilter) followupFilter.addEventListener('change', ()=>{
    state.followup = followupFilter.value
    state.page = 1
    search()
  })

  // keyboard shortcuts: Ctrl+K and '/' -- but not while typing in a field,
  // otherwise '/' could never be typed into notes, lists, etc.
  window.addEventListener('keydown', (e)=>{
    const typingInField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)
    if(e.ctrlKey && e.key.toLowerCase()==='k'){
      e.preventDefault(); el('searchInput').focus(); return
    }
    if(e.key === '/' && !typingInField){
      e.preventDefault(); el('searchInput').focus()
    }
  })
  el('prevPage').addEventListener('click', ()=>{ if(state.page>1){ state.page--; search() } })
  el('nextPage').addEventListener('click', ()=>{
    const maxPage = Math.max(1, Math.ceil((state.total||0)/state.limit))
    if(state.page < maxPage){ state.page++; search() }
  })
  el('closeModal').addEventListener('click', closeModal)
  const addBtn = el('addContactBtn')
  if(addBtn) addBtn.addEventListener('click', ()=>{ openProfile(null) })
  const backBtn = el('backHomeBtn')
  if(backBtn) backBtn.addEventListener('click', ()=>{ showHome(true) })
  bindExportMenu()
  bindDraftEmail()
  bindCreateFlyer()
  bindCountyFilter()
  bindTagFilter()
}

function currentExportParams(){
  const params = new URLSearchParams()
  if(state.q) params.set('q', state.q)
  if(state.tags.length){
    if(state.view === 'organizations') params.set('org_tag', state.tags.join(','))
    else params.set('tag', state.tags.join(','))
  }
  if(state.counties.length) params.set('county', state.counties.join(','))
  if(state.view !== 'organizations' && state.followup) params.set('followup', state.followup)
  return params
}

function bindExportMenu(){
  const btn = el('exportMenuBtn')
  const menu = el('exportMenu')
  if(!btn || !menu) return
  btn.addEventListener('click', (e)=>{
    e.stopPropagation()
    const opening = menu.style.display === 'none'
    closeOtherFilterMenus('exportMenu')
    menu.style.display = opening ? '' : 'none'
  })
  document.addEventListener('click', ()=>{ menu.style.display = 'none' })

  const copyBtn = el('exportCopyEmails')
  if(copyBtn) copyBtn.addEventListener('click', async ()=>{
    menu.style.display = 'none'
    try{
      const res = await fetch('/api/export/emails?' + currentExportParams().toString())
      const j = await res.json()
      if(!j.emails || j.emails.length === 0){ toast('No emails found for the current filter.', 'error'); return }
      await navigator.clipboard.writeText(j.joined)
      toast(`Copied ${j.count} email address${j.count===1?'':'es'} to clipboard`)
    }catch(e){ toast('Could not copy emails', 'error'); console.error(e) }
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
    if(state.tags.length){
      const noun = state.view === 'organizations' ? (state.tags.length===1?'organization category':'organization categories') : (state.tags.length===1?'tag':'tags')
      parts.push(`${noun} "${state.tags.join(', ')}"`)
    }
    if(state.counties.length) parts.push(`count${state.counties.length===1?'y':'ies'} "${state.counties.join(', ')}"`)
    if(state.q) parts.push(`search "${state.q}"`)
    if(state.view !== 'organizations' && state.followup){
      parts.push(state.followup === 'never' ? 'never contacted' : `no contact in ${state.followup}+ days`)
    }
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
        body: JSON.stringify({
          prompt,
          q: state.q,
          county: state.counties.join(','),
          tag: state.view === 'organizations' ? undefined : state.tags.join(','),
          org_tag: state.view === 'organizations' ? state.tags.join(',') : undefined,
          followup: state.view === 'organizations' ? undefined : (state.followup || undefined),
        })
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

function bindCreateFlyer(){
  const btn = el('createFlyerBtn')
  const modal = el('createFlyerModal')
  if(!btn || !modal) return

  btn.addEventListener('click', ()=>{
    el('createFlyerPrompt').value = ''
    el('createFlyerOutput').style.display = 'none'
    el('createFlyerOutput').src = ''
    el('createFlyerDownloadBtn').style.display = 'none'
    el('createFlyerStatus').textContent = ''
    modal.style.display = ''
    el('createFlyerPrompt').focus()
  })

  el('closeCreateFlyerModal').addEventListener('click', ()=>{ modal.style.display = 'none' })

  el('createFlyerGenerateBtn').addEventListener('click', async ()=>{
    const prompt = el('createFlyerPrompt').value.trim()
    if(!prompt){ el('createFlyerStatus').textContent = 'Describe what the post or flyer is about.'; return }
    const format = document.querySelector('input[name="flyerFormat"]:checked').value
    const genBtn = el('createFlyerGenerateBtn')
    genBtn.disabled = true
    el('createFlyerStatus').textContent = 'Generating… this can take up to a minute.'
    el('createFlyerOutput').style.display = 'none'
    el('createFlyerDownloadBtn').style.display = 'none'
    try{
      const res = await fetch('/api/generate-flyer', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ prompt, format })
      })
      const j = await res.json()
      if(!res.ok){ el('createFlyerStatus').textContent = j.error || 'Could not generate the image.'; return }
      el('createFlyerOutput').src = j.image
      el('createFlyerOutput').style.display = ''
      el('createFlyerDownloadBtn').href = j.image
      el('createFlyerDownloadBtn').style.display = ''
      el('createFlyerStatus').textContent = `Headline: "${j.headline}"`
    }catch(e){
      el('createFlyerStatus').textContent = 'Could not reach the server.'
      console.error(e)
    }finally{
      genBtn.disabled = false
    }
  })
}

window.addEventListener('load', async ()=>{
  bind();
  await fetchCounties();
  if(window.location.hash === '#search' || window.location.hash === '#search_roles'){
    const view = window.location.hash === '#search_roles' ? 'organizations' : 'people'
    showSearch(false, true, view)
  } else {
    showHome(false)
  }
})

function showHome(push=true){
  const hero = el('hero')
  const headerHidden = document.querySelectorAll('.header-hidden')
  const results = el('results')
  const pagination = document.querySelector('.pagination')
  const detail = el('contactDetail')
  if(hero) hero.style.display = ''
  headerHidden.forEach(n=> { n.classList.add('header-hidden'); n.style.display = 'none' })
  if(results) results.style.display = 'none'
  if(detail) detail.style.display = 'none'
  if(pagination) pagination.style.display = 'none'
  if(push) history.pushState({page:'home'}, '', '/')
}

// One unified search screen for both People and Organizations -- `view`
// just determines which dataset is fetched/rendered into the same grid.
function showSearch(push=true, focus=true, view='people'){
  const hero = el('hero')
  const headerHidden = document.querySelectorAll('.header-hidden')
  const results = el('results')
  const pagination = document.querySelector('.pagination')
  const detail = el('contactDetail')
  if(hero) hero.style.display = 'none'
  headerHidden.forEach(n=> { n.classList.remove('header-hidden'); n.style.display = '' })
  if(results) results.style.display = ''
  if(pagination) pagination.style.display = ''
  if(detail) detail.style.display = 'none'
  switchView(view, false)
  if(push) history.pushState({page: view === 'organizations' ? 'search_roles' : 'search'}, '', view === 'organizations' ? '#search_roles' : '#search')
  if(focus){ const si = el('searchInput'); if(si) si.focus() }
}

window.addEventListener('popstate', ()=>{
  const hash = window.location.hash
  if(hash === '#search_roles'){ showSearch(false,false,'organizations') }
  else if(hash === '#search'){ showSearch(false,false,'people') }
  else showHome(false)
})

// Support hash-based navigation fallback (used by inline hero buttons)
window.addEventListener('hashchange', ()=>{
  if(window.location.hash === '#search' || window.location.hash === '#search_roles'){
    const view = window.location.hash === '#search_roles' ? 'organizations' : 'people'
    showSearch(false,false,view)
  }
})

// Attach hero button handler immediately so it works without relying on DOMContentLoaded.
// People vs Organizations is now just the in-page toggle, not a separate entry point.
{
  const e = el('homeEnter'); if(e) e.addEventListener('click', ()=> { showSearch(true, true, 'people') })
}
