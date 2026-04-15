import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";
import { readAndClearAssistenteContextoRmaN8n } from "../utils/assistenteContextStorage.js";

function describeRecorteRma(r) {
  if (!r) return "";
  const titulo = r.titulo || r.tipo || "Painel RMA";
  const f = r.filtros || {};
  const bits = [titulo];
  if (f.ano && f.mes) {
    bits.push(
      f.mes === "TODOS"
        ? `ano ${f.ano} (agregado)`
        : `período ${String(f.mes).padStart(2, "0")}/${f.ano}`
    );
  }
  if (f.unidade) bits.push(f.unidade);
  return bits.filter(Boolean).join(" — ");
}

/**
 * Extrai texto legivel do payload do n8n (objeto, array de { output }, ou JSON em string).
 */
function unwrapN8nAssistantPayload(j, depth = 0) {
  if (j == null || depth > 6) return null;
  if (typeof j === "string") {
    const t = j.trim();
    if (
      (t.startsWith("[") && t.endsWith("]")) ||
      (t.startsWith("{") && t.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(t);
        const inner = unwrapN8nAssistantPayload(parsed, depth + 1);
        if (inner != null) return inner;
      } catch {
        /* texto comum */
      }
    }
    return j;
  }
  if (Array.isArray(j)) {
    const parts = j
      .map((item) => unwrapN8nAssistantPayload(item, depth + 1))
      .filter((x) => x != null && String(x).trim() !== "");
    if (parts.length) return parts.join("\n\n");
    return null;
  }
  if (typeof j === "object") {
    if (j.output != null) {
      const o = j.output;
      if (Array.isArray(o)) {
        const joined = o
          .map((x) => unwrapN8nAssistantPayload(x, depth + 1) ?? String(x))
          .filter((x) => String(x).trim() !== "")
          .join("\n");
        return joined || null;
      }
      return unwrapN8nAssistantPayload(o, depth + 1) ?? String(o);
    }
    if (j.text != null) return String(j.text);
    if (j.message != null) return String(j.message);
    if (typeof j.response === "string") return j.response;
  }
  return null;
}

/** Deixa a resposta mais parecida com mensagem humana (remove markdown estrutural comum). */
function humanizeCaduiaReplyText(text) {
  if (text == null || typeof text !== "string") return text;
  let t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return t;
  t = t.replace(/^#{1,6}\s+(.+)$/gm, "$1");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function extractN8nReplyText(data) {
  const r = data?.response;
  if (r?.json != null) {
    const j = r.json;
    const unwrapped = unwrapN8nAssistantPayload(j);
    if (unwrapped != null && String(unwrapped).trim() !== "")
      return humanizeCaduiaReplyText(String(unwrapped));
    try {
      return humanizeCaduiaReplyText(JSON.stringify(j, null, 2));
    } catch {
      return humanizeCaduiaReplyText(String(j));
    }
  }
  if (r?.raw != null && String(r.raw).trim()) {
    const raw = String(r.raw);
    const fromRaw = unwrapN8nAssistantPayload(raw);
    if (fromRaw != null && String(fromRaw).trim() !== "")
      return humanizeCaduiaReplyText(String(fromRaw));
    return humanizeCaduiaReplyText(raw);
  }
  if (data?.message) return humanizeCaduiaReplyText(String(data.message));
  return "(Sem texto na resposta.)";
}

export function ChatAgenteN8nPage({ usuario }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [recorteRma, setRecorteRma] = useState(null);
  const [notasContexto, setNotasContexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [statusN8n, setStatusN8n] = useState(null);
  const [statusApp, setStatusApp] = useState(null);
  const [contextoCarregado, setContextoCarregado] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const fimRef = useRef(null);

  useEffect(() => {
    const ctx = readAndClearAssistenteContextoRmaN8n();
    if (ctx?.overview != null) {
      setRecorteRma({
        tipo: ctx.tipo,
        titulo: ctx.titulo,
        filtros: ctx.filtros,
        overview: ctx.overview
      });
      setContextoCarregado(true);
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const [n8n, app] = await Promise.all([
          api.get("/assistente/agente-n8n/status"),
          api.get("/assistente/status")
        ]);
        if (!cancel) {
          setStatusN8n(n8n.data);
          setStatusApp(app.data);
        }
      } catch {
        if (!cancel) {
          setStatusN8n(null);
          setStatusApp(null);
        }
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  function buildContextoParaApi() {
    const notas = notasContexto.trim();
    if (!recorteRma && !notas) return undefined;
    const payload = {};
    if (recorteRma) {
      payload.recorteRma = {
        tipo: recorteRma.tipo,
        titulo: recorteRma.titulo,
        filtros: recorteRma.filtros,
        overview: recorteRma.overview
      };
    }
    if (notas) payload.notasLivres = notas;
    return payload;
  }

  function novaConversa() {
    setSessionId(crypto.randomUUID());
    setMensagens([]);
    setErro("");
  }

  async function enviar(e) {
    e.preventDefault();
    const q = texto.trim();
    if (!q || enviando) return;
    if (!statusN8n?.webhookConfigured) {
      setErro("Defina N8N_AGENTE_VIGILANCIA_WEBHOOK_URL no backend para usar o CaduIA.");
      return;
    }
    setErro("");
    setTexto("");
    setMensagens((m) => [...m, { role: "user", text: q }]);
    setEnviando(true);
    try {
      const { data } = await api.post("/assistente/agente-n8n/proxy", {
        mensagem: q,
        sessionId,
        contextoPainel: buildContextoParaApi()
      });
      const upstreamOk =
        typeof data?.upstreamStatus === "number" &&
        data.upstreamStatus >= 200 &&
        data.upstreamStatus < 300;
      const ok = data?.success === true && upstreamOk;
      const text = extractN8nReplyText(data);
      if (!ok) {
        setErro(
          data?.message ||
            `O webhook respondeu HTTP ${data?.upstreamStatus ?? "(desconhecido)"}.`
        );
      } else {
        setErro("");
      }
      setMensagens((m) => [
        ...m,
        {
          role: "assistant",
          text,
          isError: !ok
        }
      ]);
    } catch (err) {
      const payload = err?.response?.data;
      const msg =
        payload?.message ||
        err?.message ||
        "Falha ao chamar o agente.";
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

  const webhookOk = statusN8n?.webhookConfigured === true;
  const linhaRecorte = describeRecorteRma(recorteRma);
  const mun = statusApp?.municipioResumo;
  const perfilMunicipioOk = statusApp?.municipioPerfilConfigured === true;
  const podeEditarMunicipio = ["MASTER", "ADMIN"].includes(usuario?.role);

  return (
    <div className="chat-rag-shell">
      <section className="card">
        <h2>CaduIA</h2>
        <p className="muted small-margin-b">
          Conversa com o agente (n8n): o backend envia automaticamente seu perfil municipal, a
          sessão para memória multi-turno e, quando houver, o recorte do painel RMA — com legenda
          dos indicadores para a IA interpretar os códigos.{" "}
          <Link to="/assistente">Assistente interno (RAG)</Link>
        </p>
        {usuario?.email ? (
          <p className="muted small-margin-b">
            Usuario: <strong>{usuario.email}</strong> ({usuario.role})
          </p>
        ) : null}
        {!webhookOk ? (
          <p className="error-text">
            Defina <code className="inline-code">N8N_AGENTE_VIGILANCIA_WEBHOOK_URL</code> no backend
            para ativar o CaduIA.
          </p>
        ) : null}
        {webhookOk && !perfilMunicipioOk ? (
          <p className="error-text" style={{ fontSize: "0.92rem" }}>
            Ainda nao ha perfil municipal cadastrado — o agente tera menos contexto territorial.{" "}
            {podeEditarMunicipio ? (
              <Link to="/contexto-municipio">Cadastre o contexto do municipio</Link>
            ) : (
              "Peça a um administrador para cadastrar em Contexto municipio."
            )}
          </p>
        ) : mun ? (
          <p className="muted small-margin-b" style={{ fontSize: "0.92rem" }}>
            <strong>Municipio em foco (enviado automaticamente):</strong> {mun.nome} / {mun.uf}{" "}
            (IBGE {mun.codigoIbge}).
          </p>
        ) : null}
        {erro && !mensagens.length ? <p className="error-text">{erro}</p> : null}
        <p className="muted" style={{ fontSize: "0.88rem", marginBottom: 0 }}>
          Sessao atual: <code className="inline-code">{sessionId.slice(0, 8)}…</code> — use{" "}
          <strong>Nova conversa</strong> para outro fio de memoria no n8n.
        </p>
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Conversa</h3>
          <button type="button" className="ghost-btn" onClick={novaConversa} disabled={enviando}>
            Nova conversa
          </button>
        </div>
        {recorteRma ? (
          <div className="assistente-rma-banner" role="status">
            <span className="assistente-rma-banner-icon" aria-hidden>
              ✓
            </span>
            <div>
              <strong>Recorte RMA incluido nesta sessao</strong>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.92rem" }}>
                {linhaRecorte}. Os dados seguem em cada mensagem junto com o perfil municipal; a IA
                recebe tambem o guia dos campos (legenda dos indicadores).
              </p>
              <button
                type="button"
                className="assistente-rma-clear"
                onClick={() => setRecorteRma(null)}
                disabled={enviando}
              >
                Remover recorte do painel
              </button>
            </div>
          </div>
        ) : contextoCarregado ? (
          <p className="muted small-margin-b" style={{ fontSize: "0.9rem" }}>
            Nenhum recorte ativo. Use <strong>Enviar recorte ao CaduIA</strong> no painel RMA ou
            envie apenas sua pergunta com notas abaixo.
          </p>
        ) : (
          <p className="muted small-margin-b" style={{ fontSize: "0.9rem" }}>
            Voce pode abrir o painel RMA e enviar o recorte para esta tela, ou conversar sem dados do
            painel.
          </p>
        )}

        <div className="chat-rag-messages">
          {mensagens.length === 0 ? (
            <p className="muted">
              Escreva sua pergunta ou pedido. O contexto do municipio e do recorte (se houver) entra
              automaticamente.
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
            <div className="chat-bubble assistant muted">Aguardando resposta...</div>
          ) : null}
          <div ref={fimRef} />
        </div>

        <form className="chat-rag-form" onSubmit={enviar}>
          <label>
            Observacoes para o contexto (opcional)
            <textarea
              value={notasContexto}
              onChange={(e) => setNotasContexto(e.target.value)}
              placeholder="Detalhes extras que nao estao no recorte (publico-alvo, comparacoes, hipoteses)."
              disabled={enviando}
              style={{ minHeight: 72 }}
            />
          </label>
          <label>
            Sua mensagem
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: Com base no recorte, correlacione o indicador B.2 com familias no Bolsa Familia no Cadastro Unico e resuma em duas frases."
              disabled={enviando || !webhookOk}
            />
          </label>
          <div className="chat-rag-actions">
            <button type="submit" disabled={enviando || !texto.trim() || !webhookOk}>
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          Revise respostas antes de uso oficial. Dados do Cadastro Unico no fluxo vêm das ferramentas
          do n8n, nao deste painel.
        </p>
      </section>
    </div>
  );
}
