# Vigilancia Habitacao

Sistema de Vigilancia Socioassistencial para cruzamento de dados CADU com listas de Habitacao.

## Estrutura

- `backend/`: API REST (Node.js, Express, Prisma, PostgreSQL)
- `frontend/`: Interface web (React + Vite + Tailwind)
- `docker-compose.yml`: ambiente local completo

## Deploy

O deploy em producao e executado via EasyPanel, com servicos separados:

- `backend-habitacao` usando `backend/Dockerfile`
- `frontend-habitacao` usando `frontend/Dockerfile`

As atualizacoes de schema no banco sao executadas automaticamente na inicializacao do backend via `prisma db push`.
