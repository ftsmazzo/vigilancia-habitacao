import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  consultarRag,
  ragBaseUrl,
  ragKnowledgeBaseId
} from "../utils/ragClient.js";
import { resolveOpenAiModel } from "../utils/openaiModel.js";

const router = Router();

const SYSTEM_PROMPT = `Voce e um agente de Vigilancia Socioassistencial, especialista no SUAS (Sistema Unico de Assistencia Social) e no que diz respeito a politicas, programas e registro de atendimentos em assistencia social no Brasil.

Sua funcao e ajudar em:
- leitura e analise de dados operacionais (indicadores, totais, recortes por periodo e unidade);
- redacao e estruturacao de trechos para relatorios, minutas, oficios e memorandos da assistencia social;
- explicacao de indicadores RMA e coerencia entre dados municipais e o arcabouco legal e tecnico do SUAS.

Base normativa e tecnica (sempre que houver trechos recuperados abaixo):
A base indexada contem, entre outros: LOAS (Lei 8.742/1993 e alteracoes); NOB/SUAS (normas operacionais basicas, incl. marcos de 2005 e 2012); NOB-RH/SUAS (gestao de recursos humanos); Tipificacao Nacional dos Servicos Socioassistenciais (Resolucao CNAS 109/2009); PNAS 2004 (Politica Nacional de Assistencia Social).
Esses trechos sao a fundacao teorica e normativa das suas respostas: alinhe conceitos, definicoes de servicos, encargos e marcos legais a eles quando aplicavel. Nao substitua o rigor normativo por suposicoes.

Regras:
1) "Contexto operacional" traz dados factuais (painel RMA, notas). Numeros, periodos e unidades vêm daí — trate como prioridade para a parte empirica.
2) Os trechos da base normativa (RAG) fundamentam a parte conceitual, juridica e de diretrizes. Integre-os com os dados operacionais (ex.: relacionar indicadores a tipificacao de servicos ou aos eixos da politica quando couber).
3) Se os trechos recuperados forem insuficientes ou a busca falhar, diga isso com clareza e nao simule citacao de norma.
4) Em caso de conflito aparente entre dado operacional pontual e norma geral, explique a ressalva (escopo do indicador, nivel de governo, vigencia) sem descartar o dado sem motivo.
5) Responda em portugues, tom profissional e objetivo.
6) Nao invente cifras nem artigos de lei: use apenas o contexto operacional e os trechos fornecidos.`;

const RAG_QUERY_SYSTEM = `Voce gera exclusivamente uma consulta em portugues para busca semantica em uma base documental do SUAS.

A base contem documentos como: LOAS (Lei 8.742/1993); NOB/SUAS (2005 e 2012); NOB-RH/SUAS; Tipificacao Nacional dos Servicos Socioassistenciais (Resolucao CNAS 109/2009); PNAS 2004.

Tarefa: combinar o pedido do usuario com o resumo do contexto operacional (RMA, periodo, unidade, notas) para formular UMA pergunta ou conjunto de termos que maximizem a recuperacao de trechos juridicos, conceituais ou de diretrizes pertinentes — inclusive servicos tipicos (CRAS, CREAS, Centro POP, SCFV, PAIF, PAEFI etc.) quando aparecerem no pedido ou no contexto.

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
function buildHintForRagQuery(contextoPainel) {
  if (!contextoPainel || typeof contextoPainel !== "object") {
    return "(Sem resumo de contexto operacional.)";
  }
  const partes = [];
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

async function gerarConsultaRag({ message, contextoPainel }) {
  const hint = buildHintForRagQuery(contextoPainel);
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
  const temperature = opts.temperature ?? 0.35;
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

    let ragBodyParaCliente = null;
    let ragErro = null;
    let ragQueryUsada = null;

    const ragDisponivel = Boolean(process.env.RAG_API_KEY?.trim());
    if (ragDisponivel) {
      try {
        ragQueryUsada = await gerarConsultaRag({ message, contextoPainel });
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

    const userContent = `### Contexto operacional (dados do painel / recorte — prioridade factual)
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

router.get(
  "/status",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  (_req, res) => {
    const resolved = resolveOpenAiModel();
    return res.json({
      ok: true,
      ragConfigured: Boolean(process.env.RAG_API_KEY?.trim()),
      llmConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
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
