async function loadProfile(){
  try{
    const res = await fetch(`/api/contacts/${CONTACT_ID}`)
    if(!res.ok) throw new Error('Not found')
    const c = await res.json()
    document.getElementById('profileName').textContent = `${c.first_name||''} ${c.last_name||''}`
    document.getElementById('p-name').textContent = `${c.first_name||''} ${c.last_name||''}`
    document.getElementById('p-title').textContent = c.title || ''
    document.getElementById('p-org').textContent = c.organization || ''
    document.getElementById('p-phone-office').textContent = c.phone_office || ''
    document.getElementById('p-phone-cell').textContent = c.phone_cell || ''
    document.getElementById('p-email').textContent = c.email || ''
    document.getElementById('p-county').textContent = c.county || ''
    document.getElementById('p-added').textContent = c.added ? new Date(c.added).toLocaleString() : ''
    document.getElementById('p-category').textContent = c.tag || ''
    document.getElementById('p-notes').textContent = c.notes || ''
    const tagsEl = document.getElementById('p-tags')
    tagsEl.innerHTML = (c.lists||[]).map(t=>`<span class="pill">${t}</span>`).join('')
  }catch(e){console.error(e);document.getElementById('profileName').textContent='Not found'}
}

function toggleFavorite(){
  const key = `fav_${CONTACT_ID}`
  const cur = localStorage.getItem(key) === '1'
  localStorage.setItem(key, cur? '0' : '1')
  updateFavUI()
}

function updateFavUI(){
  const key = `fav_${CONTACT_ID}`
  const cur = localStorage.getItem(key) === '1'
  const btn = document.getElementById('favToggle')
  btn.textContent = cur ? '★ Favorited' : '☆ Favorite'
}

window.addEventListener('load', ()=>{ loadProfile(); updateFavUI(); document.getElementById('favToggle').addEventListener('click', toggleFavorite) })
