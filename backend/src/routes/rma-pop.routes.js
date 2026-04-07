import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  stripQuotes,
  normalizeRowKeys,
  parseMesReferencia,
  parseIntMetric,
  mesReferenciaFromAnoMes,
  anoUtcRange,
  parseMesQuery,
  toNum,
  decodeCsvBuffer
} from "../utils/rmaCsv.js";

const router = Router();
const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 64 }
});

const METADATA_KEYS = new Set([
  "mes_ano",
  "mes_referencia",
  "nome_unidade",
  "id_unidade",
  "endereco",
  "municipio",
  "uf",
  "coordenador",
  "cpf",
  "ibge"
]);

const DESTAQUE_KEYS = ["a1", "d1", "e1", "c1", "c2", "b1"];

function sortPorPop(rows) {
  return [...rows].sort((a, b) => {
    const cmp = String(a.nomeUnidade || "").localeCompare(
      String(b.nomeUnidade || ""),
      "pt-BR"
    );
    if (cmp !== 0) return cmp;
    return String(a.idUnidade || "").localeCompare(String(b.idUnidade || ""), "pt-BR");
  });
}

function sumMetricasRows(rows) {
  const tot = {};
  for (const row of rows) {
    const m = row.metricas;
    if (!m || typeof m !== "object") continue;
    for (const [k, v] of Object.entries(m)) {
      tot[k] = (tot[k] || 0) + toNum(v);
    }
  }
  return tot;
}

function mergeMetricas(into, from) {
  const m = from || {};
  for (const [k, v] of Object.entries(m)) {
    into[k] = (into[k] || 0) + toNum(v);
  }
}

function groupByPop(rowsDb) {
  const map = new Map();
  for (const row of rowsDb) {
    const id = row.idUnidade;
    if (!map.has(id)) {
      map.set(id, {
        idUnidade: id,
        nomeUnidade: row.nomeUnidade,
        municipio: row.municipio,
        mesReferenciaMax: row.mesReferencia,
        metricas: {}
      });
    }
    const agg = map.get(id);
    if (row.mesReferencia > agg.mesReferenciaMax) {
      agg.mesReferenciaMax = row.mesReferencia;
      agg.nomeUnidade = row.nomeUnidade;
      agg.municipio = row.municipio;
    }
    mergeMetricas(agg.metricas, row.metricas);
  }
  const list = Array.from(map.values()).map((agg) => {
    const { mesReferenciaMax: _x, ...rest } = agg;
    return {
      ...rest,
      destaques: destaquesFromMetricas(rest.metricas)
    };
  });
  return sortPorPop(list);
}

function destaquesFromMetricas(metricas) {
  const m = metricas || {};
  const out = {};
  for (const k of DESTAQUE_KEYS) {
    out[k] = m[k] == null ? null : toNum(m[k]);
  }
  return out;
}

function buildRecordFromRow(raw) {
  const row = normalizeRowKeys(raw);
  const mesReferencia =
    parseMesReferencia(row.mes_referencia) || parseMesReferencia(row.mes_ano);
  const idUnidade = stripQuotes(row.id_unidade);
  if (!mesReferencia || !idUnidade) {
    return { error: "mes_ano (ou mes_referencia) ou id_unidade invalido" };
  }

  const metricas = {};
  for (const [k, v] of Object.entries(row)) {
    if (METADATA_KEYS.has(k)) continue;
    const num = parseIntMetric(v);
    if (num !== null) metricas[k] = num;
  }

  return {
    data: {
      mesReferencia,
      idUnidade,
      nomeUnidade: stripQuotes(row.nome_unidade) || null,
      endereco: stripQuotes(row.endereco) || null,
      municipio: stripQuotes(row.municipio) || null,
      uf: stripQuotes(row.uf) || null,
      coordenadorPop: stripQuotes(row.coordenador) || null,
      cpfCoordenador: stripQuotes(row.cpf)?.replace(/\D/g, "") || null,
      codigoIbge: stripQuotes(row.ibge) || null,
      metricas
    }
  };
}

function derivadosPop(totais, quantidadeUnidades) {
  const a1 = toNum(totais.a1);
  const d1 = toNum(totais.d1);
  const c1 = toNum(totais.c1);
  const c2 = toNum(totais.c2);
  return {
    mediaD1PorUnidade: quantidadeUnidades > 0 ? d1 / quantidadeUnidades : null,
    razaoCadUnicoSobreA1: a1 > 0 ? (c1 + c2) / a1 : null
  };
}

router.get(
  "/indicadores",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (_req, res) => {
    const itens = await prisma.rmaPopIndicadorDef.findMany({
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
    const grupos = await prisma.rmaPopRegistroMensal.groupBy({
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
  "/unidades",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const ano = Number(req.query?.ano);
    if (!Number.isFinite(ano)) {
      return res.status(400).json({
        error: true,
        message: "Informe ano valido",
        code: "RMA_POP_UNIDADES_INVALID_ANO"
      });
    }
    const range = anoUtcRange(ano);
    const rows = await prisma.rmaPopRegistroMensal.findMany({
      where: {
        mesReferencia: { gte: range.inicio, lt: range.fim }
      },
      select: {
        idUnidade: true,
        nomeUnidade: true,
        mesReferencia: true
      },
      orderBy: { mesReferencia: "desc" }
    });
    const seen = new Map();
    for (const r of rows) {
      if (!seen.has(r.idUnidade)) {
        seen.set(r.idUnidade, {
          idUnidade: r.idUnidade,
          nomeUnidade: r.nomeUnidade
        });
      }
    }
    const lista = sortPorPop(Array.from(seen.values()));
    return res.json(lista);
  }
);

router.get(
  "/overview",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const ano = Number(req.query?.ano);
    const mesParam = parseMesQuery(req.query?.mes);
    const idUnidadeFiltro = req.query?.idUnidade
      ? String(req.query.idUnidade).trim()
      : null;

    if (!Number.isFinite(ano)) {
      return res.status(400).json({
        error: true,
        message: "Informe ano valido",
        code: "RMA_POP_OVERVIEW_INVALID_YEAR"
      });
    }

    if (mesParam === null) {
      return res.status(400).json({
        error: true,
        message: "Informe mes (1-12) ou TODOS para o ano inteiro",
        code: "RMA_POP_OVERVIEW_INVALID_MONTH"
      });
    }

    const agregacao = mesParam === "TODOS" ? "ano" : "mes";

    let whereBase;
    if (agregacao === "mes") {
      const mr = mesReferenciaFromAnoMes(ano, mesParam);
      if (!mr) {
        return res.status(400).json({
          error: true,
          message: "Mes invalido",
          code: "RMA_POP_OVERVIEW_INVALID_PERIOD"
        });
      }
      whereBase = { mesReferencia: mr };
    } else {
      const range = anoUtcRange(ano);
      whereBase = {
        mesReferencia: { gte: range.inicio, lt: range.fim }
      };
    }

    if (idUnidadeFiltro) {
      whereBase.idUnidade = idUnidadeFiltro;
    }

    const rowsDb = await prisma.rmaPopRegistroMensal.findMany({
      where: whereBase,
      orderBy: [{ mesReferencia: "asc" }, { idUnidade: "asc" }]
    });

    let totaisMunicipio;
    let quantidadeUnidades;
    let porPop;

    if (agregacao === "mes") {
      totaisMunicipio = sumMetricasRows(rowsDb);
      quantidadeUnidades = idUnidadeFiltro
        ? rowsDb.length > 0
          ? 1
          : 0
        : rowsDb.length;
      porPop = sortPorPop(
        rowsDb.map((r) => ({
          idUnidade: r.idUnidade,
          nomeUnidade: r.nomeUnidade,
          municipio: r.municipio,
          metricas: r.metricas,
          destaques: destaquesFromMetricas(r.metricas)
        }))
      );
    } else {
      totaisMunicipio = sumMetricasRows(rowsDb);
      const distinct = new Set(rowsDb.map((r) => r.idUnidade));
      quantidadeUnidades = idUnidadeFiltro
        ? distinct.size > 0
          ? 1
          : 0
        : distinct.size;
      porPop = groupByPop(rowsDb);
    }

    const derivados = derivadosPop(
      totaisMunicipio,
      quantidadeUnidades > 0 ? quantidadeUnidades : 0
    );

    const range = anoUtcRange(ano);
    const mrSingle =
      agregacao === "mes" ? mesReferenciaFromAnoMes(ano, mesParam) : null;

    return res.json({
      agregacao,
      filtroIdUnidade: idUnidadeFiltro,
      periodo: {
        ano,
        mes: agregacao === "mes" ? mesParam : null,
        mesReferencia: mrSingle ? mrSingle.toISOString() : null,
        mesReferenciaInicio: agregacao === "ano" ? range.inicio.toISOString() : null,
        mesReferenciaFim:
          agregacao === "ano"
            ? new Date(range.fim.getTime() - 1).toISOString()
            : null
      },
      quantidadeUnidades,
      totaisMunicipio,
      derivados,
      porPop,
      aviso:
        agregacao === "ano"
          ? "Visao anual: valores somados mes a mes. Indicadores de perfil (ex.: A.1) nao representam saldo unico; use um mes para essa leitura."
          : null
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
        code: "RMA_POP_UPLOAD_MISSING_FILE"
      });
    }

    const texto = decodeCsvBuffer(req.file.buffer);

    let linhas;
    try {
      linhas = parse(texto, {
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
        code: "RMA_POP_UPLOAD_PARSE_ERROR",
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
          prisma.rmaPopRegistroMensal.upsert({
            where: {
              mesReferencia_idUnidade: {
                mesReferencia: data.mesReferencia,
                idUnidade: data.idUnidade
              }
            },
            create: data,
            update: {
              nomeUnidade: data.nomeUnidade,
              endereco: data.endereco,
              municipio: data.municipio,
              uf: data.uf,
              coordenadorPop: data.coordenadorPop,
              cpfCoordenador: data.cpfCoordenador,
              codigoIbge: data.codigoIbge,
              metricas: data.metricas
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
