# Sistema de Vigilancia Socioassistencial

Guia inicial para implementacao do projeto de cruzamento CADU x Habitacao (Ribeirao Preto - SP), com foco em entrega rapida de MVP funcional.

## 1) Objetivo funcional do MVP

Permitir que:

- Assistencia Social faca upload da base CADU periodicamente.
- Habitacao crie empreendimentos, suba lista de candidatos e execute cruzamento por CPF.
- Sistema retorne lista enriquecida com classificacao:
  - `NAO_ENCONTRADO` (nao existe no CADU),
  - `DESATUALIZADO` (data CADU vencida),
  - `ATUALIZADO` (cadastro dentro do prazo).

Regra oficial de atualizacao:

- Usar `d.dat_atual_fam` comparado com a data atual do sistema.
- Desatualizado quando ultrapassar 24 meses (ajustavel por variavel de ambiente).

## 2) Decisoes tecnicas iniciais

Para equilibrar rapidez e robustez:

- Backend: `Node.js + NestJS + Prisma + PostgreSQL`
- Frontend: `React + Vite + Tailwind`
- Auth: `JWT access + refresh token`
- Fila: `BullMQ + Redis` (importacao e cruzamentos em background)
- Upload: `Multer`
- Parser arquivos:
  - CADU: `csv-parse` (streaming com separador `;`)
  - Habitacao: `xlsx` para `.xls/.xlsx` com cabecalho multi-linha
- Documentacao API: Swagger (`@nestjs/swagger`)
- Infra: Docker Compose para dev local
- Deploy: EasyPanel (api, web, postgres e redis)

## 3) Regras de negocio consolidadas

## 3.1 Cruzamento

- Cruzar pelo CPF da pessoa (`p.num_cpf_pessoa`) em toda base CADU.
- Nao presumir que o CPF da lista seja do Responsavel Familiar.
- Um CPF pode aparecer em varios empreendimentos.

## 3.2 Normalizacao de CPF (obrigatorio)

Aplicar em qualquer entrada (CADU e Habitacao):

1. Remover tudo que nao for numero.
2. Se comprimento < 11, completar com zeros a esquerda (`padStart(11, '0')`).
3. Se resultado final != 11, marcar erro de importacao.

## 3.3 Base CADU

- Upload substitui/atualiza base vigente via upsert por CPF da pessoa.
- Sem historico de versoes (snapshot): sempre manter estado atual.
- Apos novo upload, disparar recross de empreendimentos (job em fila) ou permitir recross manual por empreendimento.

## 3.4 Visibilidade LGPD

- Perfil `HABITACAO` nao acessa consulta livre da base CADU.
- Exibir somente dados dos CPFs enviados na lista daquele empreendimento.
- Mascara de CPF na interface por padrao (mostrar completo apenas quando necessario e com trilha de auditoria).

## 4) Modelo de dados (MVP)

## 4.1 Entidades principais

- `Usuario`
- `Empreendimento`
- `PreSelecionado` (lista da Habitacao vinculada ao empreendimento)
- `CaduPessoa` (registro por pessoa para cruzamento CPF)
- `DadosCruzados`
- `LogAuditoria`

## 4.2 Campos minimos sugeridos

### `CaduPessoa`

- `cpf` (unico, normalizado)
- `nomePessoa` (`p.nom_pessoa`)
- `nisPessoa` (`p.num_nis_pessoa_atual`)
- `codFamiliarFam` (`p.cod_familiar_fam`)
- `dataAtualFam` (`d.dat_atual_fam`)
- `recebePbfFam` (`d.marc_pbf`)
- `recebePbfPessoa` (`p.marc_pbf`)
- `rendaPerCapitaFam` (`d.vlr_renda_media_fam`)
- `composicaoFamiliar` (`d.qtd_pessoas_domic_fam`)
- `moradiaJson` (subset de campos `d.*` para fase 2)
- `origemRefCad` (`p.ref_cad` / `d.ref_cad`)
- `importadoEm`

### `PreSelecionado`

- `empreendimentoId`
- `cpf` (normalizado)
- `nomeInformado`
- `nisInformado`
- `dataAtualizacaoInscricao` (vinda da planilha Habitacao)
- `camposOriginaisPlanilha` (JSON)
- `statusCruzamento` (`PENDENTE`, `NAO_ENCONTRADO`, `ENCONTRADO`)
- `statusVigilancia` (`NAO_ENCONTRADO`, `DESATUALIZADO`, `ATUALIZADO`)
- `motivoStatus` (texto curto)
- `cruzadoEm`

Constraint obrigatoria:

- Unicidade por empreendimento: `@@unique([empreendimentoId, cpf])`

## 5) Ingestao de arquivos

## 5.1 CADU (`CECAD/tudo.csv`)

- Separador: `;`
- Estrategia:
  - Streaming linha a linha.
  - Mapear colunas essenciais (`d.*` e `p.*`).
  - Normalizar CPF.
  - Upsert em `CaduPessoa`.
- Retorno de processamento:
  - `{ inseridos, atualizados, erros, total, ignoradosCpfInvalido }`

## 5.2 Planilha Habitacao (`.xls` "contaminada")

- Estrategia recomendada:
  - Ler com `xlsx`.
  - Ignorar linhas visuais/titulos.
  - Identificar cabecalho real de colunas (linha de subcolunas).
  - Mapear por nome normalizado de coluna, nao por indice fixo.
  - Converter datas Excel serial para ISO.
  - Normalizar CPF.
  - Persistir `camposOriginaisPlanilha` para rastreabilidade.

Colunas minimas para MVP:

- `CPF Titular` (obrigatoria)
- `Nome Titular` (opcional)
- `NIS` (opcional)
- `Data Atualizacao Inscricao` (opcional)
- Contatos (opcionais)

## 6) Regras de classificacao de vigilancia

Para cada pre-selecionado:

1. Sem match por CPF em `CaduPessoa`:
   - `statusCruzamento = NAO_ENCONTRADO`
   - `statusVigilancia = NAO_ENCONTRADO`
2. Com match:
   - `statusCruzamento = ENCONTRADO`
   - Calcular diferenca entre hoje e `dataAtualFam`
   - Se > 24 meses: `DESATUALIZADO`
   - Senao: `ATUALIZADO`
3. Gravar `DadosCruzados` com:
   - dados CADU relevantes,
   - campos adicionais editaveis da Habitacao.

## 7) Endpoints MVP (ordem de entrega)

1. Auth
   - `POST /api/auth/login`
   - `POST /api/auth/refresh`
   - `POST /api/auth/logout`
2. Admin CADU
   - `POST /api/cadu/upload`
   - `GET /api/cadu/status`
3. Empreendimentos
   - `POST /api/empreendimentos`
   - `GET /api/empreendimentos`
   - `GET /api/empreendimentos/:id`
4. Lista Habitacao
   - `POST /api/empreendimentos/:id/pre-selecionados/upload`
   - `GET /api/empreendimentos/:id/pre-selecionados`
5. Cruzamento
   - `POST /api/empreendimentos/:id/cruzamento`
   - `GET /api/empreendimentos/:id/cruzamento/resultados`
   - `GET /api/empreendimentos/:id/metricas`

## 8) Metricas do empreendimento

Retornar:

- `totalListados`
- `naoEncontrados`
- `atualizados`
- `desatualizados`
- `percentualCobertura` (encontrados / total)
- `percentualDesatualizados` (desatualizados / encontrados)

## 9) Seguranca minima obrigatoria

- JWT + refresh token com expiracao curta para access token.
- Rate limit no login e upload.
- Validacao de payload com `zod` ou DTO validators.
- Auditoria para:
  - upload CADU,
  - upload lista Habitacao,
  - execucao de cruzamento,
  - edicao de campos adicionais,
  - CRUD de usuarios.
- Erro padronizado:
  - `{ "error": true, "message": "...", "code": "..." }`

## 10) Plano de execucao (sprints curtos)

## Sprint 0 - Bootstrap (1 dia)

- Criar monorepo com `backend/` e `frontend/`.
- Subir Docker Compose local (postgres, redis, api, web).
- Configurar Prisma e migration inicial.
- Criar seed do primeiro admin.

## Sprint 1 - Base funcional backend (2-3 dias)

- Auth e middlewares de role.
- CRUD empreendimentos.
- Endpoint upload CADU com parser streaming.
- Persistencia `CaduPessoa`.

## Sprint 2 - Fluxo Habitacao (2-3 dias)

- Upload `.xls/.xlsx` por empreendimento.
- Parser resiliente de cabecalho multi-linha.
- Lista de pre-selecionados paginada.
- Cruzamento e persistencia de resultados.

## Sprint 3 - Frontend operacional (2-3 dias)

- Login e rotas protegidas.
- Tela empreendimentos.
- Upload lista Habitacao.
- Resultado de cruzamento com filtros e badges.
- Cards de metricas.

## Sprint 4 - Hardening (1-2 dias)

- Logs de auditoria completos.
- Testes de integracao principais.
- Ajustes de performance e UX.

## 11) Checklist para criar o repo e iniciar no EasyPanel

1. Criar repo GitHub vazio.
2. Estrutura inicial:
   - `backend/`, `frontend/`, `docker-compose.yml`, `.env.example`.
3. Provisionar no EasyPanel:
   - PostgreSQL (ja disponivel),
   - Redis (ja disponivel),
   - Servico API,
   - Servico Web.
4. Definir variaveis:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `CADU_ATUALIZACAO_MESES=24`
5. Rodar migrations e seed admin.
6. Publicar primeira versao com:
   - login,
   - upload CADU,
   - criacao de empreendimento,
   - upload lista,
   - cruzamento + metricas.

## 12) Criterio de pronto do MVP

O MVP esta pronto quando:

- Admin sobe `tudo.csv` completo sem travar API.
- Habitacao cria empreendimento e sobe planilha real `.xls`.
- Cruzamento retorna status corretos (`NAO_ENCONTRADO`, `DESATUALIZADO`, `ATUALIZADO`).
- Dashboard de metricas fecha com os resultados.
- Logs de auditoria registram eventos criticos.

