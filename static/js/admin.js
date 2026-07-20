function $(id){return document.getElementById(id)}

function setProgress(p, label){
  const bar = $('progressBar')
  if(bar){
    bar.style.width = `${p}%`
    bar.setAttribute('aria-valuenow', p)
    const wrap = bar.closest('.progress-wrap')
    if(wrap) wrap.style.display = 'block'
    const lbl = wrap && wrap.querySelector('.progress-label')
    if(lbl) lbl.textContent = label || ''
  }
}

function summaryPhrase(label, result){
  if(!result) return ''
  const parts = []
  if(result.inserted) parts.push(`${result.inserted} new ${label}${result.inserted===1?'':'s'}`)
  if(result.updated) parts.push(`${result.updated} ${label}${result.updated===1?'':'s'} updated`)
  if(!parts.length) return `No ${label} changes`
  return parts.join(', ')
}

function showSummary(obj){
  const s = $('importSummary')
  if(s) s.style.display = ''
  const lines = [summaryPhrase('contact', obj.contacts), summaryPhrase('organization', obj.organizations)]
    .filter(Boolean)
  const archived = obj.contacts && obj.contacts.archived ? ` · ${obj.contacts.archived} marked Inactive` : ''
  s.innerHTML = `<p><i class="fas fa-circle-check"></i> Synced from spreadsheet - ${lines.join(' · ')}${archived}</p>`
  fetch('/api/categories').then(r=>r.json()).then(cat=>{
    const list = cat.map(c=>`<div>${c.tag||'<none>'}: ${c.count}</div>`).join('')
    s.innerHTML += `<h4>Category breakdown</h4>${list}`
  })
}

function pollTaskStatus(task_id){
  return new Promise((resolve, reject)=>{
    const interval = setInterval(()=>{
      fetch(`/api/upload/status/${task_id}`)
        .then(r=>r.json())
        .then(task=>{
          if(task.status === 'running'){
            setProgress(task.progress, `Processing… ${task.progress}%`)
          } else if(task.status === 'done'){
            clearInterval(interval)
            setProgress(100, 'Complete!')
            resolve(task.result)
          } else if(task.status === 'error'){
            clearInterval(interval)
            reject(task.error || 'Import failed')
          }
        })
        .catch(err=>{ clearInterval(interval); reject(err) })
    }, 800)
  })
}

function doUpload(file, archiveMissing){
  return new Promise((resolve, reject)=>{
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', file)
    if(archiveMissing) fd.append('archive_missing', '1')
    xhr.open('POST', '/api/upload')
    xhr.upload.addEventListener('progress', (e)=>{
      if(e.lengthComputable){
        const p = Math.round((e.loaded / e.total) * 15)
        setProgress(p, `Uploading… ${p}%`)
      }
    })
    xhr.onreadystatechange = ()=>{
      if(xhr.readyState === 4){
        if(xhr.status >= 200 && xhr.status < 300){
          const resp = JSON.parse(xhr.responseText)
          if(resp.task_id){
            setProgress(15, 'Processing…')
            pollTaskStatus(resp.task_id).then(resolve).catch(reject)
          } else {
            resolve(resp)
          }
        } else {
          reject(xhr.responseText)
        }
      }
    }
    xhr.send(fd)
  })
}

// ── Preview modal ─────────────────────────────────────────────────────── //

let _pendingFile = null
let _pendingArchive = false

function showPreviewModal(data, file, archiveMissing){
  _pendingFile = file
  _pendingArchive = archiveMissing

  const newList = (data.new || []).slice(0, 10).map(c =>
    `<li>${c.name}${c.organization ? ` · ${c.organization}` : ''}${c.tag ? ` <em>${c.tag}</em>` : ''}</li>`
  ).join('')
  const updList = (data.updated || []).slice(0, 10).map(c => {
    const fields = Object.keys(c.changes).join(', ')
    return `<li>${c.name} — <span style="color:#888">${fields}</span></li>`
  }).join('')
  const moreNew = data.new_count > 10 ? `<li style="color:#888">…and ${data.new_count - 10} more</li>` : ''
  const moreUpd = data.updated_count > 10 ? `<li style="color:#888">…and ${data.updated_count - 10} more</li>` : ''

  $('previewNewCount').textContent = data.new_count
  $('previewUpdCount').textContent = data.updated_count
  $('previewNewList').innerHTML = newList + moreNew || '<li style="color:#888">None</li>'
  $('previewUpdList').innerHTML = updList + moreUpd || '<li style="color:#888">None</li>'
  $('previewModal').style.display = 'flex'
}

function closePreview(){
  $('previewModal').style.display = 'none'
  _pendingFile = null
}

function confirmImport(){
  $('previewModal').style.display = 'none'
  doUpload(_pendingFile, _pendingArchive).then(showSummary).catch(handleUploadError)
}

function handleUploadError(err) {
  let msg = 'Upload failed'
  try { const j = JSON.parse(err); msg = j.error || j.details || err } catch(e) { msg = err || 'Upload failed' }
  alert('Upload error: ' + msg)
}

async function previewThenUpload(file){
  const archiveCb = $('archiveMissing')
  const archiveMissing = archiveCb && archiveCb.checked
  const fd = new FormData()
  fd.append('file', file)
  setProgress(5, 'Analyzing file…')
  const wrap = $('progressBar')?.closest('.progress-wrap')
  if(wrap) wrap.style.display = 'block'
  try {
    const r = await fetch('/api/upload/preview', { method: 'POST', body: fd })
    const data = await r.json()
    if(data.error){ handleUploadError(data.error); return }
    const wrap2 = $('progressBar')?.closest('.progress-wrap')
    if(wrap2) wrap2.style.display = 'none'
    showPreviewModal(data, file, archiveMissing)
  } catch(e){
    handleUploadError(String(e))
  }
}

window.addEventListener('load', ()=>{
  const drop = $('dropZone')
  const fileInput = $('adminFile')
  const pick = $('pickFile')
  const exportBtn = $('exportBtn')

  if(pick) pick.addEventListener('click', ()=>fileInput.click())
  if(fileInput) fileInput.addEventListener('change', (e)=>{ const f = e.target.files[0]; if(f) previewThenUpload(f) })

  if(drop){
    drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.style.background = '#fff6' })
    drop.addEventListener('dragleave', ()=>{ drop.style.background = '' })
    drop.addEventListener('drop', (e)=>{ e.preventDefault(); drop.style.background=''; const f = e.dataTransfer.files[0]; if(f) previewThenUpload(f) })
  }

  if(exportBtn) exportBtn.addEventListener('click', ()=>{ window.location.href = '/api/export' })
})
