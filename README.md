# ALTIV Studio Extension v2

Extensão Chrome/Chromium para criar e editar projetos inteiros diretamente pelo GitHub com IA.

## Fluxo principal

Pedido em linguagem natural → contexto automático do repositório → Arquiteto → Executor → Revisor → branch/commit → Pull Request → deploy hooks → atualização no provedor conectado.

O ALTIV não precisa de preview embutido para o fluxo principal. Depois do push, o projeto pode ser visto no Lovable, Vercel, Netlify, Render, Railway ou outro destino configurado.

## Inteligência incorporada

- agente em três estágios: arquiteto, executor e revisor;
- leitura recursiva da árvore do repositório;
- seleção automática de arquivos relevantes;
- skills por intenção;
- memória persistente por projeto;
- criação de repositórios GitHub;
- criação de branch, commit e Pull Request;
- modo de commit direto;
- OpenAI, OpenRouter e Gemini;
- Jobs persistentes;
- AI Media Studio;
- deploy hooks múltiplos.

## AI Media Studio

A extensão possui operações para:
- gerar e editar imagens;
- remover fundo;
- inpainting;
- upscale;
- restauração facial;
- gerar e suavizar vídeos;
- transcrição;
- voz/TTS;
- música;
- 3D.

As tarefas pesadas ficam no ALTIV Media Worker, permitindo conectar ComfyUI, Wan, rembg, Real-ESRGAN, GFPGAN, Whisper, OpenVoice, MusicGen, TRELLIS e outros motores sem transformar a extensão em um pacote gigantesco.

## Bases arquiteturais estudadas

**OpenMinis (GPLv3):** usamos conceitos de skills sob demanda, memória persistente, workspaces e ferramentas. Não copiamos código GPL para manter a extensão comercial independente.

**AnythingLLM (MIT):** conceitos de agentes, workspaces, contexto persistente e ferramentas são compatíveis com uso comercial; qualquer trecho copiado no futuro deve preservar o aviso MIT.

**LLM Hub (PolyForm Noncommercial):** apenas ideias de experiência multimodal e roteamento de ferramentas. O código não é incorporado ao ALTIV comercial sem licença específica.

**Continue (Apache 2.0):** conceitos de agente de código, seleção de contexto e revisão; uso comercial é permitido observando atribuições/licença quando houver cópia de código.

## Lovable

O caminho seguro é Git-first: a extensão altera e envia para o GitHub. Um projeto Lovable conectado ao mesmo repositório acompanha as atualizações. A extensão também pode abrir diretamente a URL do projeto Lovable.

## Instalação

1. Extraia o ZIP.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta extraída.
6. Clique no ícone **ALTIV Studio** para abrir o painel lateral.

## Segurança

Use tokens e chaves com o menor privilégio possível. Eles ficam no armazenamento local da extensão e não devem ser commitados nos projetos.
