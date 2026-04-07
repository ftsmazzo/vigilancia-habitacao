import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 64 }
});

const METRIC_KEYS = [
  "a1",
  "a2",
  "b1",
  "b2",
  "b3",
  "b4",
  "b5",
  "b6",
  "c1",
  "c2",
  "c3",
  "c4",
  "c5",
  "c6",
  "c7",
  "c8",
  "c9",
  "d1",
  "d2",
  "d3",
  "d4",
  "d5",
  "d6",
  "d7",
  "d8"
];

const sumFields = METRIC_KEYS.reduce((acc, k) => {
  acc[k] = true;
  return acc;
}, {});

function stripQuotes(value) {
  if (value == null) return "";
  let t = String(value).trim();
  if (t.startsWith("\ufeff")) t = t.slice(1).trim();
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function normalizeRowKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k)
      .replace(/^\ufeff/, "")
      .trim()
      .toLowerCase();
    out[key] = v;
  }
  return out;
}

function parseMesReferencia(value) {
  const s = stripQuotes(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function parseIntMetric(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function buildRecordFromRow(raw) {
  const row = normalizeRowKeys(raw);
  const mesReferencia = parseMesReferencia(row.mes_referencia);
  const idCras = stripQuotes(row.id_cras);
  if (!mesReferencia || !idCras) {
    return { error: "mes_referencia ou id_cras invalido" };
  }

  const data = {
    mesReferencia,
    idCras,
    nomeUnidade: stripQuotes(row.nome_unidade) || null,
    endereco: stripQuotes(row.endereco) || null,
    municipio: stripQuotes(row.municipio) || null,
    uf: stripQuotes(row.uf) || null,
    coordenadorCras: stripQuotes(row.coordenador_cras) || null,
    cpfCoordenador: stripQuotes(row.cpf)?.replace(/\D/g, "") || null,
    codigoIbge: stripQuotes(row.codigoibge) || null
  };

  for (const key of METRIC_KEYS) {
    data[key] = parseIntMetric(row[key]);
  }

  return { data };
}

function mesReferenciaFromAnoMes(ano, mes) {
  const y = Number(ano);
  const m = Number(mes);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return null;
  }
  return new Date(Date.UTC(y, m - 1, 1));
}

function toNum(v) {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

router.get(
  "/indicadores",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (_req, res) => {
    const itens = await prisma.rmaIndicadorDef.findMany({
      orderBy: { ordem: "asc" }
    });
    return res.json(itens);
  }
);

router.get(
  "/periodos",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (_req, res) => {
    const grupos = await prisma.rmaRegistroMensal.groupBy({
      by: ["mesReferencia"],
      _count: { id: true },
      orderBy: { mesReferencia: "desc" }
    });

    const periodos = grupos.map((g) => {
      const d = g.mesReferencia;
      return {
        mesReferencia: d.toISOString(),
        ano: d.getUTCFullYear(),
        mes: d.getUTCMonth() + 1,
        registros: g._count.id
      };
    });

    return res.json({ periodos });
  }
);

router.get(
  "/overview",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const ano = req.query?.ano;
    const mes = req.query?.mes;
    const mr = mesReferenciaFromAnoMes(ano, mes);
    if (!mr) {
      return res.status(400).json({
        error: true,
        message: "Informe ano e mes validos",
        code: "RMA_OVERVIEW_INVALID_PERIOD"
      });
    }

    const agg = await prisma.rmaRegistroMensal.aggregate({
      where: { mesReferencia: mr },
      _sum: sumFields,
      _count: { id: true }
    });

    const porCrasRaw = await prisma.rmaRegistroMensal.findMany({
      where: { mesReferencia: mr },
      orderBy: [{ nomeUnidade: "asc" }, { idCras: "asc" }],
      select: {
        idCras: true,
        nomeUnidade: true,
        municipio: true,
        ...METRIC_KEYS.reduce((acc, k) => {
          acc[k] = true;
          return acc;
        }, {})
      }
    });

    const porCras = porCrasRaw.map((row) => {
      const o = {
        idCras: row.idCras,
        nomeUnidade: row.nomeUnidade,
        municipio: row.municipio
      };
      for (const k of METRIC_KEYS) {
        const v = row[k];
        o[k] = v == null ? null : toNum(v);
      }
      return o;
    });

    const s = agg._sum || {};
    const totaisMunicipio = {};
    for (const k of METRIC_KEYS) {
      totaisMunicipio[k] = toNum(s[k]);
    }

    const c2 = totaisMunicipio.c2;
    const c3 = totaisMunicipio.c3;
    const a1 = totaisMunicipio.a1;
    const c1 = totaisMunicipio.c1;

    return res.json({
      periodo: {
        ano: mr.getUTCFullYear(),
        mes: mr.getUTCMonth() + 1,
        mesReferencia: mr.toISOString()
      },
      quantidadeCras: agg._count.id,
      totaisMunicipio,
      derivados: {
        encaminhamentosCadUnicoTotal: c2 + c3,
        razaoEncaminhamentosCadUnicoSobreAcompanhamentoPAIF:
          a1 > 0 ? (c2 + c3) / a1 : null,
        mediaAtendimentosIndividualizadosPorCras:
          agg._count.id > 0 ? c1 / agg._count.id : null
      },
      porCras
    });
  }
);

router.post(
  "/upload",
  requireAuth,
  requireRole("MASTER", "ADMIN"),
  uploadSingle.single("arquivo"),
  async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({
        error: true,
        message: "Arquivo CSV ausente (campo arquivo)",
        code: "RMA_UPLOAD_MISSING_FILE"
      });
    }

    let linhas;
    try {
      linhas = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        delimiter: ";",
        bom: true,
        relax_column_count: true,
        trim: true
      });
    } catch (e) {
      return res.status(400).json({
        error: true,
        message: "CSV invalido ou ilegivel",
        code: "RMA_UPLOAD_PARSE_ERROR",
        detalhe: String(e?.message || e)
      });
    }

    let processadas = 0;
    let gravadas = 0;
    const erros = [];
    const BATCH = 40;
    const batch = [];

    async function flush() {
      if (batch.length === 0) return;
      await prisma.$transaction(
        batch.map((data) =>
          prisma.rmaRegistroMensal.upsert({
            where: {
              mesReferencia_idCras: {
                mesReferencia: data.mesReferencia,
                idCras: data.idCras
              }
            },
            create: data,
            update: {
              nomeUnidade: data.nomeUnidade,
              endereco: data.endereco,
              municipio: data.municipio,
              uf: data.uf,
              coordenadorCras: data.coordenadorCras,
              cpfCoordenador: data.cpfCoordenador,
              codigoIbge: data.codigoIbge,
              ...METRIC_KEYS.reduce((acc, k) => {
                acc[k] = data[k];
                return acc;
              }, {})
            }
          })
        )
      );
      gravadas += batch.length;
      batch.length = 0;
    }

    for (const raw of linhas) {
      processadas += 1;
      const built = buildRecordFromRow(raw);
      if (built.error) {
        erros.push({ linha: processadas, mensagem: built.error });
        continue;
      }

      batch.push(built.data);
      if (batch.length >= BATCH) {
        await flush();
      }
    }

    await flush();

    const totalErros = erros.length;
    if (totalErros > 50) {
      erros.splice(50);
    }

    return res.json({
      ok: true,
      nomeArquivo: req.file.originalname || "arquivo.csv",
      processadas,
      gravadas,
      erros: totalErros,
      amostraErros: erros
    });
  }
);

export default router;
