# ALTIV Studio Extension v1

Extensão Chrome/Chromium para criar e editar projetos GitHub com IA e disparar deploys.

## Recursos

- conecta ao GitHub por token;
- lista repositórios e arquivos;
- cria repositório;
- usa OpenAI, OpenRouter ou Gemini;
- gera um plano de alterações e grava arquivos no GitHub;
- modo seguro Branch + Pull Request;
- modo commit direto;
- hooks de deploy para Vercel, Netlify, Render, Railway e webhook customizado;
- integração de mídia opcional via ALTIV Media Worker;
- atalho para abrir o projeto Lovable;
- arquitetura preparada para skills, memória, jobs e agentes especializados.

## Lovable

A integração correta é Git-first: a extensão faz commit/push no GitHub. Se o projeto estiver conectado ao Lovable, o Lovable acompanha o repositório. A extensão não finge uma API de push direto que não exista.

## Instalação manual

1. Baixe o ZIP da release.
2. Extraia a pasta.
3. Abra `chrome://extensions`.
4. Ative **Modo do desenvolvedor**.
5. Clique em **Carregar sem compactação**.
6. Escolha a pasta extraída.
7. Clique no ícone ALTIV Studio para abrir o painel lateral.

## Segurança

Use token GitHub com o menor escopo necessário. As chaves ficam em `chrome.storage.local` e nunca devem ser commitadas no repositório.

## Arquitetura

A extensão usa ideias de agentes de código, skills e workflows dos projetos estudados pelo ALTIV, mas não copia automaticamente código/modelos de terceiros. Integrações pesadas de imagem/vídeo/áudio/3D ficam atrás do ALTIV Media Worker.
