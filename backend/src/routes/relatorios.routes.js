import { Router } from "express";
import { z } from "zod";
import XLSX from "xlsx";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

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
  "recebePbf",
  "recebeBpc",
  "tipoBpc"
];

const exportSchema = z.object({
  empreendimentoId: z.string().uuid().optional(),
  statusVigilancia: z.enum(["TODOS", "NAO_ENCONTRADO", "DESATUALIZADO", "ATUALIZADO"]).optional(),
  pbf: z.enum(["TODOS", "COM_BOLSA", "SEM_BOLSA"]).optional(),
  bpc: z.enum(["TODOS", "COM_BPC", "SEM_BPC"]).optional(),
  bpcTipo: z.enum(["TODOS", "IDOSO", "DEFICIENTE"]).optional(),
  q: z.string().optional(),
  columns: z.array(z.enum(allowedColumns)).min(1)
});

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

router.post("/export-xlsx", requireAuth, requireRole("MASTER", "ADMIN"), async (req, res) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: true,
      message: "Payload invalido para exportacao",
      code: "REPORT_INVALID_PAYLOAD"
    });
  }

  const { empreendimentoId, statusVigilancia = "TODOS", pbf = "TODOS", bpc = "TODOS", bpcTipo = "TODOS", q = "", columns } = parsed.data;
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
            recebePbfPessoa: true
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

  let itens = itensBase
    .map((item) => {
      const cadu = caduByCpf.get(item.cpf);
      const bpcItem = bpcByCpf.get(item.cpf);
      return {
        ...item,
        empreendimentoNome: item.empreendimento?.nome || "",
        caduNome: cadu?.nomePessoa || "",
        caduNis: cadu?.nisPessoa || "",
        caduDataAtualFam: cadu?.dataAtualFam || null,
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

  if (itens.length > 50000) {
    return res.status(400).json({
      error: true,
      message: "Refine os filtros. Limite maximo de exportacao: 50.000 linhas",
      code: "REPORT_TOO_LARGE"
    });
  }

  const columnMap = {
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
    recebePbf: { label: "Recebe Bolsa Familia", value: (item) => (item.recebePbfCalculado ? "SIM" : "NAO") },
    recebeBpc: { label: "Recebe BPC", value: (item) => (item.recebeBpcCalculado ? "SIM" : "NAO") },
    tipoBpc: { label: "Tipo BPC", value: (item) => item.tipoBpcCalculado || "" }
  };

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
