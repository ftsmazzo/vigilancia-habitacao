import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { normalizeCpf } from "../utils/cpf.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function parseBooleanFlag(value) {
  if (value === "1" || value === 1 || String(value).toUpperCase() === "SIM") return true;
  if (value === "0" || value === 0 || String(value).toUpperCase() === "NAO") return false;
  return null;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".");
  const number = Number(normalized);
  return Number.isNaN(number) ? null : number;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

router.post("/upload", requireAuth, requireRole("MASTER"), upload.single("arquivo"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({
      error: true,
      message: "Arquivo CSV obrigatorio",
      code: "CADU_FILE_REQUIRED"
    });
  }

  let records;
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ";",
      bom: true,
      relax_column_count: true,
      trim: true
    });
  } catch (_error) {
    return res.status(400).json({
      error: true,
      message: "CSV invalido",
      code: "CADU_CSV_INVALID"
    });
  }

  const toInsert = [];
  let ignoradosCpfInvalido = 0;

  for (const row of records) {
    const cpf = normalizeCpf(row["p.num_cpf_pessoa"]);
    if (!cpf) {
      ignoradosCpfInvalido += 1;
      continue;
    }

    const moradiaJson = {
      codEspecieDomicFam: row["d.cod_especie_domic_fam"] || null,
      qtdComodosDomicFam: row["d.qtd_comodos_domic_fam"] || null,
      qtdComodosDormitorioFam: row["d.qtd_comodos_dormitorio_fam"] || null,
      codMaterialPisoFam: row["d.cod_material_piso_fam"] || null,
      codMaterialDomicFam: row["d.cod_material_domic_fam"] || null,
      codAguaCanalizadaFam: row["d.cod_agua_canalizada_fam"] || null,
      codAbasteAguaDomicFam: row["d.cod_abaste_agua_domic_fam"] || null,
      codBanheiroDomicFam: row["d.cod_banheiro_domic_fam"] || null
    };

    toInsert.push({
      cpf,
      nomePessoa: row["p.nom_pessoa"] || null,
      nisPessoa: row["p.num_nis_pessoa_atual"] || null,
      codFamiliarFam: row["p.cod_familiar_fam"] || null,
      dataAtualFam: parseDate(row["d.dat_atual_fam"]),
      recebePbfFam: parseBooleanFlag(row["d.marc_pbf"]),
      recebePbfPessoa: parseBooleanFlag(row["p.marc_pbf"]),
      rendaPerCapitaFam: parseNumber(row["d.vlr_renda_media_fam"]),
      composicaoFamiliar: parseNumber(row["d.qtd_pessoas_domic_fam"]),
      moradiaJson,
      origemRefCad: row["d.ref_cad"] || row["p.ref_cad"] || null
    });
  }

  await prisma.preSelecionado.updateMany({
    data: {
      statusCruzamento: "PENDENTE",
      statusVigilancia: "PENDENTE_ANALISE",
      motivoStatus: "Base CADU atualizada, recross necessario",
      cruzadoEm: null
    }
  });

  await prisma.dadosCruzados.deleteMany();
  await prisma.caduPessoa.deleteMany();

  const chunks = chunkArray(toInsert, 2000);
  for (const chunk of chunks) {
    await prisma.caduPessoa.createMany({
      data: chunk,
      skipDuplicates: true
    });
  }

  await prisma.logAuditoria.create({
    data: {
      usuarioId: req.user.sub,
      acao: "UPLOAD_CADU",
      detalhes: {
        totalLinhas: records.length,
        importados: toInsert.length,
        ignoradosCpfInvalido
      }
    }
  });

  return res.json({
    total: records.length,
    inseridos: toInsert.length,
    atualizados: 0,
    erros: 0,
    ignoradosCpfInvalido
  });
});

router.get("/status", requireAuth, requireRole("MASTER", "ADMIN"), async (_req, res) => {
  const total = await prisma.caduPessoa.count();
  const ultimo = await prisma.caduPessoa.findFirst({
    orderBy: { importadoEm: "desc" },
    select: { importadoEm: true }
  });

  return res.json({
    totalRegistros: total,
    ultimoUploadEm: ultimo?.importadoEm || null
  });
});

export default router;
