function $(id){return document.getElementById(id)}

function setProgress(p){
  const bar = $('progressBar')
  if(bar){
    bar.style.width = `${p}%`
    const wrap = bar.closest('.progress-wrap')
    if(wrap) wrap.style.display = 'block'
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
  s.innerHTML = `<p><i class="fas fa-circle-check"></i> Synced from spreadsheet - ${lines.join(' · ')}</p>`
  // fetch categories breakdown
  fetch('/api/categories').then(r=>r.json()).then(cat=>{
    const list = cat.map(c=>`<div>${c.tag||'<none>'}: ${c.count}</div>`).join('')
    s.innerHTML += `<h4>Category breakdown</h4>${list}`
  })
}

function uploadWithProgress(file){
  return new Promise((resolve,reject)=>{
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', file)
    xhr.open('POST','/api/upload')
    xhr.upload.addEventListener('progress', (e)=>{
      if(e.lengthComputable){
        const p = Math.round((e.loaded / e.total) * 100)
        setProgress(p)
      }
    })
    xhr.onreadystatechange = ()=>{
      if(xhr.readyState===4){
        if(xhr.status>=200 && xhr.status<300){
          resolve(JSON.parse(xhr.responseText))
        }else{
          reject(xhr.responseText)
        }
      }
    }
    xhr.send(fd)
  })
}

window.addEventListener('load', ()=>{
  const drop = $('dropZone')
  const fileInput = $('adminFile')
  const pick = $('pickFile')
  const exportBtn = $('exportBtn')

  pick.addEventListener('click', ()=>fileInput.click())
  fileInput.addEventListener('change', (e)=>{ const f = e.target.files[0]; if(f) uploadWithProgress(f).then(showSummary).catch(err=>alert('Upload failed')) })

  drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.style.background = '#fff6' })
  drop.addEventListener('dragleave', (e)=>{ drop.style.background = '' })
  drop.addEventListener('drop', (e)=>{ e.preventDefault(); drop.style.background=''; const f = e.dataTransfer.files[0]; if(f) uploadWithProgress(f).then(showSummary).catch(err=>alert('Upload failed')) })

  exportBtn.addEventListener('click', ()=>{ window.location.href = '/api/export' })
})
