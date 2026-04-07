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
- explicacao de indicadores RMA e coerencia com o contexto fornecido;

Regras:
1) "Contexto operacional" traz dados que o usuario colou ou que vieram do painel RMA (filtros, overview, totais). Trate como referencia factual prioritaria quando presente.
2) "Material de apoio (RAG)" e busca semantica em documentos da organizacao. Use como complemento teorico ou normativo — nunca como unica fonte. Se nao for pertinente, ignore ou cite com ressalva.
3) Em caso de conflito entre contexto operacional e trechos do RAG, priorize o contexto operacional datado e explique a ressalva.
4) Responda em portugues, tom profissional e objetivo, adequado a gestao e vigilancia socioassistencial.
5) Nao invente cifras, normas ou enderecos: se nao existirem no contexto nem no material de apoio, declare que nao ha informacao suficiente.`;

function formatContextoPainel(contextoPainel) {
  if (contextoPainel == null || contextoPainel === "") {
    return "(Nenhum contexto operacional enviado nesta mensagem.)";
  }
  if (typeof contextoPainel === "string") {
    return contextoPainel.trim().slice(0, 24000);
  }
  try {
    return JSON.stringify(contextoPainel, null, 2).slice(0, 24000);
  } catch {
    return String(contextoPainel).slice(0, 24000);
  }
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
    parts.push("Trechos e referencias (use como apoio, nao como unica fonte):");
    d.sources.slice(0, 8).forEach((s, i) => {
      const nome = s.filename || s.documentId || `Doc ${i + 1}`;
      const sim = s.similarity != null ? ` (similaridade ${Number(s.similarity).toFixed(2)})` : "";
      const trecho = String(s.content || "").slice(0, 1200);
      parts.push(`--- [${i + 1}] ${nome}${sim} ---\n${trecho}`);
    });
  }
  return parts.length ? parts.join("\n\n") : "(RAG sem trechos uteis.)";
}

async function openaiChatCompletions(messages) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    const err = new Error("OPENAI_API_KEY ausente");
    err.code = "LLM_NOT_CONFIGURED";
    throw err;
  }

  const model = resolveOpenAiModel();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: 4096
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
    const usarRag = req.body?.usarRag !== false;
    const ragTopK = Math.min(
      15,
      Math.max(1, Number(req.body?.ragTopK) || 5)
    );

    let ragBodyParaCliente = null;
    let ragErro = null;

    if (usarRag) {
      const ragResult = await consultarRag({
        query: message.slice(0, 8000),
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
    }

    let blocoRag;
    if (!usarRag) {
      blocoRag = "(Busca RAG desativada pelo usuario nesta mensagem.)";
    } else if (ragBodyParaCliente?.success && ragBodyParaCliente?.data) {
      blocoRag = formatRagForPrompt(ragBodyParaCliente);
    } else {
      blocoRag = `(RAG nao aplicado nesta rodada: ${ragErro || "sem dados"}. Use o contexto operacional e o pedido do usuario.)`;
    }

    const userContent = `### Contexto operacional (dados do painel / recorte — prioridade factual)
${formatContextoPainel(contextoPainel)}

### Material de apoio teorico (base RAG — nao e fonte exclusiva)
${blocoRag}

### Pedido do usuario
${message}`;

    try {
      const { text, model, usage } = await openaiChatCompletions([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]);

      const dataRag = ragBodyParaCliente?.data;
      const ragInjetado =
        usarRag &&
        Boolean(ragBodyParaCliente?.success && ragBodyParaCliente?.data);
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
