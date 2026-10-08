const TEXT_EXTENSIONS = new Set([
  'js','jsx','ts','tsx','mjs','cjs','json','html','css','scss','md','mdx','yml','yaml',
  'py','go','rs','java','kt','kts','php','rb','sql','toml','xml','vue','svelte'
])

export function isTextPath(path='') {
  const clean=path.toLowerCase()
  const ext=clean.includes('.') ? clean.split('.').pop() : ''
  return TEXT_EXTENSIONS.has(ext) || ['dockerfile','makefile'].includes(clean.split('/').pop())
}

export function scorePath(path, prompt='') {
  const p=path.toLowerCase()
  const q=prompt.toLowerCase()
  let score=0
  const boosts=[
    ['package.json',25],['src/',12],['app/',12],['components/',10],['pages/',9],
    ['README',5],['vite.config',8],['next.config',8],['supabase/',8],['api/',9],
    ['index.',7],['main.',7],['layout.',7],['route.',7]
  ]
  for(const [term,value] of boosts) if(p.includes(term.toLowerCase())) score+=value
  for(const word of q.split(/\W+/).filter(x=>x.length>3)) if(p.includes(word)) score+=4
  if(p.includes('node_modules/')||p.includes('dist/')||p.includes('build/')||p.includes('.lock')) score-=100
  return score
}

export async function buildProjectContext(gh, owner, name, ref, prompt, maxFiles=14) {
  const tree=await gh.tree(owner,name,ref)
  const candidates=(tree.tree||[])
    .filter(x=>x.type==='blob'&&isTextPath(x.path)&&Number(x.size||0)<120000)
    .sort((a,b)=>scorePath(b.path,prompt)-scorePath(a.path,prompt))
    .slice(0,maxFiles)

  const files=[]
  let chars=0
  for(const item of candidates) {
    if(chars>70000) break
    try{
      const file=await gh.file(owner,name,item.path,ref)
      const content=(file.decoded||'').slice(0,16000)
      files.push({path:item.path,content,sha:file.sha})
      chars+=content.length
    }catch{}
  }

  return {
    tree:(tree.tree||[]).slice(0,800).map(x=>x.path),
    files
  }
}
