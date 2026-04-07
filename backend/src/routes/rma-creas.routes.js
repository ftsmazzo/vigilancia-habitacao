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
  "mes_referencia",
  "nome_unidade",
  "id_creas",
  "endereco",
  "municipio",
  "uf",
  "coordenador_creas",
  "cpf",
  "codigoibge"
]);

const DESTAQUE_KEYS = ["a1", "a2", "b1", "c1", "m1", "m4"];

function ordemCreas(nomeUnidade) {
  const nome = (nomeUnidade || "").toLowerCase();
  if (nome.includes("pop")) return 1;
  const paefi = /paefi\s*(\d+)/i.exec(nomeUnidade || "");
  if (paefi) return 10 + parseInt(paefi[1], 10);
  return 100;
}

function sortPorCreas(rows) {
  return [...rows].sort((a, b) => {
    const oa = ordemCreas(a.nomeUnidade);
    const ob = ordemCreas(b.nomeUnidade);
    if (oa !== ob) return oa - ob;
    return String(a.idCreas || "").localeCompare(String(b.idCreas || ""), "pt-BR");
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

function groupByCreas(rowsDb) {
  const map = new Map();
  for (const row of rowsDb) {
    const id = row.idCreas;
    if (!map.has(id)) {
      map.set(id, {
        idCreas: id,
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
  return sortPorCreas(list);
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
  const mesReferencia = parseMesReferencia(row.mes_referencia);
  const idCreas = stripQuotes(row.id_creas);
  if (!mesReferencia || !idCreas) {
    return { error: "mes_referencia ou id_creas invalido" };
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
      idCreas,
      nomeUnidade: stripQuotes(row.nome_unidade) || null,
      endereco: stripQuotes(row.endereco) || null,
      municipio: stripQuotes(row.municipio) || null,
      uf: stripQuotes(row.uf) || null,
      coordenadorCreas: stripQuotes(row.coordenador_creas) || null,
      cpfCoordenador: stripQuotes(row.cpf)?.replace(/\D/g, "") || null,
      codigoIbge: stripQuotes(row.codigoibge) || null,
      metricas
    }
  };
}

function derivadosCreas(totais, quantidadeUnidades) {
  const a1 = toNum(totais.a1);
  const a2 = toNum(totais.a2);
  const m1 = toNum(totais.m1);
  return {
    mediaAtendimentosIndivPorUnidade:
      quantidadeUnidades > 0 ? m1 / quantidadeUnidades : null,
    razaoNovosCasosSobreAcompanhamento: a1 > 0 ? a2 / a1 : null
  };
}

router.get(
  "/indicadores",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (_req, res) => {
    const itens = await prisma.rmaCreasIndicadorDef.findMany({
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
    const grupos = await prisma.rmaCreasRegistroMensal.groupBy({
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
        code: "RMA_CREAS_UNIDADES_INVALID_ANO"
      });
    }
    const range = anoUtcRange(ano);
    const rows = await prisma.rmaCreasRegistroMensal.findMany({
      where: {
        mesReferencia: { gte: range.inicio, lt: range.fim }
      },
      select: {
        idCreas: true,
        nomeUnidade: true,
        mesReferencia: true
      },
      orderBy: { mesReferencia: "desc" }
    });
    const seen = new Map();
    for (const r of rows) {
      if (!seen.has(r.idCreas)) {
        seen.set(r.idCreas, {
          idCreas: r.idCreas,
          nomeUnidade: r.nomeUnidade,
          ordem: ordemCreas(r.nomeUnidade)
        });
      }
    }
    const lista = sortPorCreas(Array.from(seen.values()));
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
    const idCreasFiltro = req.query?.idCreas
      ? String(req.query.idCreas).trim()
      : null;

    if (!Number.isFinite(ano)) {
      return res.status(400).json({
        error: true,
        message: "Informe ano valido",
        code: "RMA_CREAS_OVERVIEW_INVALID_YEAR"
      });
    }

    if (mesParam === null) {
      return res.status(400).json({
        error: true,
        message: "Informe mes (1-12) ou TODOS para o ano inteiro",
        code: "RMA_CREAS_OVERVIEW_INVALID_MONTH"
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
          code: "RMA_CREAS_OVERVIEW_INVALID_PERIOD"
        });
      }
      whereBase = { mesReferencia: mr };
    } else {
      const range = anoUtcRange(ano);
      whereBase = {
        mesReferencia: { gte: range.inicio, lt: range.fim }
      };
    }

    if (idCreasFiltro) {
      whereBase.idCreas = idCreasFiltro;
    }

    const rowsDb = await prisma.rmaCreasRegistroMensal.findMany({
      where: whereBase,
      orderBy: [{ mesReferencia: "asc" }, { idCreas: "asc" }]
    });

    let totaisMunicipio;
    let quantidadeUnidades;
    let porCreas;

    if (agregacao === "mes") {
      totaisMunicipio = sumMetricasRows(rowsDb);
      quantidadeUnidades = idCreasFiltro
        ? rowsDb.length > 0
          ? 1
          : 0
        : rowsDb.length;
      porCreas = sortPorCras(
        rowsDb.map((r) => ({
          idCreas: r.idCreas,
          nomeUnidade: r.nomeUnidade,
          municipio: r.municipio,
          metricas: r.metricas,
          destaques: destaquesFromMetricas(r.metricas)
        }))
      );
    } else {
      totaisMunicipio = sumMetricasRows(rowsDb);
      const distinct = new Set(rowsDb.map((r) => r.idCreas));
      quantidadeUnidades = idCreasFiltro
        ? distinct.size > 0
          ? 1
          : 0
        : distinct.size;
      porCreas = groupByCreas(rowsDb);
    }

    const derivados = derivadosCreas(
      totaisMunicipio,
      quantidadeUnidades > 0 ? quantidadeUnidades : 0
    );

    const range = anoUtcRange(ano);
    const mrSingle =
      agregacao === "mes" ? mesReferenciaFromAnoMes(ano, mesParam) : null;

    return res.json({
      agregacao,
      filtroIdCreas: idCreasFiltro,
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
      porCreas,
      aviso:
        agregacao === "ano"
          ? "Visao anual: valores somados mes a mes. Indicadores de estoque (ex.: A.1) nao representam saldo unico; use um mes para essa leitura."
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
        code: "RMA_CREAS_UPLOAD_MISSING_FILE"
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
        code: "RMA_CREAS_UPLOAD_PARSE_ERROR",
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
          prisma.rmaCreasRegistroMensal.upsert({
            where: {
              mesReferencia_idCreas: {
                mesReferencia: data.mesReferencia,
                idCreas: data.idCreas
              }
            },
            create: data,
            update: {
              nomeUnidade: data.nomeUnidade,
              endereco: data.endereco,
              municipio: data.municipio,
              uf: data.uf,
              coordenadorCreas: data.coordenadorCreas,
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
