export async function loadProjectMemory(repoFullName) {
  const key='memory:'+repoFullName
  const data=await chrome.storage.local.get(key)
  return data[key]||{ notes:[], lastSummary:'' }
}

export async function saveProjectMemory(repoFullName, memory) {
  const key='memory:'+repoFullName
  await chrome.storage.local.set({[key]:memory})
}

export async function rememberRun(repoFullName, prompt, summary) {
  const memory=await loadProjectMemory(repoFullName)
  memory.notes=(memory.notes||[]).slice(-19)
  memory.notes.push({at:Date.now(),prompt:String(prompt).slice(0,1000),summary:String(summary||'').slice(0,2000)})
  memory.lastSummary=summary||''
  await saveProjectMemory(repoFullName,memory)
  return memory
}
