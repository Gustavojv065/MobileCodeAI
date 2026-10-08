export const SKILLS = [
  { id:'site', label:'Criação de site', terms:['site','landing','página','pagina','website'] },
  { id:'ui', label:'UI/UX', terms:['visual','layout','design','responsiv','ux','ui','cores'] },
  { id:'debug', label:'Debug', terms:['erro','bug','corrigir','falha','crash','fix'] },
  { id:'security', label:'Segurança', terms:['segurança','security','auth','rls','token','vulnerabilidade'] },
  { id:'performance', label:'Performance', terms:['performance','lento','otimizar','velocidade'] },
  { id:'seo', label:'SEO', terms:['seo','meta','google','indexação','indexacao'] },
  { id:'backend', label:'Backend', terms:['api','supabase','banco','database','backend','edge function'] },
  { id:'github', label:'Git/GitHub', terms:['github','commit','push','branch','pull request','repo'] },
  { id:'media', label:'Mídia IA', terms:['imagem','foto','vídeo','video','áudio','audio','3d','logo'] },
  { id:'qa', label:'QA', terms:['teste','qa','revisão','revisao','verifique','auditoria'] }
]

export function detectSkills(prompt='') {
  const text=prompt.toLowerCase()
  const found=SKILLS.filter(s=>s.terms.some(t=>text.includes(t)))
  return found.length ? found : [{id:'general',label:'Geral'}]
}
