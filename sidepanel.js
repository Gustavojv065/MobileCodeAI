import { GitHubClient, splitRepo } from './lib/github.js'
import { runAgent } from './lib/ai.js'
import { runIntelligentPipeline } from './lib/agent.js'
import { buildProjectContext } from './lib/context.js'
import { DEPLOY_PRESETS, triggerAll } from './lib/deploy.js'
import { MEDIA_OPERATIONS, runMedia } from './lib/media.js'
import { loadProjectMemory, rememberRun } from './lib/memory.js'
import { addJob, updateJob, listJobs, clearJobs } from './lib/jobs.js'
import { providerEntries, listProviderModels, autoModel, PROVIDERS, freeFirstCandidates, isRateOrCreditError } from './lib/providers.js'

const $ = id => document.getElementById(id)
let repos=[]
let currentRoot=[]
let providerModels={}

document.querySelectorAll('nav button').forEach(btn=>btn.addEventListener('click',async()=>{
  document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.remove('active'))
  btn.classList.add('active')
  $(btn.dataset.tab).classList.add('active')
  if(btn.dataset.tab==='jobs') await renderJobs()
}))

async function getSettings(){
  return chrome.storage.local.get([
    'githubToken','aiProvider','providerKeys','modelMode','manualModels','selectedModels','maxTokens',
    'mediaWorkerUrl','mediaWorkerKey','deployTargets','lovableUrl'
  ])
}

async function hydrateConfiguredModels(settings){
  const keys=settings.providerKeys||{}
  for(const [providerId,apiKey] of Object.entries(keys)){
    if(!apiKey || providerId==='anthropic' || providerId==='auto' || providerModels[providerId]?.length) continue
    try{
      providerModels[providerId]=await listProviderModels(providerId,apiKey)
    }catch{
      providerModels[providerId]=providerModels[providerId]||[]
    }
  }
}

async function currentAIConfig(){
  const s=await getSettings()
  const provider=s.aiProvider||'auto'
  const keys=s.providerKeys||{}
  const mode=s.modelMode||'auto'
  const maxTokens=Number(s.maxTokens||3072)

  if(mode==='auto') await hydrateConfiguredModels(s)

  if(provider==='auto'){
    const candidates=freeFirstCandidates(s,providerModels)
    if(!candidates.length) throw new Error('No modo Automático, cadastre pelo menos uma chave em OpenCode Zen, Gemini, NVIDIA, Groq, Cerebras ou OpenRouter.')
    return {provider:'auto',candidates,maxTokens}
  }

  const available=providerModels[provider]||[]
  const selected=s.selectedModels?.[provider]||''
  const manual=s.manualModels?.[provider]||''
  const model=mode==='manual'
    ? (manual||selected||PROVIDERS[provider]?.defaultModel||'')
    : (autoModel(provider,available)||selected||PROVIDERS[provider]?.defaultModel||'')

  const primary={provider,apiKey:keys[provider]||'',model}
  let candidates=[primary]

  if(mode==='auto'){
    const fallbacks=freeFirstCandidates(s,providerModels).filter(x=>x.provider!==provider)
    candidates=[primary,...fallbacks]
  }

  candidates=candidates.filter(x=>x.apiKey&&x.model)
  return {provider,candidates,maxTokens}
}

async function runWithFallback(ai, runner){
  const errors=[]
  for(const candidate of ai.candidates||[]){
    if(!candidate.apiKey||!candidate.model) continue
    try{
      $('agentStatus').textContent='Tentando '+(PROVIDERS[candidate.provider]?.label||candidate.provider)+' • '+candidate.model
      const result=await runner({...candidate,maxTokens:ai.maxTokens})
      return {result,used:candidate,errors}
    }catch(error){
      errors.push({provider:candidate.provider,model:candidate.model,error:error.message})
      if(ai.provider!=='auto' || !isRateOrCreditError(error)) throw error
    }
  }
  const detail=errors.map(x=>(PROVIDERS[x.provider]?.label||x.provider)+': '+x.error).join(' | ')
  throw new Error('Nenhum provedor automático disponível conseguiu concluir. '+detail)
}

async function saveSettings(){
  const s=await getSettings()
  const provider=$('aiProvider').value
  const keys={...(s.providerKeys||{})}
  const manuals={...(s.manualModels||{})}
  const selected={...(s.selectedModels||{})}
  if(provider!=='auto'){
    keys[provider]=$('aiKey').value.trim()
    manuals[provider]=$('aiModelManual').value.trim()
    selected[provider]=$('aiModelSelect').value
  }
  const value={
    githubToken:$('githubToken').value.trim(),
    aiProvider:provider,
    providerKeys:keys,
    modelMode:$('modelMode').value,
    manualModels:manuals,
    selectedModels:selected,
    maxTokens:Number($('maxTokens').value||3072),
    mediaWorkerUrl:$('mediaWorkerUrl').value.trim(),
    mediaWorkerKey:$('mediaWorkerKey').value.trim(),
    lovableUrl:$('lovableUrl').value.trim(),
    deployTargets:readDeployTargets()
  }
  await chrome.storage.local.set(value)
  $('settingsStatus').textContent='Configurações salvas.'
  $('deployStatus').textContent='Configurações de deploy salvas.'
  if(value.githubToken) await loadRepos()
}

async function saveCurrentProviderKey(){
  const s=await getSettings()
  const provider=$('aiProvider').value
  if(provider==='auto'){
    $('settingsStatus').textContent='Selecione um provedor específico para salvar a chave.'
    return
  }
  const keys={...(s.providerKeys||{}),[provider]:$('aiKey').value.trim()}
  await chrome.storage.local.set({providerKeys:keys,aiProvider:provider})
  $('settingsStatus').textContent='Chave de '+(PROVIDERS[provider]?.label||provider)+' salva.'
}

function client(token){
  if(!token) throw new Error('Configure o GitHub Token.')
  return new GitHubClient(token)
}

function renderProviderOptions(selected='auto'){
  $('aiProvider').innerHTML=providerEntries().map(p=>`<option value="${p.id}">${p.label}${p.freeFirst?' • free-first':''}</option>`).join('')
  $('aiProvider').value=selected
}

async function loadProviderUI({refresh=false}={}){
  const s=await getSettings()
  const provider=$('aiProvider').value||s.aiProvider||'auto'
  const keys=s.providerKeys||{}
  const isAuto=provider==='auto'

  $('aiKey').value=isAuto?'':(keys[provider]||'')
  $('aiKey').disabled=isAuto
  $('saveProviderKey').disabled=isAuto
  $('refreshModels').disabled=isAuto
  $('modelMode').value=s.modelMode||'auto'
  $('maxTokens').value=String(s.maxTokens||3072)
  $('aiModelManual').value=isAuto?'':(s.manualModels?.[provider]||'')

  if(isAuto){
    const candidates=freeFirstCandidates(s,providerModels)
    $('aiModelSelect').innerHTML=candidates.length
      ? candidates.map(x=>`<option>${escapeHtml(PROVIDERS[x.provider]?.label||x.provider)} → ${escapeHtml(x.model)}</option>`).join('')
      : '<option>Cadastre chaves nos provedores abaixo</option>'
    $('aiModelSelect').disabled=true
    $('aiModelManual').style.display='none'
    $('settingsStatus').textContent=candidates.length
      ? 'Automático ativo: fallback entre '+candidates.map(x=>PROVIDERS[x.provider]?.label||x.provider).join(' → ')
      : 'Automático ativo. Cadastre pelo menos uma chave em um provedor free-first.'
    return
  }

  if(refresh && keys[provider]){
    $('settingsStatus').textContent='Buscando modelos de '+(PROVIDERS[provider]?.label||provider)+'...'
    try{
      providerModels[provider]=await listProviderModels(provider,keys[provider])
      $('settingsStatus').textContent=providerModels[provider].length+' modelos encontrados.'
    }catch(error){
      $('settingsStatus').textContent='Não foi possível listar modelos: '+error.message
    }
  }

  const models=providerModels[provider]||[]
  const auto=autoModel(provider,models)
  const saved=s.selectedModels?.[provider]||''
  const fallback=PROVIDERS[provider]?.defaultModel||''
  const options=[...new Set([auto,saved,fallback,...models].filter(Boolean))]
  $('aiModelSelect').innerHTML=options.length
    ? options.map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(id)}${id===auto?' • AUTO':''}</option>`).join('')
    : '<option value="">Informe manualmente ou atualize os modelos</option>'
  if(saved&&options.includes(saved)) $('aiModelSelect').value=saved
  else if(auto) $('aiModelSelect').value=auto

  updateModelModeUI()
}

function updateModelModeUI(){
  const manual=$('modelMode').value==='manual'
  $('aiModelManual').style.display=manual?'block':'none'
  $('aiModelSelect').disabled=manual
}

function renderDeployTargets(saved=[]){
  const map=new Map(saved.map(x=>[x.id,x]))
  $('deployTargets').innerHTML=DEPLOY_PRESETS.map(p=>{
    const s=map.get(p.id)||{}
    return `<div class="deploy-target" data-id="${p.id}">
      <div class="top"><input type="checkbox" class="enabled" ${s.enabled?'checked':''}><strong>${p.label}</strong></div>
      <input class="hook" placeholder="https://... deploy hook" value="${escapeHtml(s.url||'')}">
    </div>`
  }).join('')
}

function readDeployTargets(){
  return [...document.querySelectorAll('.deploy-target')].map(el=>({
    id:el.dataset.id,
    label:el.querySelector('strong').textContent,
    enabled:el.querySelector('.enabled').checked,
    url:el.querySelector('.hook').value.trim(),
    method:'POST'
  }))
}

function renderMediaOperations(){
  $('mediaOperation').innerHTML=MEDIA_OPERATIONS.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')
}

async function boot(){
  const s=await getSettings()
  $('githubToken').value=s.githubToken||''
  renderProviderOptions(s.aiProvider||'auto')
  $('mediaWorkerUrl').value=s.mediaWorkerUrl||''
  $('mediaWorkerKey').value=s.mediaWorkerKey||''
  $('lovableUrl').value=s.lovableUrl||''
  renderDeployTargets(s.deployTargets||[])
  renderMediaOperations()
  await loadProviderUI()
  await renderJobs()
  if(s.githubToken) await loadRepos()
}

async function loadRepos(){
  const s=await getSettings()
  const gh=client(s.githubToken)
  $('agentStatus').textContent='Carregando repositórios...'
  repos=await gh.listRepos()
  $('repoSelect').innerHTML=repos.map(r=>`<option value="${r.full_name}">${r.full_name}</option>`).join('')
  $('agentStatus').textContent=`${repos.length} repositórios carregados.`
  await loadRepo()
}

async function loadRepo(){
  const s=await getSettings()
  const gh=client(s.githubToken)
  const full=$('repoSelect').value
  if(!full) return
  const {owner,name}=splitRepo(full)
  const meta=await gh.repo(owner,name)
  $('branchSelect').innerHTML=`<option value="${meta.default_branch}">${meta.default_branch}</option>`
  currentRoot=await gh.root(owner,name,meta.default_branch)
  const files=currentRoot.filter(x=>x.type==='file')
  $('fileSelect').innerHTML='<option value="">Contexto automático</option>'+files.map(x=>`<option value="${x.path}">${x.path}</option>`).join('')
  $('filePreview').value=''
  $('mediaProject').value=full
}

async function loadSelectedFile(){
  const path=$('fileSelect').value
  if(!path){$('filePreview').value='';return}
  const s=await getSettings()
  const gh=client(s.githubToken)
  const {owner,name}=splitRepo($('repoSelect').value)
  const data=await gh.file(owner,name,path,$('branchSelect').value)
  $('filePreview').value=data.decoded
}

async function executeAgent(){
  const settings=await getSettings()
  const ai=await currentAIConfig()
  const gh=client(settings.githubToken)
  if(!ai.candidates?.length) throw new Error('Nenhum provedor/modelo disponível. Configure uma chave API.')
  const full=$('repoSelect').value
  const {owner,name}=splitRepo(full)
  const base=$('branchSelect').value
  const prompt=$('prompt').value.trim()
  if(!prompt) throw new Error('Digite um pedido.')

  $('runAgent').disabled=true
  const job=await addJob({type:'code',title:prompt.slice(0,100),repo:full,status:'running',provider:ai.provider,model:ai.provider==='auto'?'fallback automático':ai.candidates?.[0]?.model})
  await renderJobs()

  try{
    $('agentStatus').textContent='Mapeando o projeto...'
    const projectContext=await buildProjectContext(gh,owner,name,base,prompt,14)
    if($('fileSelect').value){
      projectContext.files.unshift({path:$('fileSelect').value,content:$('filePreview').value,sha:null})
    }

    const memory=await loadProjectMemory(full)
    let plan
    let usedAI
    if($('pipelineMode').value==='smart'){
      const attempt=await runWithFallback(ai,candidate=>runIntelligentPipeline({
        provider:candidate.provider,apiKey:candidate.apiKey,model:candidate.model,maxTokens:candidate.maxTokens,
        prompt,projectContext,memory
      }))
      plan=attempt.result
      usedAI=attempt.used
    }else{
      const attempt=await runWithFallback(ai,candidate=>runAgent({
        provider:candidate.provider,apiKey:candidate.apiKey,model:candidate.model,maxTokens:candidate.maxTokens,
        prompt,context:JSON.stringify(projectContext)
      }))
      plan=attempt.result
      usedAI=attempt.used
    }

    $('agentLog').textContent=JSON.stringify(plan,null,2)
    const mode=$('writeMode').value
    const targetBranch=mode==='pr' ? ('altiv/'+Date.now().toString(36)) : base

    if(mode==='pr'){
      $('agentStatus').textContent='Criando branch '+targetBranch+'...'
      await gh.branch(owner,name,targetBranch,base)
    }

    for(const file of plan.files||[]){
      $('agentStatus').textContent='Commit: '+file.path
      let sha
      try{sha=(await gh.file(owner,name,file.path,targetBranch)).sha}catch{}
      await gh.putFile(owner,name,file.path,file.content,file.message||('ALTIV: update '+file.path),targetBranch,sha)
    }

    const media=[]
    for(const request of plan.mediaRequests||[]){
      try{
        media.push(await runMedia(settings,{
          operation:request.type==='image'?'image-generate':request.type==='video'?'video-generate':request.type==='audio'?'music-generate':'generate-3d',
          prompt:request.prompt,projectId:full
        }))
      }catch(error){media.push({ok:false,error:error.message,request})}
    }

    let pr
    if(mode==='pr'){
      $('agentStatus').textContent='Criando Pull Request...'
      pr=await gh.createPR(owner,name,'ALTIV: '+prompt.slice(0,72),targetBranch,base,plan.summary||'Alterações feitas pelo ALTIV Studio.')
    }

    $('agentStatus').textContent='Disparando deploys...'
    const deploys=await triggerAll(settings.deployTargets||[])
    await rememberRun(full,prompt,plan.summary||'')

    const result={summary:plan.summary,provider:usedAI?.provider,model:usedAI?.model,branch:targetBranch,pullRequest:pr?.html_url,media,deploys,notes:plan.notes||[]}
    $('agentLog').textContent=JSON.stringify(result,null,2)
    $('agentStatus').textContent='Concluído. Alterações enviadas ao GitHub.'
    await updateJob(job.id,{status:'done',result})
  }catch(error){
    $('agentStatus').textContent='Erro: '+error.message
    await updateJob(job.id,{status:'error',error:error.message})
    throw error
  }finally{
    $('runAgent').disabled=false
    await renderJobs()
  }
}

async function createRepo(){
  const s=await getSettings()
  const gh=client(s.githubToken)
  const name=$('newRepoName').value.trim()
  if(!name) throw new Error('Informe o nome do repositório.')
  const result=await gh.createRepo({name,description:$('newRepoDescription').value.trim(),isPrivate:$('newRepoPrivate').checked})
  $('githubStatus').textContent='Criado: '+result.full_name
  await loadRepos()
}

async function executeMedia(){
  const settings=await getSettings()
  const payload={operation:$('mediaOperation').value,prompt:$('mediaPrompt').value.trim(),inputUrl:$('mediaInputUrl').value.trim()||undefined,projectId:$('repoSelect').value||undefined}
  const job=await addJob({type:'media',title:payload.operation,repo:payload.projectId,status:'running'})
  $('mediaStatus').textContent='Enviando ao Media Worker...'
  try{
    const result=await runMedia(settings,payload)
    $('mediaLog').textContent=JSON.stringify(result,null,2)
    $('mediaStatus').textContent='Tarefa enviada.'
    await updateJob(job.id,{status:'done',result})
  }catch(error){
    $('mediaStatus').textContent='Erro: '+error.message
    await updateJob(job.id,{status:'error',error:error.message})
  }
  await renderJobs()
}

async function renderJobs(){
  const jobs=await listJobs()
  $('jobsList').innerHTML=jobs.length?jobs.map(j=>`
    <div class="job">
      <strong>${escapeHtml(j.title||j.type)}</strong>
      <div class="${j.status==='done'?'ok':j.status==='error'?'err':''}">${escapeHtml(j.status)}</div>
      <small>${escapeHtml(j.repo||'')} ${j.model?'• '+escapeHtml(j.model):''} · ${new Date(j.createdAt).toLocaleString()}</small>
      ${j.error?`<div class="err">${escapeHtml(j.error)}</div>`:''}
    </div>`).join(''):'<p class="muted">Nenhum job ainda.</p>'
}

$('saveSettings').addEventListener('click',()=>saveSettings().catch(showError))
$('saveProviderKey').addEventListener('click',()=>saveCurrentProviderKey().catch(showError))
$('refreshModels').addEventListener('click',()=>loadProviderUI({refresh:true}).catch(showError))
$('aiProvider').addEventListener('change',async()=>{
  await chrome.storage.local.set({aiProvider:$('aiProvider').value})
  await loadProviderUI()
})
$('modelMode').addEventListener('change',async()=>{
  updateModelModeUI()
  await chrome.storage.local.set({modelMode:$('modelMode').value})
})
$('aiModelSelect').addEventListener('change',async()=>{
  const s=await getSettings()
  const provider=$('aiProvider').value
  if(provider!=='auto') await chrome.storage.local.set({selectedModels:{...(s.selectedModels||{}),[provider]:$('aiModelSelect').value}})
})
$('refreshRepo').addEventListener('click',()=>loadRepo().catch(showError))
$('repoSelect').addEventListener('change',()=>loadRepo().catch(showError))
$('fileSelect').addEventListener('change',()=>loadSelectedFile().catch(showError))
$('runAgent').addEventListener('click',()=>executeAgent().catch(showError))
$('createRepo').addEventListener('click',()=>createRepo().catch(showError))
$('runMedia').addEventListener('click',()=>executeMedia().catch(showError))
$('clearJobs').addEventListener('click',async()=>{await clearJobs();await renderJobs()})
$('testDeploys').addEventListener('click',async()=>{
  try{
    const targets=readDeployTargets()
    await chrome.storage.local.set({deployTargets:targets})
    $('deployStatus').textContent=JSON.stringify(await triggerAll(targets),null,2)
  }catch(error){showError(error)}
})
$('openLovable').addEventListener('click',()=>{const url=$('lovableUrl').value.trim();if(url) chrome.runtime.sendMessage({type:'OPEN_URL',url})})
$('openRepo').addEventListener('click',()=>{const full=$('repoSelect').value;if(full) chrome.runtime.sendMessage({type:'OPEN_URL',url:'https://github.com/'+full})})

function showError(error){
  const msg=error?.message||String(error)
  $('agentStatus').textContent='Erro: '+msg
  $('settingsStatus').textContent='Erro: '+msg
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

boot().catch(showError)
