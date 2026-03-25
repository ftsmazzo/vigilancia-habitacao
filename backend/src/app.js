import "dotenv/config";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import empreendimentosRoutes from "./routes/empreendimentos.routes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/empreendimentos", empreendimentosRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(500).json({
    error: true,
    message: "Erro interno",
    code: "INTERNAL_SERVER_ERROR"
  });
});

export default app;
