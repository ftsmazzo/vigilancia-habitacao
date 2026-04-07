import { useEffect, useRef, useState } from "react";
import { api } from "../services/api.js";
import { readAndClearAssistenteContextoRma } from "../utils/assistenteContextStorage.js";

export function ChatAssistentePage({ usuario }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [contextoPainel, setContextoPainel] = useState("");
  const [usarRag, setUsarRag] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState(null);
  const [contextoCarregado, setContextoCarregado] = useState(false);
  const fimRef = useRef(null);

  useEffect(() => {
    const ctx = readAndClearAssistenteContextoRma();
    if (ctx) {
      const block = {
        origem: ctx.titulo || ctx.tipo,
        tipo: ctx.tipo,
        filtros: ctx.filtros,
        dadosPainel: ctx.overview
      };
      setContextoPainel(JSON.stringify(block, null, 2));
      setContextoCarregado(true);
    }
  }, []);

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
    setMensagens((m) => [...m, { role: "user", text: q }]);
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
          text: data?.answer ?? "(Sem texto.)"
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

  return (
    <div className="chat-rag-shell">
      <section className="card">
        <h2>Assistente inteligente</h2>
        <p className="muted small-margin-b">
          Apoio em analises e textos da assistencia social, com base no recorte de dados que voce
          enviar abaixo e no material interno da organizacao quando disponivel.
        </p>
        {usuario?.email ? (
          <p className="muted small-margin-b">
            Usuario: <strong>{usuario.email}</strong> ({usuario.role})
          </p>
        ) : null}
        {!llmOk ? (
          <p className="error-text">
            Defina <code className="inline-code">OPENAI_API_KEY</code> no backend (EasyPanel) para
            ativar o assistente.
          </p>
        ) : null}
        {erro && !mensagens.length ? <p className="error-text">{erro}</p> : null}
      </section>

      <section className="card">
        <h3>Conversa</h3>
        {contextoCarregado ? (
          <p className="success-text small-margin-b" style={{ fontSize: "0.9rem" }}>
            Recorte do painel RMA carregado automaticamente no contexto abaixo. Ajuste o texto se
            precisar.
          </p>
        ) : null}
        <div className="chat-rag-messages">
          {mensagens.length === 0 ? (
            <p className="muted">
              Descreva o que precisa (relatorio, paragrafo, analise). Use o contexto operacional
              para informar numeros e periodo.
            </p>
          ) : null}
          {mensagens.map((msg, i) => (
            <div
              key={i}
              className={`chat-bubble ${msg.role} ${msg.isError ? "error-text" : ""}`}
            >
              {msg.text}
            </div>
          ))}
          {enviando ? (
            <div className="chat-bubble assistant muted">Gerando resposta...</div>
          ) : null}
          <div ref={fimRef} />
        </div>

        <form className="chat-rag-form" onSubmit={enviar}>
          <label>
            Contexto operacional (dados do painel / recorte)
            <textarea
              value={contextoPainel}
              onChange={(e) => setContextoPainel(e.target.value)}
              placeholder='Cole JSON ou texto. Use "Enviar recorte ao assistente" no painel RMA para preencher automaticamente.'
              disabled={enviando}
              style={{ minHeight: 120 }}
            />
          </label>
          <label className="chat-rag-checkbox">
            <input
              type="checkbox"
              checked={usarRag}
              onChange={(e) => setUsarRag(e.target.checked)}
              disabled={enviando}
            />
            Usar base de conhecimento interna como apoio adicional (nao substitui o contexto acima)
          </label>
          <label>
            Seu pedido
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: Redija um paragrafo introdutorio para o relatorio municipal usando os totais do contexto."
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
          Revise sempre o texto antes de uso oficial ou de assinatura.
        </p>
      </section>
    </div>
  );
}
