import { useEffect, useRef, useState } from "react";
import { api } from "../services/api.js";

export function ChatAssistentePage({ usuario }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ragOk, setRagOk] = useState(null);
  const [kbInfo, setKbInfo] = useState(null);
  const fimRef = useRef(null);

  useEffect(() => {
    let cancel = false;
    async function loadStatus() {
      try {
        const { data } = await api.get("/chat-rag/status");
        if (!cancel) {
          setRagOk(data?.ragConfigured === true);
          setKbInfo({
            knowledgeBaseId: data?.knowledgeBaseId,
            baseUrl: data?.baseUrl
          });
        }
      } catch {
        if (!cancel) setRagOk(false);
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

  async function enviar(e) {
    e.preventDefault();
    const q = texto.trim();
    if (!q || enviando) return;
    setErro("");
    setTexto("");
    setMensagens((m) => [...m, { role: "user", text: q }]);
    setEnviando(true);
    try {
      const { data } = await api.post("/chat-rag/query", { query: q, topK: 5 });
      const payload = data?.data;
      const answer = payload?.answer ?? data?.answer ?? "(Sem resposta no formato esperado.)";
      const sources = payload?.sources ?? data?.sources;
      const ms = payload?.processingTime ?? data?.processingTime;
      setMensagens((m) => [
        ...m,
        {
          role: "assistant",
          text: String(answer),
          sources: Array.isArray(sources) ? sources : null,
          processingTime: ms
        }
      ]);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Falha ao consultar o assistente.";
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

  return (
    <div className="chat-rag-shell">
      <section className="card">
        <h2>Assistente (base de conhecimento)</h2>
        <p className="muted small-margin-b">
          Consulta semantica ao servico RAG da sua organizacao. A API key fica apenas no servidor;
          configure <code className="inline-code">RAG_API_KEY</code> no backend.
        </p>
        {usuario?.email ? (
          <p className="muted small-margin-b">
            Usuario: <strong>{usuario.email}</strong> ({usuario.role})
          </p>
        ) : null}
        {ragOk === false ? (
          <p className="error-text">
            Assistente desativado: defina a variavel <strong>RAG_API_KEY</strong> no ambiente do
            backend e reinicie o servico.
          </p>
        ) : null}
        {ragOk === true && kbInfo ? (
          <p className="muted small-margin-b">
            Base de conhecimento ID <strong>{kbInfo.knowledgeBaseId}</strong>
          </p>
        ) : null}
        {erro && !mensagens.length ? <p className="error-text">{erro}</p> : null}
      </section>

      <section className="card">
        <h3>Conversa</h3>
        <div className="chat-rag-messages">
          {mensagens.length === 0 ? (
            <p className="muted">
              Faça uma pergunta sobre o conteudo indexado na base (documentos, normas, enderecos,
              etc.). As respostas dependem dos arquivos que voce enviou ao RAG.
            </p>
          ) : null}
          {mensagens.map((msg, i) => (
            <div
              key={i}
              className={`chat-bubble ${msg.role} ${msg.isError ? "error-text" : ""}`}
            >
              {msg.text}
              {msg.role === "assistant" && msg.sources?.length ? (
                <div className="chat-rag-sources">
                  <details>
                    <summary>Fontes ({msg.sources.length})</summary>
                    <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
                      {msg.sources.map((s, j) => (
                        <li key={j}>
                          {s.filename || s.documentId || "doc"} — similaridade{" "}
                          {s.similarity != null ? Number(s.similarity).toFixed(2) : "—"}
                        </li>
                      ))}
                    </ul>
                  </details>
                  {msg.processingTime != null ? (
                    <span className="muted"> Tempo: {msg.processingTime} ms</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {enviando ? (
            <div className="chat-bubble assistant muted">Consultando a base...</div>
          ) : null}
          <div ref={fimRef} />
        </div>

        <form className="chat-rag-form" onSubmit={enviar}>
          <label>
            Sua pergunta
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: Qual o endereco do CRAS 3?"
              disabled={enviando || ragOk === false}
            />
          </label>
          <div className="chat-rag-actions">
            <button type="submit" disabled={enviando || !texto.trim() || ragOk === false}>
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          Documentacao da API RAG:{" "}
          <a
            href="https://saas-agentes-sistema-rag.90qhxz.easypanel.host/api-docs"
            target="_blank"
            rel="noreferrer"
          >
            saas-agentes-sistema-rag / api-docs
          </a>
          . As respostas sao geradas a partir da base indexada; revise antes de usar em documentos
          oficiais.
        </p>
      </section>
    </div>
  );
}
