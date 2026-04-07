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

/** Ordem de exibicao: CRAS 1..8 pelo nome; Bonfim Paulista = 9; demais por ultimo */
function ordemCras(nomeUnidade, idCras) {
  const nome = (nomeUnidade || "").toLowerCase();
  if (nome.includes("bonfim")) return 9;
  const m = /cras\s*(\d+)/i.exec(nomeUnidade || "");
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 99) return n;
  }
  const tail = String(idCras || "").slice(-2);
  const n2 = parseInt(tail, 10);
  if (Number.isFinite(n2)) return 100 + n2;
  return 500;
}

function metricZeros() {
  return METRIC_KEYS.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {});
}

function sumRowsMetrics(rows) {
  const tot = metricZeros();
  for (const row of rows) {
    for (const k of METRIC_KEYS) {
      tot[k] += toNum(row[k]);
    }
  }
  return tot;
}

function groupByCras(rows, defMap) {
  const map = new Map();
  for (const row of rows) {
    const id = row.idCras;
    if (!map.has(id)) {
      map.set(id, {
        idCras: id,
        nomeUnidade: row.nomeUnidade,
        municipio: row.municipio,
        mesReferenciaMax: row.mesReferencia,
        ...metricZeros()
      });
    }
    const agg = map.get(id);
    if (row.mesReferencia > agg.mesReferenciaMax) {
      agg.mesReferenciaMax = row.mesReferencia;
      agg.nomeUnidade = row.nomeUnidade;
      agg.municipio = row.municipio;
    }
    for (const k of METRIC_KEYS) {
      agg[k] += toNum(row[k]);
    }
  }
  const list = Array.from(map.values()).map((agg) => {
    const { mesReferenciaMax: _m, ...rest } = agg;
    return rest;
  });
  return sortPorCras(list, defMap);
}

function mapRowToPorCras(row) {
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
}

function derivadosFromTotais(totaisMunicipio, quantidadeCras) {
  const c2 = totaisMunicipio.c2;
  const c3 = totaisMunicipio.c3;
  const a1 = totaisMunicipio.a1;
  const c1 = totaisMunicipio.c1;
  return {
    encaminhamentosCadUnicoTotal: c2 + c3,
    razaoEncaminhamentosCadUnicoSobreAcompanhamentoPAIF:
      a1 > 0 ? (c2 + c3) / a1 : null,
    mediaAtendimentosIndividualizadosPorCras:
      quantidadeCras > 0 ? c1 / quantidadeCras : null
  };
}

async function loadCrasDefMap() {
  const rows = await prisma.rmaCrasUnidadeDef.findMany();
  return new Map(rows.map((r) => [r.idCras, r]));
}

function nomeExibicaoCras(idCras, nomeUnidade, defMap) {
  const d = defMap.get(idCras);
  if (d?.rotuloPadrao) return d.rotuloPadrao;
  return `CRAS (id ${String(idCras || "").trim()})`;
}

function ordemCrasComDef(idCras, nomeUnidade, defMap) {
  const d = defMap.get(idCras);
  if (d != null && Number.isFinite(d.ordem)) return d.ordem;
  return ordemCras(nomeUnidade, idCras);
}

function sortPorCras(rows, defMap) {
  return [...rows].sort((a, b) => {
    const oa = ordemCrasComDef(a.idCras, a.nomeUnidade, defMap);
    const ob = ordemCrasComDef(b.idCras, b.nomeUnidade, defMap);
    if (oa !== ob) return oa - ob;
    return String(a.idCras).localeCompare(String(b.idCras), "pt-BR");
  });
}

function enrichPorCras(row, defMap) {
  return {
    ...row,
    nomeExibicao: nomeExibicaoCras(row.idCras, row.nomeUnidade, defMap)
  };
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
  "/unidades",
  requireAuth,
  requireRole("MASTER", "ADMIN", "VIGILANCIA"),
  async (req, res) => {
    const ano = Number(req.query?.ano);
    if (!Number.isFinite(ano)) {
      return res.status(400).json({
        error: true,
        message: "Informe ano valido",
        code: "RMA_UNIDADES_INVALID_ANO"
      });
    }
    const range = anoUtcRange(ano);
    const defMap = await loadCrasDefMap();
    const rows = await prisma.rmaRegistroMensal.findMany({
      where: {
        mesReferencia: { gte: range.inicio, lt: range.fim }
      },
      select: {
        idCras: true,
        nomeUnidade: true,
        mesReferencia: true
      },
      orderBy: { mesReferencia: "desc" }
    });
    const seen = new Map();
    for (const r of rows) {
      if (!seen.has(r.idCras)) {
        seen.set(r.idCras, {
          idCras: r.idCras,
          nomeUnidade: r.nomeUnidade,
          ordem: ordemCrasComDef(r.idCras, r.nomeUnidade, defMap)
        });
      }
    }
    const lista = sortPorCras(Array.from(seen.values()), defMap).map((u) => ({
      ...u,
      nomeExibicao: nomeExibicaoCras(u.idCras, u.nomeUnidade, defMap)
    }));
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
    const idCrasFiltro = req.query?.idCras
      ? String(req.query.idCras).trim()
      : null;

    if (!Number.isFinite(ano)) {
      return res.status(400).json({
        error: true,
        message: "Informe ano valido",
        code: "RMA_OVERVIEW_INVALID_YEAR"
      });
    }

    if (mesParam === null) {
      return res.status(400).json({
        error: true,
        message: "Informe mes (1-12) ou TODOS para o ano inteiro",
        code: "RMA_OVERVIEW_INVALID_MONTH"
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
          code: "RMA_OVERVIEW_INVALID_PERIOD"
        });
      }
      whereBase = { mesReferencia: mr };
    } else {
      const range = anoUtcRange(ano);
      whereBase = {
        mesReferencia: { gte: range.inicio, lt: range.fim }
      };
    }

    if (idCrasFiltro) {
      whereBase.idCras = idCrasFiltro;
    }

    const defMap = await loadCrasDefMap();

    const rowsDb = await prisma.rmaRegistroMensal.findMany({
      where: whereBase,
      orderBy: [{ mesReferencia: "asc" }, { idCras: "asc" }]
    });

    const rows = rowsDb.map((r) => mapRowToPorCras(r));

    let totaisMunicipio;
    let quantidadeCras;
    let porCras;

    if (agregacao === "mes") {
      const agg = await prisma.rmaRegistroMensal.aggregate({
        where: whereBase,
        _sum: sumFields,
        _count: { id: true }
      });
      const s = agg._sum || {};
      totaisMunicipio = {};
      for (const k of METRIC_KEYS) {
        totaisMunicipio[k] = toNum(s[k]);
      }
      quantidadeCras = idCrasFiltro
        ? agg._count.id > 0
          ? 1
          : 0
        : agg._count.id;
      porCras = sortPorCras(rows, defMap).map((r) => enrichPorCras(r, defMap));
    } else {
      totaisMunicipio = sumRowsMetrics(rows);
      const distinctCras = new Set(rows.map((r) => r.idCras));
      quantidadeCras = idCrasFiltro
        ? distinctCras.size > 0
          ? 1
          : 0
        : distinctCras.size;
      porCras = groupByCras(rowsDb, defMap).map((r) => enrichPorCras(r, defMap));
    }

    const derivados = derivadosFromTotais(
      totaisMunicipio,
      quantidadeCras > 0 ? quantidadeCras : 0
    );

    const range = anoUtcRange(ano);
    const mrSingle =
      agregacao === "mes" ? mesReferenciaFromAnoMes(ano, mesParam) : null;

    return res.json({
      agregacao,
      filtroIdCras: idCrasFiltro,
      periodo: {
        ano,
        mes: agregacao === "mes" ? mesParam : null,
        mesReferencia: mrSingle ? mrSingle.toISOString() : null,
        mesReferenciaInicio: agregacao === "ano" ? range.inicio.toISOString() : null,
        mesReferenciaFim: agregacao === "ano" ? new Date(range.fim.getTime() - 1).toISOString() : null
      },
      quantidadeCras,
      totaisMunicipio,
      derivados,
      porCras,
      aviso:
        agregacao === "ano"
          ? "Visao anual: valores somados mes a mes. Indicadores de estoque (ex.: A.1) nao representam saldo unico; use o mes para esse tipo de leitura."
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
        code: "RMA_UPLOAD_MISSING_FILE"
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
