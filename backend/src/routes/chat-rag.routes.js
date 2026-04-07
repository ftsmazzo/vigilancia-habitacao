import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { consultarRag, ragBaseUrl, ragKnowledgeBaseId } from "../utils/ragClient.js";

const router = Router();

/**
 * Proxy direto ao RAG (debug / integracoes legadas).
 * Fluxo principal do usuario: POST /api/assistente/chat (LLM + RAG como apoio).
 */
router.post(
  "/query",
  requireAuth,
  requireRole("MASTER", "ADMIN", "HABITACAO", "VIGILANCIA"),
  async (req, res) => {
    if (!process.env.RAG_API_KEY?.trim()) {
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

    const result = await consultarRag({ query, topK });
    if (result.skip) {
      return res.status(503).json({
        error: true,
        message: "RAG nao configurado",
        code: "RAG_NOT_CONFIGURED"
      });
    }
    if (result.networkError) {
      return res.status(502).json({
        error: true,
        message: "Nao foi possivel contatar o servico RAG",
        code: "RAG_NETWORK_ERROR"
      });
    }
    if (!result.ok) {
      return res
        .status(result.status >= 400 && result.status < 600 ? result.status : 502)
        .json({
          error: true,
          message:
            result.body?.message ||
            result.body?.error ||
            `Servico RAG retornou erro (${result.status})`,
          code: "RAG_UPSTREAM_ERROR",
          detalhe: result.body
        });
    }

    return res.json(result.body);
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
