import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../utils/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { normalizeCpf } from "../utils/cpf.js";

const router = Router();
const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 512 }
});
const uploadChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 10 }
});
const uploadSessions = new Map();
const mesesAtualizacao = Math.max(1, Number(process.env.CADU_ATUALIZACAO_MESES || 24));

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

async function processCaduFile({ filePath, fileName, userId }) {
  const importLog = await prisma.caduRawImport.create({
    data: {
      nomeArquivo: fileName,
      status: "PROCESSANDO",
      criadoPorId: userId
    }
  });

  await prisma.preSelecionado.updateMany({
    data: {
      statusCruzamento: "PENDENTE",
      statusVigilancia: "PENDENTE_ANALISE",
      motivoStatus: "Base CADU atualizada, recross necessario",
      cruzadoEm: null
    }
  });
  await prisma.dadosCruzados.deleteMany();
  await prisma.caduRawLinha.deleteMany();
  await prisma.caduPessoa.deleteMany();
  await prisma.caduFamilia.deleteMany();

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    delimiter: ";",
    bom: true,
    relax_column_count: true,
    trim: true
  });

  stream.pipe(parser);

  let linhaNumero = 0;
  let ignoradosCpfInvalido = 0;
  const rawBatch = [];
  const pessoasBatch = [];
  const familiaMap = new Map();
  const BATCH_SIZE = 1000;

  async function flushBatches() {
    if (rawBatch.length > 0) {
      await prisma.caduRawLinha.createMany({ data: rawBatch });
      rawBatch.length = 0;
    }
    if (pessoasBatch.length > 0) {
      await prisma.caduPessoa.createMany({ data: pessoasBatch, skipDuplicates: true });
      pessoasBatch.length = 0;
    }
  }

  for await (const row of parser) {
    linhaNumero += 1;
    const cpf = normalizeCpf(row["p.num_cpf_pessoa"]);
    if (!cpf) ignoradosCpfInvalido += 1;

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

    const codFamiliarFam = row["d.cod_familiar_fam"] || row["p.cod_familiar_fam"] || null;
    const rawTxt = JSON.stringify(row);
    rawBatch.push({
      importId: importLog.id,
      linhaNumero,
      codFamiliarFam,
      cpfPessoa: cpf,
      dadosTxt: rawTxt
    });

    if (cpf) {
      pessoasBatch.push({
        cpf,
        nomePessoa: row["p.nom_pessoa"] || null,
        nisPessoa: row["p.num_nis_pessoa_atual"] || null,
        codFamiliarFam,
        dataAtualFam: parseDate(row["d.dat_atual_fam"]),
        recebePbfFam: parseBooleanFlag(row["d.marc_pbf"]),
        recebePbfPessoa: parseBooleanFlag(row["p.marc_pbf"]),
        rendaPerCapitaFam: parseNumber(row["d.vlr_renda_media_fam"]),
        composicaoFamiliar: parseNumber(row["d.qtd_pessoas_domic_fam"]),
        moradiaJson,
        origemRefCad: row["d.ref_cad"] || row["p.ref_cad"] || null
      });
    }

    if (codFamiliarFam) {
      familiaMap.set(codFamiliarFam, {
        codFamiliarFam,
        dataAtualFam: parseDate(row["d.dat_atual_fam"]),
        rendaPerCapitaFam: parseNumber(row["d.vlr_renda_media_fam"]),
        composicaoFamiliar: parseNumber(row["d.qtd_pessoas_domic_fam"]),
        recebePbfFam: parseBooleanFlag(row["d.marc_pbf"]),
        municipio: row["d.nom_localidade_fam"] || null,
        endereco: row["d.nom_logradouro_fam"] || null,
        rawDadosTxt: rawTxt
      });
    }

    if (rawBatch.length >= BATCH_SIZE || pessoasBatch.length >= BATCH_SIZE) {
      await flushBatches();
    }
  }

  await flushBatches();

  const familias = Array.from(familiaMap.values());
  for (let i = 0; i < familias.length; i += BATCH_SIZE) {
    await prisma.caduFamilia.createMany({
      data: familias.slice(i, i + BATCH_SIZE),
      skipDuplicates: true
    });
  }

  await prisma.caduRawImport.update({
    where: { id: importLog.id },
    data: {
      status: "CONCLUIDO",
      totalLinhas: linhaNumero,
      finalizadoEm: new Date()
    }
  });

  await prisma.logAuditoria.create({
    data: {
      usuarioId: userId,
      acao: "UPLOAD_CADU",
      detalhes: {
        totalLinhas: linhaNumero,
        importadosPessoas: await prisma.caduPessoa.count(),
        importadosFamilias: await prisma.caduFamilia.count(),
        ignoradosCpfInvalido
      }
    }
  });

  return {
    importId: importLog.id,
    total: linhaNumero,
    inseridos: await prisma.caduPessoa.count(),
    familias: await prisma.caduFamilia.count(),
    atualizados: 0,
    erros: 0,
    ignoradosCpfInvalido
  };
}

router.post("/upload", requireAuth, requireRole("MASTER"), uploadSingle.single("arquivo"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: true, message: "Arquivo CSV obrigatorio", code: "CADU_FILE_REQUIRED" });
  }

  const tempPath = path.join(os.tmpdir(), `cadu-upload-${Date.now()}-${crypto.randomUUID()}.csv`);
  await fsp.writeFile(tempPath, req.file.buffer);
  const result = await processCaduFile({ filePath: tempPath, fileName: req.file.originalname, userId: req.user.sub });
  await fsp.unlink(tempPath).catch(() => {});
  return res.json(result);
});

router.post("/upload/init", requireAuth, requireRole("MASTER"), async (_req, res) => {
  const uploadId = crypto.randomUUID();
  const tempPath = path.join(os.tmpdir(), `cadu-chunk-${uploadId}.csv`);
  uploadSessions.set(uploadId, { tempPath, expectedIndex: 0, totalChunks: 0, fileName: "upload.csv" });
  await fsp.writeFile(tempPath, "");
  return res.json({ uploadId });
});

router.post("/upload/chunk", requireAuth, requireRole("MASTER"), uploadChunk.single("chunk"), async (req, res) => {
  const { uploadId, index, totalChunks, fileName } = req.body;
  const session = uploadSessions.get(uploadId);
  if (!session) {
    return res.status(400).json({ error: true, message: "Sessao de upload invalida", code: "CADU_UPLOAD_INVALID" });
  }
  if (!req.file?.buffer) {
    return res.status(400).json({ error: true, message: "Chunk ausente", code: "CADU_CHUNK_REQUIRED" });
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx !== session.expectedIndex) {
    return res.status(409).json({
      error: true,
      message: `Ordem de chunk invalida. Esperado ${session.expectedIndex}, recebido ${index}`,
      code: "CADU_CHUNK_ORDER_INVALID"
    });
  }

  session.totalChunks = Number(totalChunks) || session.totalChunks;
  session.fileName = fileName || session.fileName;
  await fsp.appendFile(session.tempPath, req.file.buffer);
  session.expectedIndex += 1;
  uploadSessions.set(uploadId, session);

  return res.json({ ok: true, received: idx + 1, totalChunks: session.totalChunks });
});

router.post("/upload/finalize", requireAuth, requireRole("MASTER"), async (req, res) => {
  const { uploadId } = req.body || {};
  const session = uploadSessions.get(uploadId);
  if (!session) {
    return res.status(400).json({ error: true, message: "Sessao de upload invalida", code: "CADU_UPLOAD_INVALID" });
  }
  if (session.totalChunks > 0 && session.expectedIndex !== session.totalChunks) {
    return res.status(409).json({
      error: true,
      message: `Upload incompleto (${session.expectedIndex}/${session.totalChunks})`,
      code: "CADU_UPLOAD_INCOMPLETE"
    });
  }

  const result = await processCaduFile({
    filePath: session.tempPath,
    fileName: session.fileName || "upload.csv",
    userId: req.user.sub
  });

  await fsp.unlink(session.tempPath).catch(() => {});
  uploadSessions.delete(uploadId);
  return res.json(result);
});

router.get("/status", requireAuth, requireRole("MASTER", "ADMIN", "VIGILANCIA"), async (_req, res) => {
  const limiteAtualizacao = new Date();
  limiteAtualizacao.setMonth(limiteAtualizacao.getMonth() - mesesAtualizacao);

  const [totalPessoas, totalFamilias, ultimoImport, dataBaseMax, familiasComBolsa, familiasAtualizadas, familiasDesatualizadas] = await Promise.all([
    prisma.caduPessoa.count(),
    prisma.caduFamilia.count(),
    prisma.caduRawImport.findFirst({
      orderBy: { criadoEm: "desc" },
      select: { criadoEm: true, finalizadoEm: true, totalLinhas: true, status: true, id: true, nomeArquivo: true }
    }),
    prisma.caduFamilia.aggregate({
      _max: { dataAtualFam: true }
    }),
    prisma.caduFamilia.count({ where: { recebePbfFam: true } }),
    prisma.caduFamilia.count({
      where: {
        dataAtualFam: { gte: limiteAtualizacao }
      }
    }),
    prisma.caduFamilia.count({
      where: {
        OR: [{ dataAtualFam: { lt: limiteAtualizacao } }, { dataAtualFam: null }]
      }
    })
  ]);

  return res.json({
    totalPessoas,
    totalFamilias,
    familiasComBolsa,
    familiasAtualizadas,
    familiasDesatualizadas,
    percentualAtualizacaoCadastral:
      totalFamilias > 0 ? `${Math.round((familiasAtualizadas * 100) / totalFamilias)}%` : "0%",
    dataBaseReferencia: dataBaseMax._max.dataAtualFam || null,
    ultimoUpload: ultimoImport || null
  });
});

export default router;
