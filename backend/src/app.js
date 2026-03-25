import "dotenv/config";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import empreendimentosRoutes from "./routes/empreendimentos.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";
import caduRoutes from "./routes/cadu.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

const app = express();

app.set("trust proxy", 1);

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  return res.json({
    ok: true,
    service: "backend-habitacao",
    docs: "/api/health"
  });
});

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/cadu", caduRoutes);
app.use("/api/empreendimentos", empreendimentosRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((error, _req, res, _next) => {
  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: true,
      message: "Arquivo excede limite de upload (max 512MB)",
      code: "UPLOAD_FILE_TOO_LARGE"
    });
  }

  console.error(error);
  return res.status(500).json({
    error: true,
    message: "Erro interno",
    code: "INTERNAL_SERVER_ERROR"
  });
});

export default app;
