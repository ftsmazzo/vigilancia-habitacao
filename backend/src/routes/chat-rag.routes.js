import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

function ragBaseUrl() {
  return (
    process.env.RAG_API_BASE_URL ||
    "https://saas-agentes-sistema-rag.90qhxz.easypanel.host"
  ).replace(/\/$/, "");
}

function ragKnowledgeBaseId() {
  return String(process.env.RAG_KNOWLEDGE_BASE_ID || "4").trim();
}

/**
 * Proxy para o servico RAG documentado em:
 * https://saas-agentes-sistema-rag.90qhxz.easypanel.host/api-docs
 * POST /api/kb/{id}/query — body: { query, topK }
 */
router.post(
  "/query",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  async (req, res) => {
    const apiKey = process.env.RAG_API_KEY;
    if (!apiKey?.trim()) {
      return res.status(503).json({
        error: true,
        message:
          "Assistente RAG nao configurado. Defina RAG_API_KEY no ambiente do backend.",
        code: "RAG_NOT_CONFIGURED"
      });
    }

    const query = String(req.body?.query ?? "").trim();
    if (!query) {
      return res.status(400).json({
        error: true,
        message: "Informe a pergunta (campo query)",
        code: "RAG_QUERY_EMPTY"
      });
    }
    if (query.length > 12000) {
      return res.status(400).json({
        error: true,
        message: "Texto da pergunta muito longo",
        code: "RAG_QUERY_TOO_LONG"
      });
    }

    const topKRaw = req.body?.topK;
    const topK = Math.min(
      20,
      Math.max(1, Number.isFinite(Number(topKRaw)) ? Number(topKRaw) : 5)
    );

    const idKb = ragKnowledgeBaseId();
    const url = `${ragBaseUrl()}/api/kb/${idKb}/query`;

    let upstream;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({ query, topK })
      });
    } catch (e) {
      console.error("RAG fetch error:", e);
      return res.status(502).json({
        error: true,
        message: "Nao foi possivel contatar o servico RAG",
        code: "RAG_NETWORK_ERROR"
      });
    }

    const rawText = await upstream.text();
    let body;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return res.status(502).json({
        error: true,
        message: "Resposta invalida do servico RAG",
        code: "RAG_INVALID_RESPONSE"
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
        error: true,
        message:
          body?.message ||
          body?.error ||
          `Servico RAG retornou erro (${upstream.status})`,
        code: "RAG_UPSTREAM_ERROR",
        detalhe: body
      });
    }

    return res.json(body);
  }
);

router.get(
  "/status",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  (_req, res) => {
    const configured = Boolean(process.env.RAG_API_KEY?.trim());
    return res.json({
      ok: true,
      ragConfigured: configured,
      knowledgeBaseId: ragKnowledgeBaseId(),
      baseUrl: ragBaseUrl()
    });
  }
);

export default router;
