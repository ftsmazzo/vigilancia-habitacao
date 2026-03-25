import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export function DashboardPage({ usuario }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [selecionadoId, setSelecionadoId] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [retornoUpload, setRetornoUpload] = useState(null);
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
    } catch (_error) {
      setErro("Falha no upload da lista.");
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
    </div>
  );
}
