export const DEPLOY_PRESETS = [
  { id:'vercel', label:'Vercel Deploy Hook' },
  { id:'netlify', label:'Netlify Build Hook' },
  { id:'render', label:'Render Deploy Hook' },
  { id:'railway', label:'Railway Webhook' },
  { id:'custom', label:'Webhook personalizado' }
]

export async function triggerDeploy(target) {
  if (!target?.enabled || !target?.url) return { skipped:true }
  const response = await fetch(target.url, {
    method: target.method || 'POST',
    headers: target.headers || {}
  })
  if (!response.ok) throw new Error(target.label + ': HTTP ' + response.status)
  return { ok:true, status:response.status }
}

export async function triggerAll(targets = []) {
  const results = []
  for (const target of targets.filter(x => x.enabled && x.url)) {
    try {
      results.push({ label:target.label, ...(await triggerDeploy(target)) })
    } catch (error) {
      results.push({ label:target.label, ok:false, error:error.message })
    }
  }
  return results
}