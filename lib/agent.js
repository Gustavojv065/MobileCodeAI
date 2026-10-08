import { runAgent } from './ai.js'
import { detectSkills } from './skills.js'

function mergeFiles(primary=[], secondary=[]) {
  const map=new Map()
  for(const file of [...primary,...secondary]) {
    if(file?.path&&typeof file.content==='string') map.set(file.path,file)
  }
  return [...map.values()]
}

export async function runIntelligentPipeline({provider,apiKey,model,prompt,projectContext,memory}) {
  const skills=detectSkills(prompt)
  const shared=[
    'Skills ativas: '+skills.map(x=>x.label).join(', '),
    'Memória do projeto: '+JSON.stringify((memory?.notes||[]).slice(-8)),
    'Árvore: '+projectContext.tree.join(', '),
    ...projectContext.files.map(f=>'\n### '+f.path+'\n'+f.content)
  ].join('\n')

  const architect=await runAgent({
    provider,apiKey,model,maxTokens,
    prompt:'Você é o ARQUITETO. Analise o pedido e o projeto. Planeje a menor mudança completa e segura. Não edite arquivos desnecessários. Pedido: '+prompt,
    context:shared
  })

  const builder=await runAgent({
    provider,apiKey,model,maxTokens,
    prompt:[
      'Você é o EXECUTOR de código.',
      'Pedido original: '+prompt,
      'Plano do arquiteto: '+JSON.stringify(architect),
      'Implemente arquivos COMPLETOS prontos para commit. Preserve funcionalidades existentes.'
    ].join('\n'),
    context:shared
  })

  const reviewContext=[
    shared,
    '\nPROPOSTA DO EXECUTOR:\n'+JSON.stringify(builder)
  ].join('\n')

  const reviewer=await runAgent({
    provider,apiKey,model,maxTokens,
    prompt:[
      'Você é o REVISOR final.',
      'Procure erros de sintaxe, imports, segurança, responsividade, regressões e requisitos esquecidos.',
      'Se houver correções, retorne os arquivos corrigidos COMPLETOS. Se estiver bom, repita os arquivos aprovados.',
      'Pedido original: '+prompt
    ].join('\n'),
    context:reviewContext
  })

  return {
    summary:reviewer.summary||builder.summary||architect.summary,
    files:mergeFiles(builder.files,reviewer.files),
    mediaRequests:[...(builder.mediaRequests||[]),...(reviewer.mediaRequests||[])],
    notes:[
      ...(architect.notes||[]),
      ...(builder.notes||[]),
      ...(reviewer.notes||[])
    ],
    skills,
    stages:{architect,builder,reviewer}
  }
}
