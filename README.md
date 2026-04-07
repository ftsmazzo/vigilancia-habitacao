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
