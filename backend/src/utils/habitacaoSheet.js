import xlsx from "xlsx";
import { normalizeCpf } from "./cpf.js";

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function excelDateToIso(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return null;
    const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return date.toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function firstValue(row, indexes) {
  for (const index of indexes) {
    const value = row[index];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

export function parseHabitacaoWorkbook(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: true,
    defval: ""
  });

  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "cpf titular")
  );

  if (headerRowIndex < 0) {
    throw new Error("Cabecalho da planilha nao encontrado (CPF Titular).");
  }

  const header = rows[headerRowIndex].map(normalizeHeader);
  const colCpf = header
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h === "cpf titular" || x.h === "cpf")
    .map((x) => x.i);
  const colNome = header
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h.includes("nome titular") || x.h === "nome")
    .map((x) => x.i);
  const colNis = header
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h === "nis" || x.h.includes("nis conjuge"))
    .map((x) => x.i);
  const colDataInscricao = header
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h.includes("data atualizacao"))
    .map((x) => x.i);
  const colCelular = header
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h === "celular")
    .map((x) => x.i);
  const colRecado = header
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h === "recado")
    .map((x) => x.i);

  const result = [];
  const errors = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const cpfRaw = firstValue(row, colCpf);
    if (!cpfRaw) continue;

    const cpf = normalizeCpf(cpfRaw);
    if (!cpf) {
      errors.push({ linha: i + 1, motivo: "CPF invalido", valor: String(cpfRaw) });
      continue;
    }

    const nome = firstValue(row, colNome);
    const nis = firstValue(row, colNis);
    const dataAtualizacaoInscricao = excelDateToIso(firstValue(row, colDataInscricao));
    const celular = firstValue(row, colCelular);
    const recado = firstValue(row, colRecado);
    const contato = [celular, recado].filter(Boolean).join(" / ");

    const camposOriginaisPlanilha = {};
    for (let c = 0; c < header.length; c += 1) {
      if (!header[c]) continue;
      const value = row[c];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        camposOriginaisPlanilha[header[c]] = value;
      }
    }

    result.push({
      cpf,
      nomeInformado: nome ? String(nome).trim() : null,
      nisInformado: nis ? String(nis).trim() : null,
      dataAtualizacaoInscricao,
      contato: contato || null,
      camposOriginaisPlanilha
    });
  }

  return { rows: result, errors };
}
