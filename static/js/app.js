const API = {
  contacts: '/api/contacts',
  sections: '/api/sections',
  stats: '/api/stats',
  tags: '/api/tags',
  sectionCategories: '/api/section-categories',
  counties: '/api/counties',
}

let state = { page: 1, limit: 25, q: '', tags: [], counties: [], followup: '', favoritesOnly: false, total: 0, view: 'people', selectedKey: null }

// Clicking a card a second time hides the detail panel instead of leaving
// it open forever -- this is also what drives the "selected card" highlight
// (Gmail-style) since both need to track which card is currently open.
function selectCard(key, cardEl, openFn){
  const panel = el('contactDetail')
  if(state.selectedKey === key){
    state.selectedKey = null
    if(panel) panel.style.display = 'none'
    document.querySelectorAll('.card.selected').forEach(c=>c.classList.remove('selected'))
    return
  }
  state.selectedKey = key
  document.querySelectorAll('.card.selected').forEach(c=>c.classList.remove('selected'))
  if(cardEl) cardEl.classList.add('selected')
  openFn()
}

function el(id){return document.getElementById(id)}
function initials(first, last, fallback){
  const text = (first||'').charAt(0) + (last||'').charAt(0)
  return text || (fallback || '—')
}

// Deterministic, varied colors for tag/list pills -- same label always
// gets the same color, so they stay easy to visually scan/group by, and
// it spreads the page's color use out instead of everything being a
// shade of brand red.
const TAG_PALETTE = [
  {bg:'#E3EDF7', text:'#1F4E79'},
  {bg:'#E0F2F1', text:'#00695C'},
  {bg:'#F1E9F9', text:'#6A3D9A'},
  {bg:'#FDF1DC', text:'#8A5A00'},
  {bg:'#E6F4EA', text:'#1E7B34'},
  {bg:'#E8EAED', text:'#3D4041'},
  {bg:'#FBE7E7', text:'#9B3B3C'},
  {bg:'#E8EAF6', text:'#303F9F'},
]
function tagColor(label){
  const s = String(label||'')
  let hash = 0
  for(let i=0;i<s.length;i++){ hash = (hash * 31 + s.charCodeAt(i)) >>> 0 }
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}
function pillHtml(label, extraClass){
  const c = tagColor(label)
  return `<span class="pill${extraClass? ' '+extraClass : ''}" style="background:${c.bg};color:${c.text}">${label}</span>`
}

// "3d ago" / "Today" -- compact, for card-level outreach indicators where
// a full date+name (like the detail panel's badge) would be too much text.
function relativeDays(dateStr){
  if(!dateStr) return null
  const then = new Date(dateStr + 'T00:00:00')
  const days = Math.round((new Date().setHours(0,0,0,0) - then.getTime()) / 86400000)
  if(days <= 0) return 'Today'
  if(days === 1) return '1 day ago'
  return `${days} days ago`
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

// The Export and AI Tools dropdowns are independent toggle buttons, but
// each one's own click handler calls stopPropagation() (so opening it
// doesn't immediately trigger its own "click outside closes it" listener) --
// which also stops that click from reaching the *other* dropdown's
// outside-click listener, so it'd never close. Closing the other menu
// before opening one keeps only one open at a time. (Tags/Counties live
// permanently in the sidebar in this layout, not as popovers.)
function closeOtherFilterMenus(exceptId){
  ;['exportMenu', 'toolsMenu'].forEach(id => {
    if(id === exceptId) return
    const m = el(id)
    if(m) m.style.display = 'none'
  })
}

function updateTagFilterLabel(){
  const label = el('tagFilterLabel')
  if(!label) return
  label.textContent = state.tags.length ? `(${state.tags.length} selected)` : ''
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
  label.textContent = state.counties.length ? `(${state.counties.length} selected)` : ''
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
    if(el('statTotalLabel')) el('statTotalLabel').textContent = 'Total Contacts'
    if(el('statIncompleteLabel')) el('statIncompleteLabel').textContent = 'Need Review'
    el('statTotal').textContent = (json.total ?? 0).toLocaleString()
    if(el('statIncomplete')) el('statIncomplete').textContent = (json.incomplete ?? 0).toLocaleString()
    if(el('statOrgsCard')) el('statOrgsCard').style.display = ''
    if(el('statCompleteCard')) el('statCompleteCard').style.display = ''
    if(el('statOrgs')) el('statOrgs').textContent = (json.organizations ?? 0).toLocaleString()
    if(el('statComplete')) el('statComplete').textContent = (json.complete_pct ?? 0) + '%'
  }catch(e){console.warn(e)}
}

async function fetchSectionStats(){
  try{
    const res = await fetch('/api/section-stats')
    const json = await res.json()
    if(el('statTotalLabel')) el('statTotalLabel').textContent = 'Total Organizations'
    if(el('statIncompleteLabel')) el('statIncompleteLabel').textContent = 'No Contact on File'
    el('statTotal').textContent = (json.total ?? 0).toLocaleString()
    if(el('statIncomplete')) el('statIncomplete').textContent = (json.no_contact ?? 0).toLocaleString()
    if(el('statOrgsCard')) el('statOrgsCard').style.display = 'none'
    if(el('statCompleteCard')) el('statCompleteCard').style.display = 'none'
  }catch(e){console.warn(e)}
}

function renderCard(c){
  const div = document.createElement('div')
  const key = 'contact:'+c.id
  div.className = 'card' + (state.selectedKey === key ? ' selected' : '')
  div.tabIndex = 0

  const recencyBits = []
  const lastContacted = relativeDays(c.last_contacted_on)
  const lastEmailed = relativeDays(c.last_emailed_on)
  if(lastContacted) recencyBits.push(`<i class="fas fa-comment-dots"></i> Last contact: ${lastContacted}`)
  if(lastEmailed) recencyBits.push(`<i class="fas fa-envelope"></i> Last email: ${lastEmailed}`)
  const recencyHtml = recencyBits.length ? `<div class="card-recency">${recencyBits.join(' &nbsp;•&nbsp; ')}</div>` : ''

  div.innerHTML = `
    <div class="card-top">
      <div class="avatar md">${initials(c.first_name, c.last_name)}</div>
      <div style="flex:1;min-width:0">
        <h3>${c.first_name||''} ${c.last_name||''}</h3>
        <div class="meta">${c.organization||''} — ${c.title||''}</div>
      </div>
      <button class="favorite-btn${c.is_favorite? ' is-favorite':''}" title="${c.is_favorite? 'Unstar' : 'Star this contact'}" aria-pressed="${c.is_favorite? 'true':'false'}">
        <i class="${c.is_favorite? 'fas':'far'} fa-star"></i>
      </button>
    </div>
    <div class="pills">${(c.lists||[]).slice(0,3).map(p=>pillHtml(p)).join('')}</div>
    ${c.tag ? `<div class="category">${pillHtml(c.tag)}</div>` : ''}
    ${recencyHtml}
    <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">
      <button class="btn btn-sm view-btn"><i class="fas fa-eye"></i> View</button>
      <button class="btn btn-sm edit-btn"><i class="fas fa-pen"></i> Edit</button>
    </div>
  `
  div.addEventListener('click', (ev)=>{
    if(ev.target && ev.target.closest('.edit-btn, .favorite-btn')) return
    selectCard(key, div, ()=> showContactDetail(c))
  })
  const editBtn = div.querySelector('.edit-btn')
  if(editBtn) editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openProfile(c.id) })
  const favoriteBtn = div.querySelector('.favorite-btn')
  if(favoriteBtn) favoriteBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFavorite(c, favoriteBtn) })
  return div
}

async function toggleFavorite(c, btnEl){
  const next = !c.is_favorite
  try{
    const res = await fetch(`/api/contacts/${c.id}/favorite`, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({is_favorite: next})
    })
    if(!res.ok){ toast('Could not update favorite.', 'error'); return }
    c.is_favorite = next
    btnEl.classList.toggle('is-favorite', next)
    btnEl.querySelector('i').className = next ? 'fas fa-star' : 'far fa-star'
    btnEl.title = next ? 'Unstar' : 'Star this contact'
    btnEl.setAttribute('aria-pressed', next ? 'true' : 'false')
    const card = btnEl.closest('.card')
    if(state.favoritesOnly && !next && card) card.remove()
  }catch(e){ toast('Could not reach the server.', 'error'); console.error(e) }
}

async function deleteContact(c){
  const name = `${c.first_name||''} ${c.last_name||''}`.trim() || c.email || 'this contact'
  if(!confirm(`Delete ${name}? This also removes their logged outreach history and cannot be undone.`)) return
  try{
    const res = await fetch(`/api/contacts/${c.id}`, { method: 'DELETE' })
    if(!res.ok){ toast('Could not delete this contact.', 'error'); return }
    state.selectedKey = null
    const panel = el('contactDetail')
    if(panel) panel.style.display = 'none'
    toast('Contact deleted')
    search()
    fetchStats()
  }catch(e){ toast('Could not reach the server.', 'error'); console.error(e) }
}

// Organizations view card -- lists every contact at the organization (not
// just one "primary" contact), since coworkers sharing an organization
// should show up together.
function renderOrgCard(item){
  const div = document.createElement('div')
  const key = 'org:'+item.organization
  div.className = 'card' + (state.selectedKey === key ? ' selected' : '')
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
    if(row){ ev.stopPropagation(); selectCard('contact:'+row.dataset.id, null, ()=> showContactDetail(parseInt(row.dataset.id,10))); return }
    if(ev.target && ev.target.closest('.add-btn')) return
    selectCard(key, div, ()=> showOrgDetail(item))
  })
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
          <h2>${(c.first_name||'') + ' ' + (c.last_name||'')} <button id="detailFavoriteBtn" class="favorite-btn${c.is_favorite? ' is-favorite':''}" title="${c.is_favorite? 'Unstar' : 'Star this contact'}" aria-pressed="${c.is_favorite? 'true':'false'}"><i class="${c.is_favorite? 'fas':'far'} fa-star"></i></button></h2>
          <div class="detail-sub">${c.title||''} ${c.organization? ' • '+c.organization : ''}</div>
          <div class="detail-row"><strong>Email:</strong> ${c.email? `<a href="mailto:${c.email}">${c.email}</a>` : '<span class="muted">No email</span>'}</div>
          <div class="detail-row"><strong>Phone:</strong> ${c.phone_office? `<a href="tel:${c.phone_office}">${c.phone_office}</a>` : (c.phone_cell? `<a href="tel:${c.phone_cell}">${c.phone_cell}</a>` : '<span class="muted">No phone</span>')}</div>
          <div class="detail-row"><strong>County:</strong> ${c.county || '<span class="muted">Unknown</span>'}</div>
          <div class="detail-row"><strong>Tags:</strong> ${(c.lists||[]).map(x=>pillHtml(x,'small')).join(' ') } ${c.tag? pillHtml(c.tag,'small'): ''}</div>
          <div class="detail-notes">${hasNotes? `<h4>Notes</h4><div class="notes">${(c.notes||'').replace(/\n/g,'<br>')}</div>` : ''}</div>
          <div class="detail-flags" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            ${incomplete? '<span class="flag flag-warn">Incomplete</span>' : '<span class="flag flag-ok">Complete</span>'}
            ${hasNotes? '<span class="flag flag-info">Has notes</span>' : ''}
            <button id="detailEditBtn" class="btn"><i class="fas fa-pen"></i> Edit</button>
            <a id="detailExport" class="btn" href="/api/export?id=${encodeURIComponent(c.id||'')}"><i class="fas fa-download"></i> Export</a>
            ${window.IS_ADMIN ? '<button id="detailDeleteBtn" class="btn" style="color:#9b1c1c;"><i class="fas fa-trash"></i> Delete</button>' : ''}
          </div>
          ${activitySectionHtml()}
        </div>
      </div>
    `
    panel.style.display = ''
    const edit = el('detailEditBtn'); if(edit) edit.addEventListener('click', ()=> openProfile(c.id))
    const favBtn = el('detailFavoriteBtn'); if(favBtn) favBtn.addEventListener('click', ()=> toggleFavorite(c, favBtn))
    const deleteBtn = el('detailDeleteBtn'); if(deleteBtn) deleteBtn.addEventListener('click', ()=> deleteContact(c))
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
  if(state.view !== 'organizations' && state.favoritesOnly) params.set('favorites_only', '1')
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
  document.querySelectorAll('input[name=followupRadio]').forEach(r => { r.disabled = (view === 'organizations') })
  const favoritesOnlyCheckbox = el('favoritesOnlyCheckbox')
  if(favoritesOnlyCheckbox) favoritesOnlyCheckbox.disabled = (view === 'organizations')
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

  document.querySelectorAll('input[name=followupRadio]').forEach(r => {
    r.addEventListener('change', ()=>{ if(r.checked) state.followup = r.value })
  })

  const favoritesOnlyCheckbox = el('favoritesOnlyCheckbox')
  if(favoritesOnlyCheckbox) favoritesOnlyCheckbox.addEventListener('change', ()=>{
    state.favoritesOnly = favoritesOnlyCheckbox.checked
  })

  const applyFiltersBtn = el('applyFiltersBtn')
  if(applyFiltersBtn) applyFiltersBtn.addEventListener('click', ()=>{ state.page = 1; search() })

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
  bindToolsMenu()
  bindDraftEmail()
  bindCreateFlyer()
  bindCountyFilter()
  bindTagFilter()
  bindAdminMenu()
}

// The Admin nav dropdown is a native <details>/<summary> (no JS needed to
// toggle it open/closed), but it doesn't close itself on an outside click
// the way the other header menus do -- this adds just that.
function bindAdminMenu(){
  const menu = document.querySelector('.admin-menu')
  if(!menu) return
  document.addEventListener('click', (e)=>{
    if(!menu.contains(e.target)) menu.removeAttribute('open')
  })
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
  if(state.view !== 'organizations' && state.favoritesOnly) params.set('favorites_only', '1')
  return params
}

// Draft Email and Create Flyer/Post are both AI-generation tools, distinct
// from filtering/exporting -- grouped under one toggle to cut down on
// separate buttons in the toolbar. The buttons keep their own ids/click
// handlers (bindDraftEmail/bindCreateFlyer elsewhere), this just opens
// and closes the menu they live in.
function bindToolsMenu(){
  const btn = el('toolsMenuBtn')
  const menu = el('toolsMenu')
  if(!btn || !menu) return
  btn.addEventListener('click', (e)=>{
    e.stopPropagation()
    const opening = menu.style.display === 'none'
    closeOtherFilterMenus('toolsMenu')
    menu.style.display = opening ? '' : 'none'
  })
  menu.addEventListener('click', (e)=>{
    if(e.target.closest('.export-menu-item')) menu.style.display = 'none'
  })
  document.addEventListener('click', ()=>{ menu.style.display = 'none' })
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
    if(state.view !== 'organizations' && state.favoritesOnly) parts.push('favorites only')
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
          favorites_only: state.view === 'organizations' ? undefined : (state.favoritesOnly || undefined),
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
