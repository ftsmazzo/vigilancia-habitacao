const STORAGE_KEY = "vigilancia_assistente_contexto_rma";
const STORAGE_KEY_N8N = "vigilancia_assistente_contexto_rma_n8n";

/**
 * Grava o recorte RMA (filtros + overview) para o Assistente ler ao abrir /assistente.
 */
export function setAssistenteContextoRma(payload) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("assistenteContextStorage:", e);
  }
}

/**
 * Grava o recorte RMA para o chat CaduIA (n8n) em /assistente/n8n.
 */
export function setAssistenteContextoRmaN8n(payload) {
  try {
    sessionStorage.setItem(STORAGE_KEY_N8N, JSON.stringify(payload));
  } catch (e) {
    console.warn("assistenteContextStorage n8n:", e);
  }
}

/**
 * Le e remove do sessionStorage (uma leitura por navegacao).
 */
export function readAndClearAssistenteContextoRma() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * Le e remove o recorte RMA destinado ao fluxo n8n (uma leitura por navegacao).
 */
export function readAndClearAssistenteContextoRmaN8n() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_N8N);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY_N8N);
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(STORAGE_KEY_N8N);
    return null;
  }
}
