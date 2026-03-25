import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { normalizeCpf } from "../utils/cpf.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 50 } });

function parseDateBr(value) {
  if (!value) return null;
  const [d, m, y] = String(value).split("/");
  if (!d || !m || !y) return null;
  const date = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseTipo(especie) {
  const text = String(especie || "").toLowerCase();
  if (text.includes("idoso")) return "IDOSO";
  if (text.includes("deficiente")) return "DEFICIENTE";
  return "OUTRO";
}

router.post("/upload", requireAuth, requireRole("MASTER"), upload.single("arquivo"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({
      error: true,
      message: "Arquivo CSV BPC obrigatorio",
      code: "BPC_FILE_REQUIRED"
    });
  }

  let records;
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ",",
      bom: true,
      trim: true,
      relax_column_count: true
    });
  } catch (_error) {
    return res.status(400).json({
      error: true,
      message: "CSV BPC invalido",
      code: "BPC_CSV_INVALID"
    });
  }

  await prisma.bpcBeneficio.deleteMany();

  const data = [];
  let ignoradosCpfInvalido = 0;

  for (const row of records) {
    const cpf = normalizeCpf(row["CPF"]);
    if (!cpf) {
      ignoradosCpfInvalido += 1;
      continue;
    }

    data.push({
      cpf,
      nomeTitular: row["Nome Titular"] || null,
      numeroBeneficio: row["Numero Beneficio"] || null,
      especieBeneficio: row["Especie Ben."] || null,
      tipo: parseTipo(row["Especie Ben."]),
      situacao: row["Situacao"] || null,
      cadunico: row["Cadunico"] || null,
      situacaoCadastral: row["Situacao Cadastral"] || null,
      dataAtualizacaoFam: parseDateBr(row["Data Atualizacao Fam"]),
      competenciaPeriodo: parseDateBr(row["Competencia Periodo Situacao"]),
      municipio: row["Municipio"] || null,
      uf: row["UF"] || null
    });
  }

  if (data.length) {
    await prisma.bpcBeneficio.createMany({ data, skipDuplicates: true });
  }

  await prisma.logAuditoria.create({
    data: {
      usuarioId: req.user.sub,
      acao: "UPLOAD_BPC",
      detalhes: {
        total: records.length,
        importados: data.length,
        ignoradosCpfInvalido
      }
    }
  });

  return res.json({
    total: records.length,
    importados: data.length,
    ignoradosCpfInvalido
  });
});

router.get("/status", requireAuth, requireRole("MASTER", "ADMIN"), async (_req, res) => {
  const [total, idosos, deficientes, ultimo] = await Promise.all([
    prisma.bpcBeneficio.count(),
    prisma.bpcBeneficio.count({ where: { tipo: "IDOSO" } }),
    prisma.bpcBeneficio.count({ where: { tipo: "DEFICIENTE" } }),
    prisma.bpcBeneficio.findFirst({
      orderBy: { importadoEm: "desc" },
      select: { importadoEm: true, competenciaPeriodo: true }
    })
  ]);

  return res.json({
    total,
    idosos,
    deficientes,
    ultimoUploadEm: ultimo?.importadoEm || null,
    competenciaReferencia: ultimo?.competenciaPeriodo || null
  });
});

export default router;
