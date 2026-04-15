import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  consultarRag,
  ragBaseUrl,
  ragKnowledgeBaseId
} from "../utils/ragClient.js";
import { resolveOpenAiModel } from "../utils/openaiModel.js";
import {
  getMunicipioPerfilAtivo,
  formatMunicipioPerfilForPrompt,
  resumoMunicipioParaRag
} from "../services/municipioPerfil.service.js";
import { prisma } from "../utils/prisma.js";

const router = Router();

async function loadRmaCrasIndicadoresLegenda() {
  return prisma.rmaIndicadorDef.findMany({
    orderBy: [{ ordem: "asc" }]
  });
}

function buildRmaRecorteGuiaParaIALegenda(defs) {
  if (!defs?.length) {
    return "(Legenda de indicadores RMA ainda nao cadastrada no banco — interprete os codigos a1…d8 apenas como metricas da matriz oficial RMA CRAS.)";
  }
  return defs
    .map((r) => {
      const g = r.grupo ? ` | grupo: ${r.grupo}` : "";
      return `- **${r.codigo}** — ${r.rotulo}${g}`;
    })
    .join("\n");
}

function buildRmaRecorteGuiaParaIA(defs) {
  const estrutura = `### Estrutura do recorte RMA (contextoPainel.recorteRma)

Este bloco explica os campos enviados junto com os numeros do painel RMA CRAS.

**recorteRma.tipo / titulo** — Origem do recorte (ex.: rma-cras / RMA CRAS).

**recorteRma.filtros**
- **ano**: ano de referencia.
- **mes**: mes (1-12) ou a string **TODOS** quando a visao e **anual agregada** (soma dos meses do ano).
- **idCras** / **unidade**: se preenchidos, o recorte esta **restrito** a essa unidade; se nulos, **municipio inteiro** no periodo.

**recorteRma.overview** — Dados alinhados ao overview RMA:
- **agregacao**: "mes" (um mes) ou "ano" (todos os meses do ano somados — fluxos de **producao** mensal agregados).
- **periodo**: ano, mes (se houver), limites de datas.
- **quantidadeCras**: quantas unidades entram no recorte.
- **totaisMunicipio**: objeto com chaves **a1…d8** — indicadores da matriz RMA no periodo. Cada chave corresponde a um indicador (ver legenda abaixo).
- **derivados**: indicadores **calculados** (ex.: encaminhamentos CadUnico C.2+C.3, razoes, medias por CRAS).
- **porCras**: mesmas metricas **por unidade** (idCras, nome, valores a1…d8 por CRAS).
- **aviso**: alertas de leitura (ex.: indicadores de **estoque** que nao devem ser interpretados como soma anual).

**contextoPainel.notasLivres** — Observacoes digitadas pelo usuario no chat.

Use esta estrutura para interpretar o JSON; nao confunda producao RMA agregada no ano com **estoque** do Cadastro Unico salvo quando o aviso alertar.

`;

  const legenda = buildRmaRecorteGuiaParaIALegenda(defs);
  return `${estrutura}\n### Legenda dos codigos da matriz (RMA CRAS)\n\n${legenda}`;
}

const SYSTEM_PROMPT = `Voce e uma assistente social de formacao tecnica e aprofundada no SUAS (Sistema Unico de Assistencia Social) e na vigilancia socioassistencial no Brasil. Fala com colegas de rede, gestores e equipes de territorio: tom acolhedor, claro e profissional — como em uma conversa de trabalho bem fundamentada, nao como manual frio nem como relatorio de auditoria.

O que voce faz bem:
- Ler e interpretar dados operacionais (indicadores, RMA, recortes por periodo e unidade, Cadastro Unico no recorte disponivel).
- Redigir trechos para relatorios, minutas e comunicacoes da assistencia social com rigor e linguagem humana.
- Explicar indicadores e articular dado local, producao SUAS e marco normativo quando fizer sentido.

Como usar as informacoes que chegam na mensagem (perfil do municipio, painel, base normativa):
- Trate tudo isso como material de apoio interno ao seu raciocinio. Incorpore nomes, enderecos, numeros e definicoes na resposta de forma natural, como quem ja conhece o territorio e a rotina da rede.
- Nao exponha a estrutura tecnica do prompt ao usuario. Evite expressoes do tipo: "de acordo com o perfil territorial", "conforme o trecho abaixo", "nos dados fornecidos", "no bloco", "na base indexada", "segundo o contexto operacional". Nao reproduza paragrafos inteiros entre aspas ou em bloco de citacao apenas para "provar" a fonte.
- Para perguntas objetivas (ex.: quem e a responsavel por um CRAS), responda de forma direta e cordial; um breve complemento util (contato, horario) pode vir em seguida se estiver no material — sem meta-comentario sobre de onde veio.
- Fundamentacao legal (lei, resolucao, artigo): traga quando a pergunta for juridica, quando houver risco de interpretacao equivocada ou quando o usuario pedir explicitamente a base legal. No dia a dia operativo, priorize clareza sem citar capitulos inteiros.
- Se faltar dado no material de apoio, diga com honestidade e sem jargao de sistema (ex.: "nao tenho essa informacao no cadastro consultado aqui; vale confirmar com a coordenacao" em vez de "o bloco de perfil nao contem").
- Se a busca na base normativa falhar ou vier vazia, nao simule citacao de norma; pode orientar de forma geral com ressalva.

Prioridades entre fontes:
- Dados do painel/recorte e notas do usuario: prioridade para fatos do periodo e da unidade em analise.
- Perfil municipal (rede, IBGE, Cadastro no recorte importado): escala, territorio e referencias locais; nao contradiga producao RMA sem explicar a diferenca (cadastro vs producao do mes).
- Trechos normativos recuperados: conceito, dever, tipificacao de servico; integre com a realidade local quando couber.

Limites eticos:
- Nao invente cifras, nomes de pessoas, cargos, enderecos nem artigos de lei que nao estejam no material de apoio ou na sua formacao geral segura. Se inferir algo, deixe claro que e inferencia.
- Responda em portugues do Brasil.`;

const RAG_QUERY_SYSTEM = `Voce gera exclusivamente uma consulta em portugues para busca semantica em uma base documental do SUAS.

A base contem documentos como: LOAS (Lei 8.742/1993); NOB/SUAS (2005 e 2012); NOB-RH/SUAS; Tipificacao Nacional dos Servicos Socioassistenciais (Resolucao CNAS 109/2009); PNAS 2004.

Tarefa: combinar o pedido do usuario com o resumo do contexto (municipio em foco, RMA, periodo, unidade, notas) para formular UMA pergunta ou conjunto de termos que maximizem a recuperacao de trechos juridicos, conceituais ou de diretrizes pertinentes — inclusive servicos tipicos (CRAS, CREAS, Centro POP, SCFV, PAIF, PAEFI etc.) quando aparecerem no pedido ou no contexto.

Regras de saida:
- Responda somente com o texto da consulta, sem aspas, sem markdown, sem numeracao.
- No maximo 600 caracteres.
- Priorize conceitos normativos e do SUAS, nao repita tabelas de numeros do RMA (eles ja vao em outro bloco).`;

/** Extrai recorte RMA de { recorteRma } ou formato legado plano. */
function extrairRecorteRma(contextoPainel) {
  if (!contextoPainel || typeof contextoPainel !== "object") return null;
  if (contextoPainel.recorteRma) return contextoPainel.recorteRma;
  if (contextoPainel.overview != null || contextoPainel.dadosPainel != null) {
    return contextoPainel;
  }
  return null;
}

function formatContextoPainel(contextoPainel) {
  if (contextoPainel == null || contextoPainel === "") {
    return "(Nenhum contexto operacional enviado nesta mensagem.)";
  }
  if (typeof contextoPainel === "string") {
    return contextoPainel.trim().slice(0, 24000);
  }
  if (typeof contextoPainel === "object") {
    const partes = [];
    const notas = contextoPainel.notasLivres;
    if (notas != null && String(notas).trim()) {
      partes.push("### Notas adicionais do usuario\n" + String(notas).trim());
    }
    const r = extrairRecorteRma(contextoPainel);
    if (r) {
      const overview = r.overview ?? r.dadosPainel;
      const meta = {
        tipo: r.tipo,
        titulo: r.titulo,
        filtros: r.filtros
      };
      partes.push(
        "### Recorte painel RMA (dados factuais — prioridade)\n" +
          JSON.stringify({ meta, overview }, null, 2).slice(0, 22000)
      );
    }
    if (partes.length) return partes.join("\n\n").slice(0, 24000);
    try {
      return JSON.stringify(contextoPainel, null, 2).slice(0, 24000);
    } catch {
      return String(contextoPainel).slice(0, 24000);
    }
  }
  return String(contextoPainel).slice(0, 24000);
}

/** Resumo curto para o modelo que formula a consulta ao RAG (sem repetir tabelas). */
function buildHintForRagQuery(contextoPainel, perfilMunicipio) {
  const linhaMun = perfilMunicipio ? resumoMunicipioParaRag(perfilMunicipio) : "";
  if (!contextoPainel || typeof contextoPainel !== "object") {
    return linhaMun || "(Sem resumo de contexto operacional.)";
  }
  const partes = [];
  if (linhaMun) partes.push(linhaMun);
  const notas = contextoPainel.notasLivres;
  if (notas != null && String(notas).trim()) {
    partes.push(`Notas: ${String(notas).trim().slice(0, 500)}`);
  }
  const r = extrairRecorteRma(contextoPainel);
  if (r) {
    partes.push(`Origem: ${r.titulo || r.tipo || "painel RMA"}.`);
    const f = r.filtros || {};
    if (f.ano && f.mes) {
      partes.push(
        f.mes === "TODOS"
          ? `Periodo agregado: ano ${f.ano}.`
          : `Periodo: ${String(f.mes).padStart(2, "0")}/${f.ano}.`
      );
    }
    if (f.unidade) partes.push(`Unidade: ${f.unidade}.`);
    const ov = r.overview ?? r.dadosPainel;
    const tot = ov?.totaisMunicipio;
    if (tot && typeof tot === "object") {
      const chaves = Object.keys(tot).slice(0, 12);
      partes.push(`Chaves de indicadores no recorte: ${chaves.join(", ")}.`);
    }
  }
  return partes.length ? partes.join(" ") : "(Sem resumo de contexto operacional.)";
}

async function gerarConsultaRag({ message, contextoPainel, perfilMunicipio }) {
  const hint = buildHintForRagQuery(contextoPainel, perfilMunicipio);
  try {
    const { text } = await openaiChatCompletions(
      [
        { role: "system", content: RAG_QUERY_SYSTEM },
        {
          role: "user",
          content: `### Pedido do usuario\n${message}\n\n### Contexto operacional (resumo)\n${hint}`
        }
      ],
      { max_tokens: 400, temperature: 0.15 }
    );
    const q = String(text)
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^\s*consulta:\s*/i, "")
      .slice(0, 800);
    if (q.length >= 15) return q;
  } catch (e) {
    console.warn("gerarConsultaRag:", e?.message || e);
  }
  return `${message}\n\n${hint}`.trim().slice(0, 8000);
}

function formatRagForPrompt(ragBody) {
  if (!ragBody?.success || !ragBody?.data) {
    return "(RAG nao retornou dados nesta rodada ou esta indisponivel.)";
  }
  const d = ragBody.data;
  const parts = [];
  if (d.answer) {
    parts.push(`Sintese da busca na base: ${String(d.answer).slice(0, 6000)}`);
  }
  if (Array.isArray(d.sources) && d.sources.length) {
    parts.push("Trechos da base normativa (fundamentacao tecnica e juridica):");
    d.sources.slice(0, 8).forEach((s, i) => {
      const nome = s.filename || s.documentId || `Doc ${i + 1}`;
      const sim = s.similarity != null ? ` (similaridade ${Number(s.similarity).toFixed(2)})` : "";
      const trecho = String(s.content || "").slice(0, 1200);
      parts.push(`--- [${i + 1}] ${nome}${sim} ---\n${trecho}`);
    });
  }
  return parts.length ? parts.join("\n\n") : "(RAG sem trechos uteis.)";
}

async function openaiChatCompletions(messages, opts = {}) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    const err = new Error("OPENAI_API_KEY ausente");
    err.code = "LLM_NOT_CONFIGURED";
    throw err;
  }

  const model = resolveOpenAiModel();
  const temperature = opts.temperature ?? 0.4;
  const max_tokens = opts.max_tokens ?? 4096;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens
    })
  });

  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    const err = new Error("Resposta invalida do OpenAI");
    err.code = "LLM_INVALID_JSON";
    throw err;
  }

  if (!res.ok) {
    const err = new Error(json?.error?.message || `OpenAI HTTP ${res.status}`);
    err.code = "LLM_UPSTREAM";
    err.detalhe = json;
    throw err;
  }

  const text = json?.choices?.[0]?.message?.content;
  if (text == null) {
    const err = new Error("Resposta do modelo vazia");
    err.code = "LLM_EMPTY";
    throw err;
  }

  return { text: String(text), model, usage: json.usage };
}

router.post(
  "/chat",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  async (req, res) => {
    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      return res.status(400).json({
        error: true,
        message: "Informe a mensagem (campo message)",
        code: "ASSISTENTE_MESSAGE_EMPTY"
      });
    }
    if (message.length > 12000) {
      return res.status(400).json({
        error: true,
        message: "Mensagem muito longa",
        code: "ASSISTENTE_MESSAGE_TOO_LONG"
      });
    }

    const contextoPainel = req.body?.contextoPainel;
    const ragTopK = Math.min(
      15,
      Math.max(1, Number(req.body?.ragTopK) || 5)
    );

    const perfilMunicipio = await getMunicipioPerfilAtivo();

    let ragBodyParaCliente = null;
    let ragErro = null;
    let ragQueryUsada = null;

    const ragDisponivel = Boolean(process.env.RAG_API_KEY?.trim());
    if (ragDisponivel) {
      try {
        ragQueryUsada = await gerarConsultaRag({
          message,
          contextoPainel,
          perfilMunicipio
        });
      } catch (e) {
        ragQueryUsada = message.slice(0, 8000);
        console.warn("gerarConsultaRag falhou, usando pedido bruto:", e?.message);
      }
      const ragResult = await consultarRag({
        query: ragQueryUsada,
        topK: ragTopK
      });
      if (ragResult.ok) {
        ragBodyParaCliente = ragResult.body;
      } else if (ragResult.skip) {
        ragErro = "RAG nao configurado ou consulta vazia";
      } else if (ragResult.networkError) {
        ragErro = "Falha de rede ao consultar RAG";
      } else {
        ragErro = `RAG retornou erro (${ragResult.status || "?"})`;
      }
    } else {
      ragErro = "RAG_API_KEY nao configurada no servidor — base normativa nao foi consultada nesta rodada.";
    }

    let blocoRag;
    if (ragBodyParaCliente?.success && ragBodyParaCliente?.data) {
      blocoRag = formatRagForPrompt(ragBodyParaCliente);
    } else {
      blocoRag = `(Base normativa indisponivel nesta rodada: ${ragErro || "sem dados"}. Responda com ressalva; nao simule citacoes de norma.)`;
    }

    const blocoPerfil = formatMunicipioPerfilForPrompt(perfilMunicipio);

    const userContent = `Use o material abaixo como apoio interno; responda ao pedido de forma natural, sem mencionar estas secoes nem citar "fontes" ou "trechos" ao usuario.

### Perfil territorial e institucional (municipio em foco — referencia de territorio e escala)
${blocoPerfil}

### Contexto operacional (dados do painel / recorte — prioridade factual)
${formatContextoPainel(contextoPainel)}

### Base normativa e tecnica (trechos recuperados do acervo indexado — fundacao obrigatoria quando houver conteudo)
${blocoRag}

### Pedido do usuario
${message}`;

    try {
      const { text, model, usage } = await openaiChatCompletions([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]);

      const dataRag = ragBodyParaCliente?.data;
      const ragInjetado = Boolean(
        ragBodyParaCliente?.success && ragBodyParaCliente?.data
      );
      return res.json({
        success: true,
        answer: text,
        model,
        usage,
        rag: {
          used: ragInjetado,
          error: ragErro,
          sources: dataRag?.sources ?? null,
          processingTime: dataRag?.processingTime ?? null,
          rawAnswer: dataRag?.answer ?? null
        }
      });
    } catch (e) {
      if (e.code === "LLM_NOT_CONFIGURED") {
        return res.status(503).json({
          error: true,
          message:
            "Modelo de linguagem nao configurado. Defina OPENAI_API_KEY no backend.",
          code: "LLM_NOT_CONFIGURED"
        });
      }
      console.error("Assistente chat error:", e);
      return res.status(500).json({
        error: true,
        message: e.message || "Erro ao gerar resposta",
        code: "ASSISTENTE_LLM_ERROR",
        detalhe: e.detalhe
      });
    }
  }
);

/**
 * Payload enviado ao webhook n8n.
 * Memory Postgres: sessionKey = body.memorySessionKey.
 * Contexto municipal: body.perfilMunicipioContexto (mesmo texto do assistente interno /chat).
 */
async function buildAgenteN8nPayload(req) {
  const mensagem = String(req.body?.mensagem ?? req.body?.message ?? "").trim();
  const sessionIdRaw = req.body?.sessionId;
  const sessionId =
    sessionIdRaw != null && String(sessionIdRaw).trim()
      ? String(sessionIdRaw).trim().slice(0, 128)
      : randomUUID();

  const userId = req.user?.sub != null ? String(req.user.sub) : null;
  const memorySessionKey =
    userId != null ? `${userId}:${sessionId}` : sessionId;

  const metadata =
    req.body?.metadata != null && typeof req.body.metadata === "object"
      ? req.body.metadata
      : undefined;

  const contextoPainel = req.body?.contextoPainel;
  const omitirPerfil =
    req.body?.omitirPerfilMunicipio === true ||
    req.body?.omitirPerfilMunicipio === "true";

  let rmaRecorteGuiaParaIA = null;
  const rr =
    contextoPainel &&
    typeof contextoPainel === "object" &&
    contextoPainel.recorteRma != null
      ? contextoPainel.recorteRma
      : null;
  if (rr && (rr.tipo === "rma-cras" || rr.tipo == null)) {
    const defs = await loadRmaCrasIndicadoresLegenda();
    rmaRecorteGuiaParaIA = buildRmaRecorteGuiaParaIA(defs);
  }

  let perfilMunicipioSnapshot = null;
  let perfilMunicipioContexto = "";
  let perfilMunicipioResumo = "";

  if (!omitirPerfil) {
    const perfil = await getMunicipioPerfilAtivo();
    if (perfil) {
      perfilMunicipioSnapshot = {
        id: perfil.id,
        nome: perfil.nome,
        uf: perfil.uf,
        codigoIbge: perfil.codigoIbge,
        atualizadoEm: perfil.atualizadoEm?.toISOString?.() ?? null
      };
      perfilMunicipioContexto = formatMunicipioPerfilForPrompt(perfil);
      perfilMunicipioResumo = resumoMunicipioParaRag(perfil);
    } else {
      perfilMunicipioContexto = formatMunicipioPerfilForPrompt(null);
      perfilMunicipioResumo = resumoMunicipioParaRag(null);
    }
  }

  return {
    mensagem,
    sessionId,
    memorySessionKey,
    userId,
    userEmail: req.user?.email ?? null,
    role: req.user?.role ?? null,
    ...(!omitirPerfil
      ? {
          perfilMunicipioSnapshot,
          perfilMunicipioContexto,
          perfilMunicipioResumo
        }
      : {}),
    ...(metadata ? { metadata } : {}),
    ...(contextoPainel !== undefined ? { contextoPainel } : {}),
    ...(rmaRecorteGuiaParaIA ? { rmaRecorteGuiaParaIA } : {})
  };
}

router.get(
  "/agente-n8n/status",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  (_req, res) => {
    const url = process.env.N8N_AGENTE_VIGILANCIA_WEBHOOK_URL?.trim();
    return res.json({
      ok: true,
      webhookConfigured: Boolean(url),
      hint: url
        ? "Webhook configurado. Use POST /api/assistente/agente-n8n/proxy para testar."
        : "Defina N8N_AGENTE_VIGILANCIA_WEBHOOK_URL no backend.",
      payloadFields: [
        "mensagem (obrigatorio)",
        "sessionId (opcional; UUID v4 se vazio — reutilize o mesmo para multi-turn)",
        "metadata (opcional, objeto)",
        "contextoPainel (opcional; mesmo formato do assistente interno)",
        "omitirPerfilMunicipio (opcional; true = payload menor, sem contexto do municipio)"
      ],
      injectedByServer: [
        "userId",
        "userEmail",
        "role",
        "memorySessionKey (userId:sessionId — Postgres Chat Memory no n8n)",
        "perfilMunicipioSnapshot (nome, uf, codigoIbge, atualizadoEm — null se sem cadastro)",
        "perfilMunicipioContexto (texto longo; igual formatMunicipioPerfilForPrompt do /assistente/chat)",
        "perfilMunicipioResumo (uma linha; util para logs ou cabecalho curto no n8n)",
        "rmaRecorteGuiaParaIA (texto; so quando recorteRma.tipo e rma-cras — estrutura + legenda a1…d8 do banco)"
      ],
      n8nHint:
        "No Supervisor, injeta no user message ou system: o bloco perfilMunicipioContexto + mensagem + contextoPainel. Numeros cadastrais finos continuam no AgenteSQL."
    });
  }
);

router.post(
  "/agente-n8n/proxy",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  async (req, res) => {
    const url = process.env.N8N_AGENTE_VIGILANCIA_WEBHOOK_URL?.trim();
    if (!url) {
      return res.status(503).json({
        error: true,
        code: "N8N_WEBHOOK_NOT_CONFIGURED",
        message:
          "N8N_AGENTE_VIGILANCIA_WEBHOOK_URL nao definida no servidor."
      });
    }

    const payload = await buildAgenteN8nPayload(req);
    if (!payload.mensagem) {
      return res.status(400).json({
        error: true,
        code: "N8N_PROXY_MESSAGE_EMPTY",
        message: "Informe mensagem (ou message) no corpo JSON."
      });
    }

    const secret = process.env.N8N_AGENTE_VIGILANCIA_WEBHOOK_SECRET?.trim();
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain;q=0.9,*/*;q=0.8"
    };
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    const timeoutMs = Math.min(
      180000,
      Math.max(5000, Number(process.env.N8N_AGENTE_VIGILANCIA_TIMEOUT_MS) || 120000)
    );
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    let upstreamStatus = 0;
    let upstreamText = "";
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: ac.signal
      });
      upstreamStatus = upstream.status;
      upstreamText = await upstream.text();
    } catch (e) {
      clearTimeout(timer);
      const aborted = e?.name === "AbortError";
      return res.status(504).json({
        error: true,
        code: aborted ? "N8N_PROXY_TIMEOUT" : "N8N_PROXY_NETWORK",
        message: aborted
          ? `Tempo esgotado apos ${timeoutMs}ms ao chamar o webhook n8n.`
          : e?.message || "Falha de rede ao chamar o webhook n8n.",
        durationMs: Date.now() - started,
        sentPayload: payload
      });
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - started;
    let parsed = null;
    if (upstreamText) {
      try {
        parsed = JSON.parse(upstreamText);
      } catch {
        parsed = null;
      }
    }

    return res.status(200).json({
      success: upstreamStatus >= 200 && upstreamStatus < 300,
      upstreamStatus,
      durationMs,
      sentPayload: payload,
      response: parsed != null ? { json: parsed } : { raw: upstreamText }
    });
  }
);

router.get(
  "/status",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  async (_req, res) => {
    const resolved = resolveOpenAiModel();
    const perfil = await getMunicipioPerfilAtivo();
    return res.json({
      ok: true,
      ragConfigured: Boolean(process.env.RAG_API_KEY?.trim()),
      llmConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      municipioPerfilConfigured: Boolean(perfil),
      municipioResumo: perfil
        ? { nome: perfil.nome, uf: perfil.uf, codigoIbge: perfil.codigoIbge }
        : null,
      knowledgeBaseId: ragKnowledgeBaseId(),
      baseUrl: ragBaseUrl(),
      openaiModel: resolved,
      openaiModelEnv: process.env.OPENAI_MODEL?.trim() || null,
      openaiModelHint:
        process.env.OPENAI_MODEL?.trim() &&
        process.env.OPENAI_MODEL.trim() !== resolved
          ? `Valor em OPENAI_MODEL foi normalizado para "${resolved}" (use sempre o ID completo na OpenAI, ex.: gpt-4.1).`
          : null
    });
  }
);

export default router;
