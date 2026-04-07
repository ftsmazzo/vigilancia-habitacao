const STORAGE_KEY = "vigilancia_assistente_contexto_rma";

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
