export const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    kind: 'openai',
    defaultModel: 'openrouter/free',
    freeFirst: true,
    modelsEndpoint: '/models'
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    kind: 'openai',
    defaultModel: 'gemini-3.5-flash-lite',
    freeFirst: true,
    modelsEndpoint: '/models'
  },
  nvidia: {
    label: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: true,
    modelsEndpoint: '/models'
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: true,
    modelsEndpoint: '/models'
  },
  cerebras: {
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: true,
    modelsEndpoint: '/models'
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: false,
    modelsEndpoint: '/models'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    kind: 'openai',
    defaultModel: 'deepseek-chat',
    freeFirst: false,
    modelsEndpoint: '/models'
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: false,
    modelsEndpoint: '/models'
  },
  together: {
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: false,
    modelsEndpoint: '/models'
  },
  fireworks: {
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: false,
    modelsEndpoint: '/models'
  },
  xai: {
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    kind: 'openai',
    defaultModel: '',
    freeFirst: false,
    modelsEndpoint: '/models'
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    kind: 'anthropic',
    defaultModel: '',
    freeFirst: false
  }
}

export function providerEntries(){
  return Object.entries(PROVIDERS).map(([id,p])=>({id,...p}))
}

export async function listProviderModels(providerId, apiKey){
  const provider=PROVIDERS[providerId]
  if(!provider) throw new Error('Provedor desconhecido.')
  if(!apiKey) throw new Error('Informe a chave API deste provedor.')
  if(provider.kind==='anthropic') return []

  const url=provider.baseUrl.replace(/\/$/,'')+(provider.modelsEndpoint||'/models')
  const headers={authorization:'Bearer '+apiKey}
  if(providerId==='gemini') headers['x-goog-api-key']=apiKey
  const r=await fetch(url,{headers})
  const data=await r.json().catch(()=>({}))
  if(!r.ok) throw new Error(data?.error?.message||data?.message||('Falha ao listar modelos: HTTP '+r.status))
  const list=Array.isArray(data?.data)?data.data:Array.isArray(data?.models)?data.models:[]
  return list.map(x=>typeof x==='string'?x:(x.id||x.name||'')).filter(Boolean).map(x=>String(x).replace(/^models\//,''))
}

export function autoModel(providerId, available=[]){
  const p=PROVIDERS[providerId]
  if(!p) return ''
  if(providerId==='openrouter'){
    const free=available.find(x=>String(x).endsWith(':free'))
    return free||'openrouter/free'
  }
  const preferredPatterns={
    gemini:['flash-lite','flash'],
    nvidia:['nemotron','llama'],
    groq:['llama','qwen','gemma'],
    cerebras:['llama','qwen'],
    openai:['mini','nano'],
    deepseek:['deepseek-chat'],
    mistral:['small','ministral'],
    together:['free','qwen','llama'],
    fireworks:['qwen','llama'],
    xai:['mini','fast']
  }[providerId]||[]

  const lower=available.map(x=>[x,String(x).toLowerCase()])
  for(const pattern of preferredPatterns){
    const hit=lower.find(([,v])=>v.includes(pattern))
    if(hit) return hit[0]
  }
  return p.defaultModel||available[0]||''
}
