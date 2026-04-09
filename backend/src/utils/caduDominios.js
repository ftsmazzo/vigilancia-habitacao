import { normalizeCpf } from "./cpf.js";

/**
 * Rotulos para d.cod_forma_coleta_fam (familia).
 * Ref. usual CECAD/MDS — conferir dicionario oficial se houver divergencia na sua base.
 */
export const FORMA_COLETA_FAM = {
  "0": "Informacao migrada / nao classificada",
  "1": "Sem visita domiciliar (coleta em posto ou local fixo)",
  "2": "Com visita domiciliar"
};

/**
 * Rotulos para p.cod_parentesco_rf_pessoa (parentesco com o responsavel familiar).
 * Subconjunto comum; codigos desconhecidos aparecem como "Codigo X".
 */
export const PARENTESCO_RF = {
  "1": "Responsavel familiar",
  "2": "Conjuge ou companheiro(a)",
  "3": "Filho(a)",
  "4": "Enteado(a)",
  "5": "Neto(a) ou bisneto(a)",
  "6": "Pai ou mae",
  "7": "Sogro(a)",
  "8": "Irmao(a)",
  "9": "Genro ou nora",
  "10": "Outro parente",
  "11": "Nao parente"
};

export function labelFormaColetaFam(codigo) {
  if (codigo == null || codigo === "") return "";
  const k = String(codigo).trim();
  const semZero = k.replace(/^0+/, "") || k;
  return FORMA_COLETA_FAM[k] || FORMA_COLETA_FAM[semZero] || `Codigo ${k} (ver dicionario CECAD)`;
}

export function labelParentescoRf(codigo) {
  if (codigo == null || codigo === "") return "";
  const k = String(codigo).trim();
  const semZero = k.replace(/^0+/, "") || k;
  return (
    PARENTESCO_RF[k] ||
    PARENTESCO_RF[semZero] ||
    `Codigo ${k} (parentesco com RF)`
  );
}

function parseDadosTxtRow(dadosTxt) {
  if (!dadosTxt || typeof dadosTxt !== "string") return null;
  try {
    return JSON.parse(dadosTxt);
  } catch {
    return null;
  }
}

/** Extrai d.cod_forma_coleta_fam do JSON de uma linha de familia (qualquer membro costuma repetir o d.*). */
export function extrairCodFormaColetaFamilia(rawDadosTxt) {
  const row = parseDadosTxtRow(rawDadosTxt);
  if (!row) return { codigo: "", label: "" };
  const cod = row["d.cod_forma_coleta_fam"];
  const c = cod != null && cod !== "" ? String(cod).trim() : "";
  return { codigo: c, label: c ? labelFormaColetaFam(c) : "" };
}

/**
 * CPF do parceiro no nucleo RF + conjuge (cod 1 <-> 2).
 * @param {string} cpfPrincipal - CPF do pre-selecionado (normalizado)
 * @param {Array<{ dadosTxt: string, cpfPessoa: string | null }>} linhasFamilia
 */
export function extrairCpfParceiroRfConjuge(cpfPrincipal, linhasFamilia) {
  if (!cpfPrincipal || !Array.isArray(linhasFamilia) || !linhasFamilia.length) {
    return "";
  }
  const rows = [];
  for (const l of linhasFamilia) {
    const o = parseDadosTxtRow(l.dadosTxt);
    if (!o) continue;
    const cpf = normalizeCpf(o["p.num_cpf_pessoa"] || l.cpfPessoa);
    if (!cpf) continue;
    rows.push({
      cpf,
      parentesco: String(o["p.cod_parentesco_rf_pessoa"] ?? "").trim()
    });
  }
  const me = rows.find((r) => r.cpf === cpfPrincipal);
  if (!me) return "";

  const pc = parseInt(me.parentesco, 10);
  if (pc === 1) {
    const p2 = rows.find((r) => parseInt(r.parentesco, 10) === 2);
    return p2 ? formatCpfDisplay(p2.cpf) : "";
  }
  if (pc === 2) {
    const p1 = rows.find((r) => parseInt(r.parentesco, 10) === 1);
    return p1 ? formatCpfDisplay(p1.cpf) : "";
  }
  return "";
}

export function extrairParentescoPessoa(cpfPrincipal, linhasFamilia) {
  if (!cpfPrincipal || !Array.isArray(linhasFamilia)) {
    return { codigo: "", label: "" };
  }
  for (const l of linhasFamilia) {
    const o = parseDadosTxtRow(l.dadosTxt);
    if (!o) continue;
    const cpf = normalizeCpf(o["p.num_cpf_pessoa"] || l.cpfPessoa);
    if (cpf !== cpfPrincipal) continue;
    const cod = String(o["p.cod_parentesco_rf_pessoa"] ?? "").trim();
    return { codigo: cod, label: cod ? labelParentescoRf(cod) : "" };
  }
  return { codigo: "", label: "" };
}

function formatCpfDisplay(cpf) {
  const d = String(cpf).replace(/\D/g, "").padStart(11, "0");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
