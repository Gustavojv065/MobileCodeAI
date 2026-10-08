const KEY='altiv:jobs'

export async function listJobs() {
  const data=await chrome.storage.local.get(KEY)
  return data[KEY]||[]
}

export async function addJob(job) {
  const jobs=await listJobs()
  const value={
    id:crypto.randomUUID(),
    createdAt:Date.now(),
    status:'queued',
    ...job
  }
  await chrome.storage.local.set({[KEY]:[value,...jobs].slice(0,100)})
  return value
}

export async function updateJob(id, patch) {
  const jobs=await listJobs()
  const next=jobs.map(j=>j.id===id?{...j,...patch,updatedAt:Date.now()}:j)
  await chrome.storage.local.set({[KEY]:next})
  return next.find(j=>j.id===id)
}

export async function clearJobs() {
  await chrome.storage.local.set({[KEY]:[]})
}
