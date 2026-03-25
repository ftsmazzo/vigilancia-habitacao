import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export function DashboardPage({ usuario }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [selecionadoId, setSelecionadoId] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [arquivoCadu, setArquivoCadu] = useState(null);
  const [retornoUpload, setRetornoUpload] = useState(null);
  const [retornoUploadCadu, setRetornoUploadCadu] = useState(null);
  const [enviandoCadu, setEnviandoCadu] = useState(false);
  const [progressoCadu, setProgressoCadu] = useState(0);
  const [executandoCruzamento, setExecutandoCruzamento] = useState(false);
  const [retornoCruzamento, setRetornoCruzamento] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [form, setForm] = useState({
    nome: "",
    endereco: "",
    municipio: "Ribeirao Preto",
    numUnidades: ""
  });

  async function carregarEmpreendimentos() {
    setCarregando(true);
    setErro("");
    try {
      const { data } = await api.get("/empreendimentos");
      setItens(data);
      if (data[0] && !selecionadoId) {
        setSelecionadoId(data[0].id);
      }
    } catch (_error) {
      setErro("Falha ao carregar empreendimentos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarEmpreendimentos();
  }, []);

  useEffect(() => {
    carregarResultadosEMetricas();
  }, [selecionadoId]);

  async function criarEmpreendimento(event) {
    event.preventDefault();
    setErro("");
    try {
      await api.post("/empreendimentos", {
        nome: form.nome,
        endereco: form.endereco || undefined,
        municipio: form.municipio || undefined,
        numUnidades: form.numUnidades ? Number(form.numUnidades) : undefined
      });
      setForm({ nome: "", endereco: "", municipio: "Ribeirao Preto", numUnidades: "" });
      await carregarEmpreendimentos();
    } catch (_error) {
      setErro("Falha ao criar empreendimento.");
    }
  }

  async function subirLista(event) {
    event.preventDefault();
    setErro("");
    setRetornoUpload(null);
    if (!selecionadoId || !arquivo) {
      setErro("Selecione empreendimento e arquivo.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      const { data } = await api.post(`/empreendimentos/${selecionadoId}/pre-selecionados/upload`, formData);
      setRetornoUpload(data);
      await carregarResultadosEMetricas();
    } catch (_error) {
      setErro("Falha no upload da lista.");
    }
  }

  async function carregarResultadosEMetricas() {
    if (!selecionadoId) return;
    try {
      const [{ data: metricasResp }, { data: resultadosResp }] = await Promise.all([
        api.get(`/empreendimentos/${selecionadoId}/metricas`),
        api.get(`/empreendimentos/${selecionadoId}/cruzamento/resultados?limit=20&page=1`)
      ]);
      setMetricas(metricasResp);
      setResultados(resultadosResp.itens || []);
    } catch (_error) {
      // silencioso para não quebrar fluxo inicial
    }
  }

  async function subirBaseCadu(event) {
    event.preventDefault();
    setErro("");
    setRetornoUploadCadu(null);
    setProgressoCadu(0);
    if (!arquivoCadu) {
      setErro("Selecione o CSV da base CADU.");
      return;
    }

    try {
      setEnviandoCadu(true);
      const init = await api.post("/cadu/upload/init");
      const uploadId = init.data.uploadId;
      const chunkSize = 5 * 1024 * 1024;
      const totalChunks = Math.ceil(arquivoCadu.size / chunkSize);

      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * chunkSize;
        const end = Math.min(arquivoCadu.size, start + chunkSize);
        const chunk = arquivoCadu.slice(start, end);
        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("index", String(index));
        formData.append("totalChunks", String(totalChunks));
        formData.append("fileName", arquivoCadu.name);
        formData.append("chunk", chunk, `${arquivoCadu.name}.part${index}`);
        await api.post("/cadu/upload/chunk", formData, { timeout: 1000 * 60 * 5 });
        setProgressoCadu(Math.round(((index + 1) * 100) / totalChunks));
      }

      const { data } = await api.post("/cadu/upload/finalize", { uploadId }, { timeout: 1000 * 60 * 40 });
      setRetornoUploadCadu(data);
      setArquivoCadu(null);
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      if (backendMessage) {
        setErro(`Falha no upload da base CADU: ${backendMessage}`);
      } else {
        setErro("Falha no upload da base CADU.");
      }
    } finally {
      setEnviandoCadu(false);
    }
  }

  async function executarCruzamento() {
    if (!selecionadoId) {
      setErro("Selecione um empreendimento para cruzar.");
      return;
    }
    setErro("");
    setExecutandoCruzamento(true);
    setRetornoCruzamento(null);

    try {
      const { data } = await api.post(`/empreendimentos/${selecionadoId}/cruzamento`);
      setRetornoCruzamento(data);
      await carregarResultadosEMetricas();
    } catch (_error) {
      setErro("Falha ao executar cruzamento.");
    } finally {
      setExecutandoCruzamento(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="card">
        <h2>Bem-vindo, {usuario?.nome}</h2>
        <p className="muted">
          Perfil atual: <strong>{usuario?.role}</strong>. O perfil MASTER administra usuarios e acessa todos os dados.
        </p>
      </section>

      {usuario?.role === "MASTER" ? (
        <section className="card">
          <h3>Upload base CADU (.csv)</h3>
          <form className="form" onSubmit={subirBaseCadu}>
            <label>
              Arquivo base
              <input type="file" accept=".csv" onChange={(e) => setArquivoCadu(e.target.files?.[0] || null)} />
            </label>
            <button type="submit" disabled={enviandoCadu}>
              {enviandoCadu ? "Enviando..." : "Importar base CADU"}
            </button>
          </form>
          {enviandoCadu ? <p className="muted">Progresso de envio: {progressoCadu}%</p> : null}
          {retornoUploadCadu ? (
            <p className="muted">
              Total: {retornoUploadCadu.total} | Pessoas: {retornoUploadCadu.inseridos} | Familias:{" "}
              {retornoUploadCadu.familias} | Ignorados CPF invalido: {retornoUploadCadu.ignoradosCpfInvalido}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card">
        <h3>Criar empreendimento</h3>
        <form className="form" onSubmit={criarEmpreendimento}>
          <label>
            Nome
            <input value={form.nome} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} required />
          </label>
          <label>
            Endereco
            <input value={form.endereco} onChange={(e) => setForm((s) => ({ ...s, endereco: e.target.value }))} />
          </label>
          <label>
            Municipio
            <input value={form.municipio} onChange={(e) => setForm((s) => ({ ...s, municipio: e.target.value }))} />
          </label>
          <label>
            Numero de unidades
            <input
              value={form.numUnidades}
              onChange={(e) => setForm((s) => ({ ...s, numUnidades: e.target.value }))}
              type="number"
              min="1"
            />
          </label>
          <button type="submit">Salvar empreendimento</button>
        </form>
      </section>

      <section className="card">
        <h3>Upload lista Habitacao (.xls/.xlsx)</h3>
        <form className="form" onSubmit={subirLista}>
          <label>
            Empreendimento
            <select value={selecionadoId} onChange={(e) => setSelecionadoId(e.target.value)}>
              <option value="">Selecione...</option>
              {itens.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arquivo
            <input type="file" accept=".xls,.xlsx" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
          </label>
          <button type="submit">Importar lista</button>
        </form>
        {retornoUpload ? (
          <p className="muted">
            Importados: {retornoUpload.importados} | Ignorados: {retornoUpload.ignorados} | Erros:{" "}
            {retornoUpload.erros?.length || 0}
          </p>
        ) : null}
        <button type="button" onClick={executarCruzamento} disabled={!selecionadoId || executandoCruzamento}>
          {executandoCruzamento ? "Executando cruzamento..." : "Executar cruzamento"}
        </button>
        {retornoCruzamento ? (
          <p className="muted">
            Cruzados: {retornoCruzamento.total} | Encontrados: {retornoCruzamento.encontrados} | Nao encontrados:{" "}
            {retornoCruzamento.naoEncontrados}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h3>Empreendimentos</h3>
        {carregando ? <p className="muted">Carregando...</p> : null}
        {!carregando && itens.length === 0 ? <p className="muted">Nenhum empreendimento cadastrado.</p> : null}
        {itens.length > 0 ? (
          <div className="list">
            {itens.map((item) => (
              <article className="list-item" key={item.id}>
                <strong>{item.nome}</strong>
                <small className="muted">
                  {item.municipio || "Sem municipio"} · {item.status}
                </small>
              </article>
            ))}
          </div>
        ) : null}
        {erro ? <p className="error-text">{erro}</p> : null}
      </section>

      <section className="card">
        <h3>Metricas e resultados ({selecionadoId ? "empreendimento selecionado" : "selecione um empreendimento"})</h3>
        {metricas ? (
          <p className="muted">
            Total: {metricas.totalListados} | Encontrados: {metricas.encontrados} | Nao encontrados:{" "}
            {metricas.naoEncontrados} | Atualizados: {metricas.atualizados} | Desatualizados:{" "}
            {metricas.desatualizados} | Cobertura: {metricas.percentualCobertura}
          </p>
        ) : (
          <p className="muted">Execute o cruzamento para gerar metricas.</p>
        )}

        {resultados.length > 0 ? (
          <div className="list">
            {resultados.map((item) => (
              <article className="list-item" key={item.id}>
                <strong>{item.nomeInformado || "Sem nome"} - {item.cpf}</strong>
                <small className="muted">
                  {item.statusVigilancia} · {item.motivoStatus || "Sem observacao"}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Sem resultados para exibir.</p>
        )}
      </section>
    </div>
  );
}
