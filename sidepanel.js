import { GitHubClient, splitRepo } from './lib/github.js'
import { runAgent } from './lib/ai.js'
import { DEPLOY_PRESETS, triggerAll } from './lib/deploy.js'

const $ = (id) => document.getElementById(id)
let repos = []
let currentRoot = []

document.querySelectorAll('nav button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('nav button,.tab').forEach(x => x.classList.remove('active'))
  btn.classList.add('active')
  $(btn.dataset.tab).classList.add('active')
}))

async function getSettings() {
  return chrome.storage.local.get([
    'githubToken','aiProvider','aiKey','aiModel','mediaWorkerUrl','mediaWorkerKey','deployTargets','lovableUrl'
  ])
}

async function saveSettings() {
  const value = {
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
  await loadRepos()
}

function client(token) {
  if (!token) throw new Error('Configure o GitHub Token.')
  return new GitHubClient(token)
}

function renderDeployTargets(saved=[]) {
  const map = new Map(saved.map(x=>[x.id,x]))
  $('deployTargets').innerHTML = DEPLOY_PRESETS.map(p => {
    const s=map.get(p.id)||{}
    return `<div class="deploy-target" data-id="${p.id}">
      <div class="top"><input type="checkbox" class="enabled" ${s.enabled?'checked':''}><strong>${p.label}</strong></div>
      <input class="hook" placeholder="https://... webhook/deploy hook" value="${escapeHtml(s.url||'')}">
    </div>`
  }).join('')
}

function readDeployTargets() {
  return [...document.querySelectorAll('.deploy-target')].map(el=>({
    id:el.dataset.id,
    label:el.querySelector('strong').textContent,
    enabled:el.querySelector('.enabled').checked,
    url:el.querySelector('.hook').value.trim(),
    method:'POST'
  }))
}

async function boot() {
  const s=await getSettings()
  $('githubToken').value=s.githubToken||''
  $('aiProvider').value=s.aiProvider||'openai'
  $('aiKey').value=s.aiKey||''
  $('aiModel').value=s.aiModel||'gpt-5'
  $('mediaWorkerUrl').value=s.mediaWorkerUrl||''
  $('mediaWorkerKey').value=s.mediaWorkerKey||''
  $('lovableUrl').value=s.lovableUrl||''
  renderDeployTargets(s.deployTargets||[])
  if(s.githubToken) await loadRepos()
}

async function loadRepos() {
  const s=await getSettings()
  const gh=client(s.githubToken)
  $('agentStatus').textContent='Carregando repositórios...'
  repos=await gh.listRepos()
  $('repoSelect').innerHTML=repos.map(r=>`<option value="${r.full_name}">${r.full_name}</option>`).join('')
  $('agentStatus').textContent=`${repos.length} repositórios carregados.`
  await loadRepo()
}

async function loadRepo() {
  const s=await getSettings()
  const gh=client(s.githubToken)
  const full=$('repoSelect').value
  if(!full) return
  const {owner,name}=splitRepo(full)
  const meta=await gh.repo(owner,name)
  $('branchSelect').innerHTML=`<option value="${meta.default_branch}">${meta.default_branch}</option>`
  currentRoot=await gh.root(owner,name,meta.default_branch)
  const files=currentRoot.filter(x=>x.type==='file')
  $('fileSelect').innerHTML='<option value="">Nenhum / contexto geral</option>'+files.map(x=>`<option value="${x.path}">${x.path}</option>`).join('')
  $('filePreview').value=''
}

async function loadSelectedFile() {
  const path=$('fileSelect').value
  if(!path){$('filePreview').value='';return}
  const s=await getSettings()
  const gh=client(s.githubToken)
  const {owner,name}=splitRepo($('repoSelect').value)
  const data=await gh.file(owner,name,path,$('branchSelect').value)
  $('filePreview').value=data.decoded
}

async function mediaRequest(request, settings) {
  if(!settings.mediaWorkerUrl) return {ok:false,error:'Media Worker não configurado.',request}
  const r=await fetch(settings.mediaWorkerUrl.replace(/\/$/,'')+'/v1/media/run',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      ...(settings.mediaWorkerKey?{authorization:'Bearer '+settings.mediaWorkerKey}:{})
    },
    body:JSON.stringify({
      operation:request.type==='image'?'image-generate':request.type==='video'?'video-generate':request.type==='audio'?'music-generate':'generate-3d',
      prompt:request.prompt
    })
  })
  const data=await r.json().catch(()=>({}))
  return {ok:r.ok,...data,request}
}

async function executeAgent() {
  const settings=await getSettings()
  const gh=client(settings.githubToken)
  if(!settings.aiKey||!settings.aiModel) throw new Error('Configure a IA e o modelo.')
  const full=$('repoSelect').value
  const {owner,name}=splitRepo(full)
  const base=$('branchSelect').value
  const prompt=$('prompt').value.trim()
  if(!prompt) throw new Error('Digite um pedido.')

  $('runAgent').disabled=true
  $('agentStatus').textContent='ALTIV analisando o projeto...'
  $('agentLog').textContent=''

  const context=[
    'Repo: '+full,
    'Branch: '+base,
    'Arquivos raiz: '+currentRoot.map(x=>x.path).join(', '),
    $('fileSelect').value ? ('Arquivo selecionado: '+$('fileSelect').value+'\n'+$('filePreview').value.slice(0,30000)) : ''
  ].join('\n')

  const plan=await runAgent({
    provider:settings.aiProvider||'openai',
    apiKey:settings.aiKey,
    model:settings.aiModel,
    prompt,
    context
  })
  $('agentLog').textContent=JSON.stringify(plan,null,2)

  const mode=$('writeMode').value
  const targetBranch=mode==='pr' ? ('altiv/'+Date.now().toString(36)) : base
  if(mode==='pr') {
    $('agentStatus').textContent='Criando branch '+targetBranch+'...'
    await gh.branch(owner,name,targetBranch,base)
  }

  for(const file of plan.files||[]) {
    $('agentStatus').textContent='Gravando '+file.path+'...'
    let sha
    try { sha=(await gh.file(owner,name,file.path,targetBranch)).sha } catch {}
    await gh.putFile(owner,name,file.path,file.content,file.message||('ALTIV: update '+file.path),targetBranch,sha)
  }

  const media=[]
  for(const req of plan.mediaRequests||[]) {
    $('agentStatus').textContent='Enviando mídia: '+req.type+'...'
    media.push(await mediaRequest(req,settings))
  }

  let pr
  if(mode==='pr') {
    $('agentStatus').textContent='Criando Pull Request...'
    pr=await gh.createPR(owner,name,'ALTIV Agent: '+prompt.slice(0,70),targetBranch,base,plan.summary||'Alterações geradas pelo ALTIV Studio.')
  }

  $('agentStatus').textContent='Disparando deploys configurados...'
  const deploys=await triggerAll(settings.deployTargets||[])

  $('agentLog').textContent=JSON.stringify({
    summary:plan.summary,
    branch:targetBranch,
    pullRequest:pr?.html_url,
    media,
    deploys,
    notes:plan.notes
  },null,2)
  $('agentStatus').textContent='Concluído.'
  $('runAgent').disabled=false
}

async function createRepo() {
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

$('saveSettings').addEventListener('click',()=>saveSettings().catch(showError))
$('refreshRepo').addEventListener('click',()=>loadRepo().catch(showError))
$('repoSelect').addEventListener('change',()=>loadRepo().catch(showError))
$('fileSelect').addEventListener('change',()=>loadSelectedFile().catch(showError))
$('runAgent').addEventListener('click',()=>executeAgent().catch(e=>{ $('runAgent').disabled=false; showError(e) }))
$('createRepo').addEventListener('click',()=>createRepo().catch(showError))
$('testDeploys').addEventListener('click',async()=>{
  try{
    const targets=readDeployTargets()
    await chrome.storage.local.set({deployTargets:targets})
    $('deployStatus').textContent=JSON.stringify(await triggerAll(targets),null,2)
  }catch(e){showError(e)}
})
$('openLovable').addEventListener('click',()=>{
  const url=$('lovableUrl').value.trim()
  if(url) chrome.runtime.sendMessage({type:'OPEN_URL',url})
})

function showError(error){
  const msg=error?.message||String(error)
  $('agentStatus').textContent='Erro: '+msg
  $('settingsStatus').textContent='Erro: '+msg
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

boot().catch(showError)