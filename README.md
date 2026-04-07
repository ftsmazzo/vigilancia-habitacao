# Vigilância Socioassistencial

Sistema de vigilância socioassistencial para cruzamento de dados CADU com listas de candidatos a empreendimentos habitacionais.

## Estrutura

- `backend/`: API REST (Node.js, Express, Prisma, PostgreSQL)
- `frontend/`: Interface web (React + Vite)
- `docker-compose.yml`: ambiente local completo

## Deploy

O deploy em producao e executado via EasyPanel, com servicos separados:

- Imagem do **backend** usando `backend/Dockerfile`
- Imagem do **frontend** usando `frontend/Dockerfile`

Na subida do container do backend, o schema e o seed rodam automaticamente (`prisma db push` e `node prisma/seed.js` no `CMD` do Dockerfile) — nao e necessario executar Prisma manualmente no EasyPanel.

### Assistente (LLM + RAG como apoio)

- **`OPENAI_API_KEY`** (obrigatório para o fluxo principal): modelo orquestra **contexto operacional** (opcional) + **RAG** (apoio teórico, não fonte única) + **mensagem do usuário**. Endpoint: `POST /api/assistente/chat`.
- **`RAG_API_KEY`** (opcional): busca na base de conhecimento; também `RAG_API_BASE_URL`, `RAG_KNOWLEDGE_BASE_ID` (padrão `4`). Documentação do serviço: [api-docs](https://saas-agentes-sistema-rag.90qhxz.easypanel.host/api-docs).
- **`POST /api/chat-rag/query`**: proxy direto ao RAG (debug/legado).
