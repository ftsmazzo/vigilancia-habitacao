import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const emptyDados = {
  qtdCras: "",
  qtdCreas: "",
  qtdCentroPop: "",
  qtdMse: "",
  populacao: "",
  anoPopulacao: "",
  redeServicos: "",
  cadunicoResumo: "",
  territorioNotas: "",
  outrasFontes: ""
};

function flattenDadosFromJson(dadosJson) {
  if (!dadosJson || typeof dadosJson !== "object") return { ...emptyDados };
  return {
    qtdCras: dadosJson.qtdCras ?? "",
    qtdCreas: dadosJson.qtdCreas ?? "",
    qtdCentroPop: dadosJson.qtdCentroPop ?? "",
    qtdMse: dadosJson.qtdMse ?? "",
    populacao: dadosJson.populacao ?? "",
    anoPopulacao: dadosJson.anoPopulacao ?? "",
    redeServicos: dadosJson.redeServicos ?? "",
    cadunicoResumo: dadosJson.cadunicoResumo ?? "",
    territorioNotas: dadosJson.territorioNotas ?? "",
    outrasFontes: dadosJson.outrasFontes ?? ""
  };
}

function montarDadosJson(campos) {
  const o = {};
  const n = (v) => (v === "" || v == null ? undefined : Number(v));
  const t = (v) => (v != null && String(v).trim() ? String(v).trim() : undefined);
  const x = n(campos.qtdCras);
  if (x != null && !Number.isNaN(x)) o.qtdCras = x;
  const y = n(campos.qtdCreas);
  if (y != null && !Number.isNaN(y)) o.qtdCreas = y;
  const z = n(campos.qtdCentroPop);
  if (z != null && !Number.isNaN(z)) o.qtdCentroPop = z;
  const w = n(campos.qtdMse);
  if (w != null && !Number.isNaN(w)) o.qtdMse = w;
  const p = n(campos.populacao);
  if (p != null && !Number.isNaN(p)) o.populacao = p;
  const a = n(campos.anoPopulacao);
  if (a != null && !Number.isNaN(a)) o.anoPopulacao = a;
  const rs = t(campos.redeServicos);
  if (rs) o.redeServicos = rs;
  const cad = t(campos.cadunicoResumo);
  if (cad) o.cadunicoResumo = cad;
  const tn = t(campos.territorioNotas);
  if (tn) o.territorioNotas = tn;
  const of = t(campos.outrasFontes);
  if (of) o.outrasFontes = of;
  return o;
}

export function ContextoMunicipioPage() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [codigoIbge, setCodigoIbge] = useState("");
  const [nome, setNome] = useState("");
  const [uf, setUf] = useState("");
  const [textoMunicipio, setTextoMunicipio] = useState("");
  const [campos, setCampos] = useState({ ...emptyDados });
  const [ibgeCacheEm, setIbgeCacheEm] = useState(null);
  const [municipioIbgeEnv, setMunicipioIbgeEnv] = useState(null);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setErro("");
      try {
        const { data } = await api.get("/municipio-perfil");
        if (cancel) return;
        setMunicipioIbgeEnv(data.municipioIbgeEnv);
        const p = data.perfil;
        if (p) {
          setCodigoIbge(p.codigoIbge || "");
          setNome(p.nome || "");
          setUf(p.uf || "");
          setTextoMunicipio(p.textoMunicipio || "");
          setCampos(flattenDadosFromJson(p.dadosJson));
          setIbgeCacheEm(p.ibgeCacheEm || null);
        }
      } catch (e) {
        if (!cancel) setErro(e?.response?.data?.message || "Falha ao carregar perfil.");
      } finally {
        if (!cancel) setCarregando(false);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setMensagem("");
    setErro("");
    try {
      const dadosJson = montarDadosJson(campos);
      await api.put("/municipio-perfil", {
        codigoIbge,
        nome,
        uf,
        textoMunicipio,
        dadosJson
      });
      setMensagem("Perfil municipal salvo. O assistente usara estes dados nas proximas mensagens.");
    } catch (err) {
      setErro(err?.response?.data?.message || "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function sincronizarIbge() {
    setSincronizando(true);
    setMensagem("");
    setErro("");
    try {
      const { data } = await api.post("/municipio-perfil/sincronizar-ibge", {
        codigoIbge: codigoIbge || undefined
      });
      if (data.perfil) {
        setCodigoIbge(data.perfil.codigoIbge || "");
        setNome(data.perfil.nome || "");
        setUf(data.perfil.uf || "");
        setIbgeCacheEm(data.perfil.ibgeCacheEm || null);
      }
      setMensagem("Dados de localidade IBGE atualizados (nome, UF, regiao).");
    } catch (err) {
      setErro(err?.response?.data?.message || "Falha ao sincronizar com IBGE.");
    } finally {
      setSincronizando(false);
    }
  }

  if (carregando) {
    return (
      <section className="card">
        <p>Carregando...</p>
      </section>
    );
  }

  return (
    <div className="chat-rag-shell" style={{ maxWidth: 920 }}>
      <section className="card">
        <h2>Contexto do municipio (assistente)</h2>
        <p className="muted small-margin-b">
          Estas informacoes entram em <strong>todas</strong> as respostas do assistente, antes do RMA
          e da base normativa, para ancorar analises no seu territorio. Em outro municipio: cadastre
          outro registro e defina <code className="inline-code">MUNICIPIO_IBGE_CODIGO</code> no
          backend (ou mantenha um unico perfil).
        </p>
        {municipioIbgeEnv ? (
          <p className="muted small-margin-b" style={{ fontSize: "0.9rem" }}>
            Servidor usa <code className="inline-code">MUNICIPIO_IBGE_CODIGO={municipioIbgeEnv}</code>{" "}
            para escolher o perfil quando houver mais de um cadastro.
          </p>
        ) : (
          <p className="muted small-margin-b" style={{ fontSize: "0.9rem" }}>
            Sem variavel de ambiente: o sistema usa o perfil mais recentemente atualizado.
          </p>
        )}
        {mensagem ? <p className="success-text">{mensagem}</p> : null}
        {erro ? <p className="error-text">{erro}</p> : null}
      </section>

      <section className="card">
        <form className="form chat-rag-form" onSubmit={salvar}>
          <h3>Identificacao</h3>
          <div className="metrics-grid rma-filters-grid">
            <label className="metric-item">
              <span>Codigo IBGE (7 digitos)</span>
              <input
                value={codigoIbge}
                onChange={(e) => setCodigoIbge(e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="Ex.: 3550308"
                required
              />
            </label>
            <label className="metric-item">
              <span>UF</span>
              <input
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="SP"
                maxLength={2}
                required
              />
            </label>
          </div>
          <label>
            Nome do municipio
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </label>
          <div className="chat-rag-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={sincronizarIbge}
              disabled={sincronizando || salvando}
            >
              {sincronizando ? "Sincronizando..." : "Sincronizar nome e UF com IBGE"}
            </button>
          </div>
          {ibgeCacheEm ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Ultima sincronizacao IBGE: {new Date(ibgeCacheEm).toLocaleString("pt-BR")}
            </p>
          ) : null}

          <h3 className="small-margin-b" style={{ marginTop: 20 }}>
            Rede SUAS e territorio (numeros e textos)
          </h3>
          <div className="metrics-grid rma-filters-grid">
            <label className="metric-item">
              <span>Quantidade de CRAS</span>
              <input
                type="number"
                min="0"
                value={campos.qtdCras}
                onChange={(e) => setCampos((c) => ({ ...c, qtdCras: e.target.value }))}
              />
            </label>
            <label className="metric-item">
              <span>Quantidade de CREAS</span>
              <input
                type="number"
                min="0"
                value={campos.qtdCreas}
                onChange={(e) => setCampos((c) => ({ ...c, qtdCreas: e.target.value }))}
              />
            </label>
            <label className="metric-item">
              <span>Centro(s) POP</span>
              <input
                type="number"
                min="0"
                value={campos.qtdCentroPop}
                onChange={(e) => setCampos((c) => ({ ...c, qtdCentroPop: e.target.value }))}
              />
            </label>
            <label className="metric-item">
              <span>MSE (se aplicavel)</span>
              <input
                type="number"
                min="0"
                value={campos.qtdMse}
                onChange={(e) => setCampos((c) => ({ ...c, qtdMse: e.target.value }))}
              />
            </label>
          </div>
          <div className="metrics-grid rma-filters-grid">
            <label className="metric-item">
              <span>Populacao (referencia)</span>
              <input
                type="number"
                min="0"
                value={campos.populacao}
                onChange={(e) => setCampos((c) => ({ ...c, populacao: e.target.value }))}
              />
            </label>
            <label className="metric-item">
              <span>Ano da populacao</span>
              <input
                type="number"
                min="1991"
                max="2100"
                value={campos.anoPopulacao}
                onChange={(e) => setCampos((c) => ({ ...c, anoPopulacao: e.target.value }))}
              />
            </label>
          </div>
          <label>
            Rede de servicos / colegiados / observacoes institucionais
            <textarea
              value={campos.redeServicos}
              onChange={(e) => setCampos((c) => ({ ...c, redeServicos: e.target.value }))}
              placeholder="Ex.: composicao do colegiado, articulacao com saude/educacao, contratos, parcerias."
              style={{ minHeight: 88 }}
            />
          </label>
          <label>
            Resumo CadUnico (público-alvo municipal, se tiver consolidado)
            <textarea
              value={campos.cadunicoResumo}
              onChange={(e) => setCampos((c) => ({ ...c, cadunicoResumo: e.target.value }))}
              placeholder="Ex.: familias cadastradas, vulnerabilidade, atualizacao — apenas o que for seguro compartilhar no assistente."
              style={{ minHeight: 88 }}
            />
          </label>
          <label>
            Territorio (regioes, vulnerabilidades, notas IBGE ou estudos locais)
            <textarea
              value={campos.territorioNotas}
              onChange={(e) => setCampos((c) => ({ ...c, territorioNotas: e.target.value }))}
              style={{ minHeight: 72 }}
            />
          </label>
          <label>
            Outras fontes (links ou referencias)
            <textarea
              value={campos.outrasFontes}
              onChange={(e) => setCampos((c) => ({ ...c, outrasFontes: e.target.value }))}
              placeholder="Ex.: Plano Municipal, estudo diagnostico 2023 — URLs ou citacoes."
              style={{ minHeight: 56 }}
            />
          </label>

          <h3 className="small-margin-b" style={{ marginTop: 16 }}>
            Narrativa livre para o assistente
          </h3>
          <label>
            Sintese em texto corrido (recomendado para respostas menos genericas)
            <textarea
              value={textoMunicipio}
              onChange={(e) => setTextoMunicipio(e.target.value)}
              placeholder="Descreva em 1–3 paragrafos: perfil socioeconomico, desafios da gestao SUAS, prioridades do governo, especificidades do territorio."
              style={{ minHeight: 140 }}
            />
          </label>

          <div className="chat-rag-actions">
            <button type="submit" disabled={salvando || sincronizando}>
              {salvando ? "Salvando..." : "Salvar perfil"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
