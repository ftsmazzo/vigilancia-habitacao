/**
 * Cliente HTTP para o servico RAG (api-docs no host configurado).
 */

export function ragBaseUrl() {
  return (
    process.env.RAG_API_BASE_URL ||
    "https://saas-agentes-sistema-rag.90qhxz.easypanel.host"
  ).replace(/\/$/, "");
}

export function ragKnowledgeBaseId() {
  return String(process.env.RAG_KNOWLEDGE_BASE_ID || "4").trim();
}

/**
 * @returns {Promise<{ ok: true, body: object } | { ok: false, skip?: boolean, status?: number, body?: object, networkError?: boolean }>}
 */
export async function consultarRag({ query, topK = 5 }) {
  const apiKey = process.env.RAG_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, skip: true };
  }

  const q = String(query ?? "").trim();
  if (!q) {
    return { ok: false, skip: true };
  }

  const k = Math.min(20, Math.max(1, Number(topK) || 5));
  const url = `${ragBaseUrl()}/api/kb/${ragKnowledgeBaseId()}/query`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ query: q, topK: k })
    });
  } catch (e) {
    console.error("RAG fetch error:", e);
    return { ok: false, networkError: true };
  }

  const rawText = await upstream.text();
  let body;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    return { ok: false, status: upstream.status, body: { parseError: true } };
  }

  if (!upstream.ok) {
    return { ok: false, status: upstream.status, body };
  }

  return { ok: true, body };
}
