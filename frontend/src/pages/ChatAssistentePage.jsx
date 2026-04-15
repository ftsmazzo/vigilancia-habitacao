import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";
import { readAndClearAssistenteContextoRma } from "../utils/assistenteContextStorage.js";

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

export function ChatAssistentePage({ usuario }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [recorteRma, setRecorteRma] = useState(null);
  const [notasContexto, setNotasContexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState(null);
  const [contextoCarregado, setContextoCarregado] = useState(false);
  const fimRef = useRef(null);

  useEffect(() => {
    const ctx = readAndClearAssistenteContextoRma();
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
    async function loadStatus() {
      try {
        const { data } = await api.get("/assistente/status");
        if (!cancel) setStatus(data);
      } catch {
        if (!cancel) {
          setStatus({
            llmConfigured: false,
            ragConfigured: false,
            municipioPerfilConfigured: false
          });
        }
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
        contextoPainel: buildContextoParaApi()
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
  const ragOk = status?.ragConfigured === true;
  const linhaRecorte = describeRecorteRma(recorteRma);
  const mun = status?.municipioResumo;
  const perfilMunicipioOk = status?.municipioPerfilConfigured === true;
  const podeEditarMunicipio = ["MASTER", "ADMIN"].includes(usuario?.role);

  return (
    <div className="chat-rag-shell">
      <section className="card">
        <h2>Assistente inteligente</h2>
        <p className="muted small-margin-b">
          Respostas alinhadas ao SUAS: seus dados operacionais (quando houver) entram em conjunto com
          o acervo normativo indexado — o sistema formula automaticamente a busca nesse acervo a
          partir do seu pedido e do contexto.{" "}
          <Link to="/assistente/lab-n8n">Laboratório do agente n8n</Link> (teste de webhook).
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
        {llmOk && !ragOk ? (
          <p className="error-text">
            Configure <code className="inline-code">RAG_API_KEY</code> no backend para consultar a
            base normativa em toda resposta.
          </p>
        ) : null}
        {llmOk && !perfilMunicipioOk ? (
          <p className="error-text" style={{ fontSize: "0.92rem" }}>
            Ainda nao ha perfil municipal cadastrado — o assistente tera menos contexto territorial.{" "}
            {podeEditarMunicipio ? (
              <>
                <Link to="/contexto-municipio">Cadastre o contexto do municipio</Link>.
              </>
            ) : (
              "Peça a um administrador para cadastrar em Contexto municipio."
            )}
          </p>
        ) : mun ? (
          <p className="muted small-margin-b" style={{ fontSize: "0.92rem" }}>
            <strong>Municipio em foco:</strong> {mun.nome} / {mun.uf} (IBGE {mun.codigoIbge}) — dados
            do perfil entram automaticamente em cada resposta.
          </p>
        ) : null}
        {erro && !mensagens.length ? <p className="error-text">{erro}</p> : null}

        <div className="assistente-base-docs">
          <h4 className="assistente-base-docs-title">O que ha na base normativa (RAG)</h4>
          <p className="muted small-margin-b" style={{ marginTop: 0 }}>
            Documentos de referencia do assistente (conforme indexados no sistema):
          </p>
          <ul className="assistente-base-docs-list">
            <li>
              <strong>LOAS</strong> — Lei Organica da Assistencia Social (Lei 8.742/1993) e alteracoes
            </li>
            <li>
              <strong>NOB/SUAS</strong> — Norma Operacional Basica (marcos 2005 e 2012)
            </li>
            <li>
              <strong>NOB-RH/SUAS</strong> — gestao de recursos humanos no SUAS
            </li>
            <li>
              <strong>Tipificacao</strong> — servicos socioassistenciais (Resolucao CNAS 109/2009)
            </li>
            <li>
              <strong>PNAS 2004</strong> — Politica Nacional de Assistencia Social
            </li>
          </ul>
          <p className="muted" style={{ fontSize: "0.88rem", marginBottom: 0 }}>
            Como usar: descreva o que precisa (relatorio, analise, minuta). Se vier do painel RMA, os
            numeros entram automaticamente; voce pode acrescentar observacoes no campo de notas. A
            busca na base e feita em toda interacao, combinando seu pedido com um resumo do contexto
            (sem repetir tabelas inteiras na consulta ao RAG).
          </p>
        </div>
      </section>

      <section className="card">
        <h3>Conversa</h3>
        {recorteRma ? (
          <div className="assistente-rma-banner" role="status">
            <span className="assistente-rma-banner-icon" aria-hidden>
              ✓
            </span>
            <div>
              <strong>Dados do painel incluidos nesta sessao</strong>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.92rem" }}>
                {linhaRecorte}. Os totais e o recorte enviado do RMA serao considerados nas
                respostas; nada disso e exibido aqui como JSON.
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
            O recorte do painel foi descartado ou nao esta mais disponivel. Voce pode enviar de novo
            pelo botao no painel RMA ou usar apenas notas abaixo.
          </p>
        ) : null}

        <div className="chat-rag-messages">
          {mensagens.length === 0 ? (
            <p className="muted">
              Descreva o que precisa (relatorio, paragrafo, analise). A base normativa e consultada
              automaticamente em toda mensagem.
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
            Observacoes para o contexto (opcional)
            <textarea
              value={notasContexto}
              onChange={(e) => setNotasContexto(e.target.value)}
              placeholder="Ex.: Destacar comparacao com o mes anterior, publico-alvo do relatorio, ou qualquer detalhe que nao esta no painel."
              disabled={enviando}
              style={{ minHeight: 72 }}
            />
          </label>
          <label>
            Seu pedido
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: Redija um paragrafo introdutorio para o relatorio municipal usando os totais do recorte e alinhando a LOAS e ao PNAS."
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
