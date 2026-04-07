import { useEffect, useRef, useState } from "react";
import { api } from "../services/api.js";

export function ChatAssistentePage({ usuario }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [contextoPainel, setContextoPainel] = useState("");
  const [usarRag, setUsarRag] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState(null);
  const fimRef = useRef(null);

  useEffect(() => {
    let cancel = false;
    async function loadStatus() {
      try {
        const { data } = await api.get("/assistente/status");
        if (!cancel) setStatus(data);
      } catch {
        if (!cancel) setStatus({ llmConfigured: false, ragConfigured: false });
      }
    }
    loadStatus();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  function parseContextoPainel() {
    const raw = contextoPainel.trim();
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async function enviar(e) {
    e.preventDefault();
    const q = texto.trim();
    if (!q || enviando) return;
    if (!status?.llmConfigured) {
      setErro("Configure OPENAI_API_KEY no backend para usar o assistente.");
      return;
    }
    setErro("");
    setTexto("");
    setMensagens((m) => [...m, { role: "user", text: q, contexto: contextoPainel.trim() || null }]);
    setEnviando(true);
    try {
      const { data } = await api.post("/assistente/chat", {
        message: q,
        contextoPainel: parseContextoPainel(),
        usarRag
      });
      setMensagens((m) => [
        ...m,
        {
          role: "assistant",
          text: data?.answer ?? "(Sem texto.)",
          meta: data
        }
      ]);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Falha ao gerar resposta.";
      setErro(msg);
      setMensagens((m) => [
        ...m,
        {
          role: "assistant",
          text: `Erro: ${msg}`,
          isError: true
        }
      ]);
    } finally {
      setEnviando(false);
    }
  }

  const llmOk = status?.llmConfigured === true;
  const ragOk = status?.ragConfigured === true;

  return (
    <div className="chat-rag-shell">
      <section className="card">
        <h2>Assistente inteligente</h2>
        <p className="muted small-margin-b">
          O modelo recebe seu pedido, o <strong>contexto operacional</strong> (opcional) e trechos da{" "}
          <strong>base RAG</strong> apenas como <strong>apoio teorico</strong> — a resposta final e
          sintetizada pelo modelo, sem tratar o RAG como fonte unica.
        </p>
        {usuario?.email ? (
          <p className="muted small-margin-b">
            Usuario: <strong>{usuario.email}</strong> ({usuario.role})
          </p>
        ) : null}
        {!llmOk ? (
          <p className="error-text">
            Defina <code className="inline-code">OPENAI_API_KEY</code> no backend (EasyPanel) para
            ativar o orquestrador.
          </p>
        ) : (
          <p className="muted small-margin-b">
            Modelo: <strong>{status?.openaiModel || "gpt-4o-mini"}</strong>
            {status?.openaiModelHint ? (
              <span className="muted"> — {status.openaiModelHint}</span>
            ) : null}
            {ragOk ? (
              <>
                {" "}
                · RAG base ID <strong>{status?.knowledgeBaseId}</strong>
              </>
            ) : (
              <span> · RAG opcional (sem chave, apenas contexto + pedido)</span>
            )}
          </p>
        )}
        {erro && !mensagens.length ? <p className="error-text">{erro}</p> : null}
      </section>

      <section className="card">
        <h3>Conversa</h3>
        <div className="chat-rag-messages">
          {mensagens.length === 0 ? (
            <p className="muted">
              Descreva o que precisa (texto, minuta, paragrafo). Opcionalmente cole abaixo numeros ou
              JSON do painel (RMA, etc.) como contexto operacional.
            </p>
          ) : null}
          {mensagens.map((msg, i) => (
            <div
              key={i}
              className={`chat-bubble ${msg.role} ${msg.isError ? "error-text" : ""}`}
            >
              {msg.role === "user" && msg.contexto ? (
                <details className="chat-user-context" style={{ marginBottom: 8 }}>
                  <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>
                    Contexto enviado nesta mensagem
                  </summary>
                  <pre
                    style={{
                      marginTop: 6,
                      fontSize: "0.8rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word"
                    }}
                  >
                    {msg.contexto}
                  </pre>
                </details>
              ) : null}
              {msg.text}
              {msg.role === "assistant" && msg.meta?.rag && !msg.isError ? (
                <div className="chat-rag-sources">
                  <details>
                    <summary>
                      Como a resposta foi apoiada (RAG:{" "}
                      {msg.meta.rag.used ? "sim" : "nao"}
                      {msg.meta.rag.error ? ` — ${msg.meta.rag.error}` : ""})
                    </summary>
                    {msg.meta.rag.rawAnswer ? (
                      <p style={{ marginTop: 8 }}>
                        <span className="muted">Sintese bruta da busca: </span>
                        {String(msg.meta.rag.rawAnswer).slice(0, 800)}
                        {String(msg.meta.rag.rawAnswer).length > 800 ? "…" : ""}
                      </p>
                    ) : null}
                    {msg.meta.rag.sources?.length ? (
                      <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
                        {msg.meta.rag.sources.map((s, j) => (
                          <li key={j}>
                            {s.filename || s.documentId || "doc"} — similaridade{" "}
                            {s.similarity != null ? Number(s.similarity).toFixed(2) : "—"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {msg.meta.usage ? (
                      <p className="muted" style={{ marginTop: 8, fontSize: "0.8rem" }}>
                        Tokens: {JSON.stringify(msg.meta.usage)}
                      </p>
                    ) : null}
                  </details>
                </div>
              ) : null}
            </div>
          ))}
          {enviando ? (
            <div className="chat-bubble assistant muted">
              Consultando RAG (se ativo) e gerando resposta com o modelo...
            </div>
          ) : null}
          <div ref={fimRef} />
        </div>

        <form className="chat-rag-form" onSubmit={enviar}>
          <label>
            Contexto operacional (opcional)
            <textarea
              value={contextoPainel}
              onChange={(e) => setContextoPainel(e.target.value)}
              placeholder='Cole totais, recorte do painel ou JSON. Ex.: {"totaisMunicipio":{"c1":120},"periodo":"03/2024"}'
              disabled={enviando}
              style={{ minHeight: 72 }}
            />
          </label>
          <label className="chat-rag-checkbox">
            <input
              type="checkbox"
              checked={usarRag}
              onChange={(e) => setUsarRag(e.target.checked)}
              disabled={enviando}
            />
            Incluir busca na base de conhecimento (RAG) como apoio teorico
          </label>
          <label>
            Seu pedido
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: Redija um paragrafo para o relatorio municipal citando os totais do contexto e alinhando ao que diz a norma."
              disabled={enviando || !llmOk}
            />
          </label>
          <div className="chat-rag-actions">
            <button type="submit" disabled={enviando || !texto.trim() || !llmOk}>
              {enviando ? "Gerando..." : "Enviar"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          API RAG:{" "}
          <a
            href="https://saas-agentes-sistema-rag.90qhxz.easypanel.host/api-docs"
            target="_blank"
            rel="noreferrer"
          >
            documentacao
          </a>
          . Revise sempre o texto antes de uso oficial.
        </p>
      </section>
    </div>
  );
}
