import { PROVIDERS } from './providers.js'

const SYSTEM = `Você é o ALTIV DEV Agent dentro de uma extensão de navegador.
Responda SEMPRE em JSON válido, sem markdown.
Objetivo: criar e editar sites/apps de forma profissional, preservando o projeto.
Use boas práticas de UI/UX, responsividade, acessibilidade, SEO, segurança, performance e compatibilidade.
Quando o usuário pedir mídia, sinalize mediaRequests em vez de inventar URLs.
Formato:
{
  "summary":"resumo curto",
  "files":[{"path":"caminho","content":"conteúdo COMPLETO do arquivo","message":"commit curto"}],
  "mediaRequests":[{"type":"image|video|audio|3d","prompt":"...","targetPath":"..."}],
  "notes":["..."]
}
Nunca inclua chaves ou tokens em arquivos.`

export async function runAgent({ provider, apiKey, model, prompt, context, maxTokens=3072 }) {
  const p=PROVIDERS[provider]
  if(!p) throw new Error('Provedor de IA não suportado.')
  if(!apiKey) throw new Error('Configure a chave API do provedor selecionado.')
  if(!model) throw new Error('Selecione ou informe um modelo.')

  const user = `PEDIDO DO USUÁRIO:\n${prompt}\n\nCONTEXTO DO PROJETO:\n${context}\n\nRetorne somente JSON.`

  if(p.kind==='anthropic'){
    const r=await fetch(p.baseUrl.replace(/\/$/,'')+'/messages',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01'
      },
      body:JSON.stringify({
        model,
        max_tokens:Math.min(Number(maxTokens)||3072,8192),
        system:SYSTEM,
        messages:[{role:'user',content:user}]
      })
    })
    const data=await r.json().catch(()=>({}))
    if(!r.ok) throw new Error(data?.error?.message||'Falha Anthropic')
    const text=(data?.content||[]).map(x=>x?.text||'').join('')
    return parseJson(text)
  }

  const headers={
    'content-type':'application/json',
    authorization:'Bearer '+apiKey
  }
  if(provider==='openrouter'){
    headers['HTTP-Referer']='https://altiv.online'
    headers['X-Title']='ALTIV Studio'
  }

  const r=await fetch(p.baseUrl.replace(/\/$/,'')+'/chat/completions',{
    method:'POST',
    headers,
    body:JSON.stringify({
      model,
      temperature:0.2,
      max_tokens:Math.min(Number(maxTokens)||3072,8192),
      response_format:{type:'json_object'},
      messages:[
        {role:'system',content:SYSTEM},
        {role:'user',content:user}
      ]
    })
  })
  const data=await r.json().catch(()=>({}))
  if(!r.ok) throw new Error(data?.error?.message||data?.message||('Falha '+p.label))
  return parseJson(data?.choices?.[0]?.message?.content||'')
}

function parseJson(text){
  const cleaned=String(text).trim().replace(/^\`\`\`json\s*/,'').replace(/\`\`\`$/,'')
  const parsed=JSON.parse(cleaned)
  if(!Array.isArray(parsed.files)) parsed.files=[]
  if(!Array.isArray(parsed.mediaRequests)) parsed.mediaRequests=[]
  if(!Array.isArray(parsed.notes)) parsed.notes=[]
  return parsed
}
