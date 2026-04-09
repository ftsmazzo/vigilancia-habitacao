import { Router } from "express";
import { z } from "zod";
import XLSX from "xlsx";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  extrairCodFormaColetaFamilia,
  extrairCpfParceiroRfConjuge,
  extrairParentescoPessoa
} from "../utils/caduDominios.js";
import { normalizeCpf } from "../utils/cpf.js";

const router = Router();

const allowedColumns = [
  "empreendimento",
  "nomeInformado",
  "cpf",
  "nisInformado",
  "contato",
  "statusVigilancia",
  "motivoStatus",
  "dataAtualizacaoInscricao",
  "cruzadoEm",
  "caduNome",
  "caduNis",
  "caduDataAtualFam",
  "formaColetaFamilia",
  "parentescoRfPessoa",
  "cpfConjugeOuCompanheiro",
  "recebePbf",
  "recebeBpc",
  "tipoBpc"
];

const filterFields = z.object({
  empreendimentoId: z.string().uuid().optional(),
  statusVigilancia: z.enum(["TODOS", "NAO_ENCONTRADO", "DESATUALIZADO", "ATUALIZADO"]).optional(),
  pbf: z.enum(["TODOS", "COM_BOLSA", "SEM_BOLSA"]).optional(),
  bpc: z.enum(["TODOS", "COM_BPC", "SEM_BPC"]).optional(),
  bpcTipo: z.enum(["TODOS", "IDOSO", "DEFICIENTE"]).optional(),
  q: z.string().optional()
});

const exportSchema = filterFields.extend({
  columns: z.array(z.enum(allowedColumns)).min(1)
});

const previewSchema = filterFields.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

function buildColumnMap() {
  return {
    empreendimento: { label: "Empreendimento", value: (item) => item.empreendimentoNome },
    nomeInformado: { label: "Nome Informado", value: (item) => item.nomeInformado || "" },
    cpf: { label: "CPF", value: (item) => item.cpf || "" },
    nisInformado: { label: "NIS Informado", value: (item) => item.nisInformado || "" },
    contato: { label: "Contato", value: (item) => item.contato || "" },
    statusVigilancia: { label: "Status Vigilancia", value: (item) => item.statusVigilancia || "" },
    motivoStatus: { label: "Motivo Status", value: (item) => item.motivoStatus || "" },
    dataAtualizacaoInscricao: {
      label: "Data Atualizacao Inscricao",
      value: (item) => formatDate(item.dataAtualizacaoInscricao)
    },
    cruzadoEm: { label: "Cruzado Em", value: (item) => formatDate(item.cruzadoEm) },
    caduNome: { label: "Nome CADU", value: (item) => item.caduNome },
    caduNis: { label: "NIS CADU", value: (item) => item.caduNis },
    caduDataAtualFam: { label: "Data Atualizacao CADU", value: (item) => formatDate(item.caduDataAtualFam) },
    formaColetaFamilia: {
      label: "Forma coleta (familia — visita domiciliar)",
      value: (item) => item.formaColetaFamilia || ""
    },
    parentescoRfPessoa: {
      label: "Parentesco com RF (CadU)",
      value: (item) => item.parentescoRfPessoa || ""
    },
    cpfConjugeOuCompanheiro: {
      label: "CPF conjuge ou companheiro(a) do RF",
      value: (item) => item.cpfConjugeOuCompanheiro || ""
    },
    recebePbf: { label: "Recebe Bolsa Familia", value: (item) => (item.recebePbfCalculado ? "SIM" : "NAO") },
    recebeBpc: { label: "Recebe BPC", value: (item) => (item.recebeBpcCalculado ? "SIM" : "NAO") },
    tipoBpc: { label: "Tipo BPC", value: (item) => item.tipoBpcCalculado || "" }
  };
}

async function loadRelatorioItens({
  empreendimentoId,
  statusVigilancia = "TODOS",
  pbf = "TODOS",
  bpc = "TODOS",
  bpcTipo = "TODOS",
  q = ""
}) {
  const where = {};

  if (empreendimentoId) where.empreendimentoId = empreendimentoId;
  if (statusVigilancia !== "TODOS") where.statusVigilancia = statusVigilancia;
  if (q.trim()) {
    where.OR = [{ nomeInformado: { contains: q.trim(), mode: "insensitive" } }, { cpf: { contains: q.trim() } }];
  }

  const itensBase = await prisma.preSelecionado.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    include: {
      empreendimento: {
        select: { nome: true }
      }
    }
  });

  const cpfs = [...new Set(itensBase.map((item) => item.cpf))];
  const [caduRows, bpcRows] = cpfs.length
    ? await Promise.all([
        prisma.caduPessoa.findMany({
          where: { cpf: { in: cpfs } },
          select: {
            cpf: true,
            nomePessoa: true,
            nisPessoa: true,
            dataAtualFam: true,
            recebePbfFam: true,
            recebePbfPessoa: true,
            codFamiliarFam: true
          }
        }),
        prisma.bpcBeneficio.findMany({
          where: { cpf: { in: cpfs } },
          select: { cpf: true, tipo: true }
        })
      ])
    : [[], []];

  const caduByCpf = new Map(caduRows.map((row) => [row.cpf, row]));
  const bpcByCpf = new Map(bpcRows.map((row) => [row.cpf, row]));

  const familiasIds = [...new Set(caduRows.map((r) => r.codFamiliarFam).filter(Boolean))];
  const [familiasRows, rawLinhasRows] =
    familiasIds.length > 0
      ? await Promise.all([
          prisma.caduFamilia.findMany({
            where: { codFamiliarFam: { in: familiasIds } },
            select: { codFamiliarFam: true, rawDadosTxt: true }
          }),
          prisma.caduRawLinha.findMany({
            where: { codFamiliarFam: { in: familiasIds } },
            select: { codFamiliarFam: true, dadosTxt: true, cpfPessoa: true }
          })
        ])
      : [[], []];

  const familiaByCod = new Map(familiasRows.map((f) => [f.codFamiliarFam, f]));
  const rawByFam = new Map();
  for (const l of rawLinhasRows) {
    if (!l.codFamiliarFam) continue;
    if (!rawByFam.has(l.codFamiliarFam)) rawByFam.set(l.codFamiliarFam, []);
    rawByFam.get(l.codFamiliarFam).push(l);
  }

  return itensBase
    .map((item) => {
      const cadu = caduByCpf.get(item.cpf);
      const bpcItem = bpcByCpf.get(item.cpf);

      let formaColetaFamilia = "";
      let parentescoRfPessoa = "";
      let cpfConjugeOuCompanheiro = "";
      if (cadu?.codFamiliarFam) {
        const fam = familiaByCod.get(cadu.codFamiliarFam);
        const linhas = rawByFam.get(cadu.codFamiliarFam) || [];
        const rawTxt = fam?.rawDadosTxt || linhas[0]?.dadosTxt || "";
        const fc = extrairCodFormaColetaFamilia(rawTxt);
        formaColetaFamilia =
          fc.codigo && fc.label ? `${fc.codigo} — ${fc.label}` : fc.label || fc.codigo;
        const cpfNorm = normalizeCpf(cadu.cpf);
        const par = extrairParentescoPessoa(cpfNorm, linhas);
        parentescoRfPessoa =
          par.codigo && par.label ? `${par.codigo} — ${par.label}` : par.label || par.codigo;
        cpfConjugeOuCompanheiro = extrairCpfParceiroRfConjuge(cpfNorm, linhas);
      }

      return {
        ...item,
        empreendimentoNome: item.empreendimento?.nome || "",
        caduNome: cadu?.nomePessoa || "",
        caduNis: cadu?.nisPessoa || "",
        caduDataAtualFam: cadu?.dataAtualFam || null,
        formaColetaFamilia,
        parentescoRfPessoa,
        cpfConjugeOuCompanheiro,
        recebePbfCalculado: Boolean(cadu?.recebePbfFam || cadu?.recebePbfPessoa),
        recebeBpcCalculado: Boolean(bpcItem),
        tipoBpcCalculado: bpcItem?.tipo || ""
      };
    })
    .filter((item) => {
      if (pbf === "COM_BOLSA" && !item.recebePbfCalculado) return false;
      if (pbf === "SEM_BOLSA" && item.recebePbfCalculado) return false;
      if (bpc === "COM_BPC" && !item.recebeBpcCalculado) return false;
      if (bpc === "SEM_BPC" && item.recebeBpcCalculado) return false;
      if (bpcTipo === "IDOSO" && item.tipoBpcCalculado !== "IDOSO") return false;
      if (bpcTipo === "DEFICIENTE" && item.tipoBpcCalculado !== "DEFICIENTE") return false;
      return true;
    });
}

function itemToFlatRow(item, columnMap) {
  const row = {};
  for (const col of allowedColumns) {
    const v = columnMap[col].value(item);
    row[col] = v === null || v === undefined ? "" : String(v);
  }
  return row;
}

router.post("/preview", requireAuth, requireRole("MASTER", "ADMIN"), async (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido para pre-visualizacao",
      code: "REPORT_PREVIEW_INVALID_PAYLOAD"
    });
  }

  const { page, limit, ...filters } = parsed.data;
  const itens = await loadRelatorioItens(filters);
  const total = itens.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const slice = itens.slice(start, start + limit);
  const columnMap = buildColumnMap();
  const itensRows = slice.map((item) => itemToFlatRow(item, columnMap));

  return res.json({
    itens: itensRows,
    total,
    page: safePage,
    limit,
    totalPages
  });
});

router.post("/export-xlsx", requireAuth, requireRole("MASTER", "ADMIN"), async (req, res) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido para exportacao",
      code: "REPORT_INVALID_PAYLOAD"
    });
  }

  const { columns, ...filters } = parsed.data;
  const itens = await loadRelatorioItens(filters);

  if (itens.length > 50000) {
    return res.status(400).json({
      error: true,
      message: "Refine os filtros. Limite maximo de exportacao: 50.000 linhas",
      code: "REPORT_TOO_LARGE"
    });
  }

  const columnMap = buildColumnMap();

  const rows = itens.map((item) => {
    const row = {};
    for (const col of columns) {
      row[columnMap[col].label] = columnMap[col].value(item);
    }
    return row;
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Relatorio");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = `relatorio-${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.send(buffer);
});

export default router;
