export function DashboardPage({ usuario }) {
  return (
    <div className="dashboard-grid">
      <section className="card">
        <h2>Bem-vindo, {usuario?.nome}</h2>
        <p className="muted">
          Perfil atual: <strong>{usuario?.role}</strong>. O perfil MASTER administra usuarios e acessa todos os dados.
        </p>
      </section>

      <section className="card kpi">
        <h3>Proximo modulo</h3>
        <p>Upload CADU</p>
      </section>
      <section className="card kpi">
        <h3>Proximo modulo</h3>
        <p>Lista de pre-selecionados</p>
      </section>
      <section className="card kpi">
        <h3>Proximo modulo</h3>
        <p>Cruzamento e metricas</p>
      </section>
    </div>
  );
}
