import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api.js";

export function LoginPage({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@vigilancia.local");
  const [senha, setSenha] = useState("admin123");
  const [mensagem, setMensagem] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMensagem("");
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, senha });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      if (onLoginSuccess) {
        await onLoginSuccess();
      }
      navigate("/dashboard");
    } catch (_error) {
      setMensagem("Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card card-login">
      <h2>Acesso ao sistema</h2>
      <p className="muted">Use sua conta para administrar empreendimentos e cruzamentos.</p>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
      {mensagem ? <p className="error-text">{mensagem}</p> : null}
    </section>
  );
}
