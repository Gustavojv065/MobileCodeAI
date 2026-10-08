import { GitHubClient, splitRepo } from './lib/github.js'
import { runAgent } from './lib/ai.js'
import { runIntelligentPipeline } from './lib/agent.js'
import { buildProjectContext } from './lib/context.js'
import { DEPLOY_PRESETS, triggerAll } from './lib/deploy.js'
import { MEDIA_OPERATIONS, runMedia } from './lib/media.js'
import { loadProjectMemory, rememberRun } from './lib/memory.js'
import { addJob, updateJob, listJobs, clearJobs } from './lib/jobs.js'

const $ = id => document.getElementById(id)
let repos=[]
let currentRoot=[]

document.querySelectorAll('nav button').forEach(btn=>btn.addEventListener('click',async()=>{
  document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.remove('active'))
  btn.classList.add('active')
  $(btn.dataset.tab).classList.add('active')
  if(btn.dataset.tab==='jobs') await renderJobs()
}))

async function getSettings(){
  return chrome.storage.local.get([
    'githubToken','aiProvider','aiKey','aiModel','mediaWorkerUrl','mediaWorkerKey',
    'deployTargets','lovableUrl'
  ])
}

async function saveSettings(){
  const value={
    githubToken:$('githubToken').value.trim(),
    aiProvider:$('aiProvider').value,
    aiKey:$('aiKey').value.trim(),
    aiModel:$('aiModel').value.trim(),
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

function client(token){
  if(!token) throw new Error('Configure o GitHub Token.')
  return new GitHubClient(token)
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
  $('aiProvider').value=s.aiProvider||'openai'
  $('aiKey').value=s.aiKey||''
  $('aiModel').value=s.aiModel||'gpt-5'
  $('mediaWorkerUrl').value=s.mediaWorkerUrl||''
  $('mediaWorkerKey').value=s.mediaWorkerKey||''
  $('lovableUrl').value=s.lovableUrl||''
  renderDeployTargets(s.deployTargets||[])
  renderMediaOperations()
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
  const gh=client(settings.githubToken)
  if(!settings.aiKey||!settings.aiModel) throw new Error('Configure a IA e o modelo.')
  const full=$('repoSelect').value
  const {owner,name}=splitRepo(full)
  const base=$('branchSelect').value
  const prompt=$('prompt').value.trim()
  if(!prompt) throw new Error('Digite um pedido.')

  $('runAgent').disabled=true
  const job=await addJob({type:'code',title:prompt.slice(0,100),repo:full,status:'running'})
  await renderJobs()

  try{
    $('agentStatus').textContent='Mapeando o projeto...'
    const projectContext=await buildProjectContext(gh,owner,name,base,prompt,14)

    if($('fileSelect').value){
      projectContext.files.unshift({
        path:$('fileSelect').value,
        content:$('filePreview').value,
        sha:null
      })
    }

    const memory=await loadProjectMemory(full)
    let plan
    if($('pipelineMode').value==='smart'){
      $('agentStatus').textContent='Arquiteto → Executor → Revisor...'
      plan=await runIntelligentPipeline({
        provider:settings.aiProvider||'openai',
        apiKey:settings.aiKey,
        model:settings.aiModel,
        prompt,
        projectContext,
        memory
      })
    }else{
      $('agentStatus').textContent='Executando modo rápido...'
      plan=await runAgent({
        provider:settings.aiProvider||'openai',
        apiKey:settings.aiKey,
        model:settings.aiModel,
        prompt,
        context:JSON.stringify(projectContext)
      })
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
      $('agentStatus').textContent='Gerando mídia solicitada pelo agente...'
      try{
        media.push(await runMedia(settings,{
          operation:request.type==='image'?'image-generate':
            request.type==='video'?'video-generate':
            request.type==='audio'?'music-generate':'generate-3d',
          prompt:request.prompt,
          projectId:full
        }))
      }catch(error){
        media.push({ok:false,error:error.message,request})
      }
    }

    let pr
    if(mode==='pr'){
      $('agentStatus').textContent='Criando Pull Request...'
      pr=await gh.createPR(owner,name,'ALTIV: '+prompt.slice(0,72),targetBranch,base,plan.summary||'Alterações feitas pelo ALTIV Studio.')
    }

    $('agentStatus').textContent='Disparando deploys...'
    const deploys=await triggerAll(settings.deployTargets||[])
    await rememberRun(full,prompt,plan.summary||'')

    const result={
      summary:plan.summary,
      branch:targetBranch,
      pullRequest:pr?.html_url,
      media,
      deploys,
      notes:plan.notes||[]
    }
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
  const result=await gh.createRepo({
    name,
    description:$('newRepoDescription').value.trim(),
    isPrivate:$('newRepoPrivate').checked
  })
  $('githubStatus').textContent='Criado: '+result.full_name
  await loadRepos()
}

async function executeMedia(){
  const settings=await getSettings()
  const payload={
    operation:$('mediaOperation').value,
    prompt:$('mediaPrompt').value.trim(),
    inputUrl:$('mediaInputUrl').value.trim()||undefined,
    projectId:$('repoSelect').value||undefined
  }
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
      <small>${escapeHtml(j.repo||'')} · ${new Date(j.createdAt).toLocaleString()}</small>
      ${j.error?`<div class="err">${escapeHtml(j.error)}</div>`:''}
    </div>`).join(''):'<p class="muted">Nenhum job ainda.</p>'
}

$('saveSettings').addEventListener('click',()=>saveSettings().catch(showError))
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
$('openLovable').addEventListener('click',()=>{
  const url=$('lovableUrl').value.trim()
  if(url) chrome.runtime.sendMessage({type:'OPEN_URL',url})
})
$('openRepo').addEventListener('click',()=>{
  const full=$('repoSelect').value
  if(full) chrome.runtime.sendMessage({type:'OPEN_URL',url:'https://github.com/'+full})
})

function showError(error){
  const msg=error?.message||String(error)
  $('agentStatus').textContent='Erro: '+msg
  $('settingsStatus').textContent='Erro: '+msg
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

boot().catch(showError)
