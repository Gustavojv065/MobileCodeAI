export const MEDIA_OPERATIONS=[
  ['image-generate','Gerar imagem'],
  ['image-edit','Editar imagem'],
  ['remove-background','Remover fundo'],
  ['inpaint','Remover/Substituir objeto'],
  ['upscale','Melhorar resolução'],
  ['face-restore','Restaurar rosto'],
  ['video-generate','Gerar vídeo'],
  ['video-interpolate','Suavizar vídeo'],
  ['transcribe','Transcrever áudio'],
  ['tts','Gerar voz'],
  ['music-generate','Gerar música'],
  ['generate-3d','Gerar 3D']
]

export async function runMedia(settings, payload) {
  const base=String(settings.mediaWorkerUrl||'').trim().replace(/\/$/,'')
  if(!base) throw new Error('Configure o ALTIV Media Worker.')
  const r=await fetch(base+'/v1/media/run',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      ...(settings.mediaWorkerKey?{authorization:'Bearer '+settings.mediaWorkerKey}:{})
    },
    body:JSON.stringify(payload)
  })
  const data=await r.json().catch(()=>({}))
  if(!r.ok) throw new Error(data.error||('Media Worker HTTP '+r.status))
  return data
}
