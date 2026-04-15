import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";

export function AgenteN8nLabPage({ usuario }) {
  const [mensagem, setMensagem] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [metadataJson, setMetadataJson] = useState("{}");
  const [incluirContexto, setIncluirContexto] = useState(false);
  const [contextoJson, setContextoJson] = useState(
    '{\n  "notasLivres": "Teste de laboratorio"\n}'
  );
  const [status, setStatus] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ultimaResposta, setUltimaResposta] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const { data } = await api.get("/assistente/agente-n8n/status");
        if (!cancel) setStatus(data);
      } catch {
        if (!cancel) setStatus(null);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, []);

  async function enviar(e) {
    e.preventDefault();
    const msg = mensagem.trim();
    if (!msg || enviando) return;
    setErro("");
    setUltimaResposta(null);

    let metadata = undefined;
    const metaStr = metadataJson.trim();
    if (metaStr && metaStr !== "{}") {
      try {
        metadata = JSON.parse(metaStr);
        if (metadata !== null && typeof metadata !== "object") {
          throw new Error("metadata deve ser um objeto JSON.");
        }
      } catch (err) {
        setErro(
          err?.message ||
            "JSON invalido no campo metadata. Use objeto, ex.: {\"origem\":\"lab\"}"
        );
        return;
      }
    }

    let contextoPainel = undefined;
    if (incluirContexto) {
      try {
        contextoPainel = JSON.parse(contextoJson);
      } catch {
        setErro("JSON invalido no campo contextoPainel.");
        return;
      }
    }

    const body = {
      mensagem: msg,
      ...(sessionId.trim() ? { sessionId: sessionId.trim() } : {}),
      ...(metadata != null ? { metadata } : {}),
      ...(contextoPainel !== undefined ? { contextoPainel } : {})
    };

    setEnviando(true);
    try {
      const { data } = await api.post("/assistente/agente-n8n/proxy", body);
      setUltimaResposta(data);
    } catch (err) {
      const payload = err?.response?.data;
      setErro(
        payload?.message ||
          err?.message ||
          "Falha ao chamar o proxy do webhook."
      );
      if (payload && typeof payload === "object") {
        setUltimaResposta(payload);
      }
    } finally {
      setEnviando(false);
    }
  }

  const webhookOk = status?.webhookConfigured === true;

  return (
    <div className="chat-rag-shell">
      <section className="card">
        <h2>Laboratório — Agente n8n</h2>
        <p className="muted small-margin-b">
          Simula o que o sistema enviará ao webhook do n8n. O backend monta o corpo, acrescenta{" "}
          <code className="inline-code">userId</code>, <code className="inline-code">userEmail</code>{" "}
          e <code className="inline-code">role</code> a partir do JWT — igual a uma rota real no
          futuro.
        </p>
        {usuario?.email ? (
          <p className="muted small-margin-b">
            Usuário: <strong>{usuario.email}</strong> ({usuario.role})
          </p>
        ) : null}
        <p className="muted small-margin-b">
          <Link to="/assistente">Voltar ao assistente interno</Link>
        </p>
        {!webhookOk ? (
          <p className="error-text">
            Defina <code className="inline-code">N8N_AGENTE_VIGILANCIA_WEBHOOK_URL</code> no backend
            para habilitar o teste.
          </p>
        ) : (
          <p className="muted small-margin-b" style={{ fontSize: "0.92rem" }}>
            Webhook configurado no servidor. Campos esperados pelo fluxo n8n: veja{" "}
            <code className="inline-code">GET /api/assistente/agente-n8n/status</code> (payloadFields).
          </p>
        )}
      </section>

      <section className="card">
        <h3>Montar payload</h3>
        <form className="chat-rag-form" onSubmit={enviar}>
          <label>
            mensagem <span className="muted">(obrigatório)</span>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Ex.: Quantas famílias em extrema pobreza no Ipiranga?"
              disabled={enviando || !webhookOk}
              style={{ minHeight: 88 }}
            />
          </label>
          <label>
            sessionId{" "}
            <span className="muted">
              (opcional — vazio o servidor gera UUID; reutilize o mesmo valor para continuar a mesma
              conversa; o payload inclui <code className="inline-code">memorySessionKey</code> =
              userId:sessionId para a Memory no n8n)
            </span>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Deixe vazio para nova conversa, ou cole o sessionId da resposta anterior"
              disabled={enviando || !webhookOk}
            />
          </label>
          <label>
            metadata <span className="muted">(JSON objeto, opcional)</span>
            <textarea
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              disabled={enviando || !webhookOk}
              style={{ minHeight: 72, fontFamily: "monospace", fontSize: "0.88rem" }}
            />
          </label>
          <label className="checkbox-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={incluirContexto}
              onChange={(e) => setIncluirContexto(e.target.checked)}
              disabled={enviando || !webhookOk}
            />
            Incluir contextoPainel (JSON — mesmo formato do assistente)
          </label>
          {incluirContexto ? (
            <label>
              contextoPainel
              <textarea
                value={contextoJson}
                onChange={(e) => setContextoJson(e.target.value)}
                disabled={enviando || !webhookOk}
                style={{ minHeight: 120, fontFamily: "monospace", fontSize: "0.88rem" }}
              />
            </label>
          ) : null}
          <div className="chat-rag-actions">
            <button type="submit" disabled={enviando || !mensagem.trim() || !webhookOk}>
              {enviando ? "Aguardando n8n..." : "Enviar via proxy"}
            </button>
          </div>
        </form>
        {erro ? <p className="error-text">{erro}</p> : null}
      </section>

      {ultimaResposta ? (
        <section className="card">
          <h3>Última resposta</h3>
          <pre
            className="lab-n8n-pre"
            style={{
              overflow: "auto",
              maxHeight: 480,
              fontSize: "0.82rem",
              padding: 12,
              background: "var(--card-muted-bg, #f4f4f5)",
              borderRadius: 8
            }}
          >
            {JSON.stringify(ultimaResposta, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
