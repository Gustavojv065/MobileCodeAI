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
Nunca inclua chaves ou tokens em arquivos.
`

export async function runAgent({ provider, apiKey, model, prompt, context }) {
  const user = `PEDIDO DO USUÁRIO:\n${prompt}\n\nCONTEXTO DO PROJETO:\n${context}\n\nRetorne somente JSON.`

  if (provider === 'gemini') {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey)
    const r = await fetch(url, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        system_instruction:{parts:[{text:SYSTEM}]},
        contents:[{role:'user',parts:[{text:user}]}],
        generationConfig:{responseMimeType:'application/json'}
      })
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data?.error?.message || 'Falha Gemini')
    return parseJson(data?.candidates?.[0]?.content?.parts?.[0]?.text || '')
  }

  const base = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1'
  const r = await fetch(base + '/chat/completions', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer ' + apiKey,
      ...(provider === 'openrouter' ? {'HTTP-Referer':'https://altiv.online','X-Title':'ALTIV Studio'} : {})
    },
    body:JSON.stringify({
      model,
      temperature:0.2,
      response_format:{type:'json_object'},
      messages:[
        {role:'system',content:SYSTEM},
        {role:'user',content:user}
      ]
    })
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data?.error?.message || 'Falha no provedor de IA')
  return parseJson(data?.choices?.[0]?.message?.content || '')
}

function parseJson(text) {
  const cleaned = String(text).trim().replace(/^\`\`\`json\s*/,'').replace(/\`\`\`$/,'')
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed.files)) parsed.files = []
  if (!Array.isArray(parsed.mediaRequests)) parsed.mediaRequests = []
  if (!Array.isArray(parsed.notes)) parsed.notes = []
  return parsed
}