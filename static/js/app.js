const API = {
  contacts: '/api/contacts',
  stats: '/api/stats',
  tags: '/api/tags',
  categories: '/api/categories',
  sectionCategories: '/api/section-categories',
  counties: '/api/counties',
}

let state = { page: 1, limit: 25, q: '', tag: '', total: 0 }

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
    const sel = el('countyFilter')
    if(!sel) return
    sel.innerHTML = '<option value="">All Counties</option>' + rows.map(r=>`<option value="${r.county}">${r.county||'Unknown'} (${r.count||0})</option>`).join('')
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
        </div>
      </div>
    `
    panel.style.display = ''
    const edit = el('detailEditBtn'); if(edit) edit.addEventListener('click', ()=> openProfile(c.id))
  }catch(e){ console.error(e) }
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

async function openProfile(id){
  try{
    let c = {id:null, first_name:'', last_name:'', organization:'', title:'', email:'', phone_office:'', phone_cell:'', county:'', lists:[], notes:'', tag:''}
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
  el('searchBtn').addEventListener('click', ()=>{ state.q = el('searchInput').value.trim(); state.tag = el('tagFilter').value; state.page = 1; search() })
  el('searchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ state.q = el('searchInput').value.trim(); state.page = 1; search() } })
  // Roles search
  el('roleSearchBtn').addEventListener('click', ()=>{ const q = el('roleSearchInput').value.trim(); searchRoles(q) })
  el('roleSearchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ const q = el('roleSearchInput').value.trim(); searchRoles(q) } })
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
}
// Roles: show tag list and allow viewing a paginated list per tag
const tagPageState = {}
async function searchRoles(q=''){
  const out = el('rolesResults')
  out.innerHTML = '<div>Loading sections…</div>'
  fetchSectionStats()
  try{
    // If q provided, perform a text search across sections and render flattened results
    if(q){
      const params = new URLSearchParams({q, limit:50, page:1})
      const roleTag = el('roleTagFilter') ? el('roleTagFilter').value : ''
      const county = el('countyFilter') ? el('countyFilter').value : ''
      if(roleTag) params.set('tag', roleTag)
      if(county) params.set('county', county)
      const res = await fetch('/api/sections?'+params.toString())
      const json = await res.json()
      renderSectionsSearchResults(json, out)
      return
    }

    // Otherwise show a tag list with counts and a 'View' button for each tag
    const res = await fetch('/api/section-categories')
    const tags = await res.json()
    out.innerHTML = ''
    const list = document.createElement('div')
    list.className = 'tag-list'
    tags.sort((a,b)=> (b.count||0)-(a.count||0)).forEach(t=>{
      const row = document.createElement('div')
      row.className = 'tag-row'
      row.innerHTML = `<div class="tag-name">${t.tag||'Other'}</div><div class="tag-count">${t.count||0}</div><div class="tag-actions"><button class="btn view-tag">View</button></div>`
      row.querySelector('.view-tag').addEventListener('click', ()=>{ loadTagPage(t.tag,1) })
      list.appendChild(row)
    })
    out.appendChild(list)
  }catch(e){ out.innerHTML = '<div>Error loading sections</div>'; console.error(e) }
}

function renderSectionsSearchResults(json, out){
  out.innerHTML = ''
  const sections = json.sections || {}
  const meta = json.meta || {}
  const keys = Object.keys(sections)
  if(keys.length === 0){ out.innerHTML = '<div>No sections found</div>'; return }
  keys.forEach(tag=>{
    const header = document.createElement('h3')
    header.textContent = tag
    out.appendChild(header)
    const table = document.createElement('table')
    table.className = 'sections-table'
    table.innerHTML = '<thead><tr><th>Organization</th><th>Contacts</th><th>Primary</th><th>Updated</th><th>Notes</th></tr></thead>'
    const tbody = document.createElement('tbody')
    (sections[tag]||[]).forEach(item=>{
      const tr = document.createElement('tr')
      const p = item.primary_contact || {}
      const primaryHtml = p.name ? `<div class="pc-name">${p.name}</div><div class="pc-meta">${p.title||''}${p.email? ' • '+p.email : ''}${p.phone_cell? ' • '+p.phone_cell : ''}</div>` : ''
      tr.innerHTML = `<td class="org">${item.organization||''}</td><td class="count">${item.contact_count||0}</td><td class="primary">${primaryHtml}</td><td class="updated">${item.latest_updated? new Date(item.latest_updated).toLocaleDateString() : ''}</td><td class="notes">${(item.notes||'').replace(/\|\|/g,', ')}</td>`
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    out.appendChild(table)
  })
}

async function loadTagPage(tag, page=1, limit=50){
  const out = el('rolesResults')
  out.innerHTML = '<div>Loading '+tag+' …</div>'
  try{
    const params = new URLSearchParams({tag, page, limit})
    const county = el('countyFilter') ? el('countyFilter').value : ''
    if(county) params.set('county', county)
    const res = await fetch('/api/sections?'+params.toString())
    const json = await res.json()
    const sections = json.sections || {}
    const meta = json.meta || {}
    // sections should contain only the requested tag
    const items = sections[tag] || []
    out.innerHTML = ''
    const headerRow = document.createElement('div')
    headerRow.className = 'tag-header-row'
    headerRow.innerHTML = `<h3>${tag}</h3><div class="tag-meta">Showing page ${meta.page||page} — ${meta.total||items.length} items</div>`
    out.appendChild(headerRow)
    const table = document.createElement('table')
    table.className = 'sections-table'
    table.innerHTML = '<thead><tr><th>Organization</th><th>Contacts</th><th>Primary</th><th>Updated</th><th>Notes</th></tr></thead>'
    const tbody = document.createElement('tbody')
    items.forEach(item=>{
      const tr = document.createElement('tr')
      const p = item.primary_contact || {}
      const primaryHtml = p.name ? `<div class="pc-name">${p.name}</div><div class="pc-meta">${p.title||''}${p.email? ' • '+p.email : ''}${p.phone_cell? ' • '+p.phone_cell : ''}</div>` : ''
      tr.innerHTML = `<td class="org">${item.organization||''}</td><td class="count">${item.contact_count||0}</td><td class="primary">${primaryHtml}</td><td class="updated">${item.latest_updated? new Date(item.latest_updated).toLocaleDateString() : ''}</td><td class="notes">${(item.notes||'').replace(/\|\|/g,', ')}</td>`
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    out.appendChild(table)

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

    // export button
    const exp = document.createElement('a')
    exp.className = 'btn'
    const countyParam = el('countyFilter') ? encodeURIComponent(el('countyFilter').value) : ''
    let href = '/api/export?tag=' + encodeURIComponent(tag)
    if(countyParam) href += '&county=' + countyParam
    exp.href = href
    exp.textContent = 'Export CSV'
    exp.setAttribute('download','contacts_export.csv')
    exp.style.marginLeft = '8px'
    pager.appendChild(exp)
    out.appendChild(pager)
  }catch(e){ out.innerHTML = '<div>Error loading tag</div>'; console.error(e) }
}

window.addEventListener('load', async ()=>{
  bind();
  await fetchTags();
  await fetchCategories();
  await fetchCounties();
  await fetchStats();
  // navigation: show home or search based on history state
  if(window.location.hash === '#search' || window.location.hash === '#search_roles'){
    showSearch(false)
    if(window.location.hash === '#search_roles') searchRoles('')
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

function showSearch(push=true, focus=true){
  const hero = el('hero')
  const headerHidden = document.querySelectorAll('.header-hidden')
  const roles = el('rolesSection')
  const results = el('results')
  const pagination = document.querySelector('.pagination')
  const detail = el('contactDetail')
  if(hero) hero.style.display = 'none'
  headerHidden.forEach(n=> { n.classList.remove('header-hidden'); n.style.display = '' })
  if(roles) roles.style.display = ''
  if(results) results.style.display = ''
  if(detail) detail.style.display = 'none'
  if(pagination) pagination.style.display = ''
  if(push) history.pushState({page:'search'}, '', '#search')
  if(focus){ const si = el('searchInput'); if(si) si.focus(); state.page = 1; search(); }
}

window.addEventListener('popstate', (e)=>{
  const s = e.state || {}
  if(s.page === 'search' || window.location.hash === '#search') showSearch(false,false)
  else showHome(false)
})

// Support hash-based navigation fallback (used by inline hero buttons)
window.addEventListener('hashchange', ()=>{
  if(window.location.hash === '#search' || window.location.hash === '#search_roles'){
    showSearch(false,false)
    if(window.location.hash === '#search_roles'){
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
  const c = el('homeContacts'); if(c) c.addEventListener('click', ()=> { showSearch(true); fetchStats(); })
  const r = el('homeRoles'); if(r) r.addEventListener('click', ()=> { showSearch(true); const rs = el('roleSearchInput'); if(rs) rs.focus(); searchRoles(''); })
}
