import iconv from "iconv-lite";

export function stripQuotes(value) {
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

export function normalizeRowKeys(row) {
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

export function parseMesReferencia(value) {
  const s = stripQuotes(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function parseIntMetric(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function mesReferenciaFromAnoMes(ano, mes) {
  const y = Number(ano);
  const m = Number(mes);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return null;
  }
  return new Date(Date.UTC(y, m - 1, 1));
}

export function anoUtcRange(ano) {
  const y = Number(ano);
  if (!Number.isFinite(y)) return null;
  return {
    inicio: new Date(Date.UTC(y, 0, 1)),
    fim: new Date(Date.UTC(y + 1, 0, 1))
  };
}

export function parseMesQuery(mes) {
  if (mes === undefined || mes === null || mes === "") return null;
  const s = String(mes).trim().toUpperCase();
  if (s === "TODOS") return "TODOS";
  const m = Number(mes);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}

export function toNum(v) {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

export function decodeCsvBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString("utf8");
  }
  const utf8 = buf.toString("utf8");
  const win = iconv.decode(buf, "win1252");
  const iso = iconv.decode(buf, "iso8859-1");
  const rank = (s) => {
    const pt = (s.match(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/g) || []).length;
    const bad = (s.match(/\uFFFD/g) || []).length;
    const mojibake = (s.match(/Ã.|Âª|Âº/g) || []).length;
    return pt * 20 - bad * 80 - mojibake * 15;
  };
  const candidates = [
    { text: utf8, r: rank(utf8) },
    { text: win, r: rank(win) },
    { text: iso, r: rank(iso) }
  ];
  candidates.sort((a, b) => b.r - a.r);
  return candidates[0].text;
}
