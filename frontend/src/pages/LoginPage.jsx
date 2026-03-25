import { useState } from "react";
import { api } from "../services/api.js";

export function LoginPage() {
  const [email, setEmail] = useState("admin@vigilancia.local");
  const [senha, setSenha] = useState("admin123");
  const [mensagem, setMensagem] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setMensagem("");

    try {
      const { data } = await api.post("/auth/login", { email, senha });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setMensagem("Login realizado com sucesso.");
    } catch (_error) {
      setMensagem("Falha no login.");
    }
  }

  return (
    <section className="card">
      <h2>Acesso</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        <button type="submit">Entrar</button>
      </form>
      {mensagem ? <p>{mensagem}</p> : null}
    </section>
  );
}
