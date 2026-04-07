/**
 * Resolve o nome do modelo para a API Chat Completions da OpenAI.
 * @see https://platform.openai.com/docs/models
 *
 * Erro comum: definir OPENAI_MODEL=4.1 — a API espera o ID completo, ex. gpt-4.1
 */
export function resolveOpenAiModel() {
  const raw = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  if (!raw) return "gpt-4o-mini";

  const lower = raw.toLowerCase();

  if (/^(gpt-|chatgpt-)/i.test(raw)) return raw;
  if (/^o1/i.test(raw) && !raw.startsWith("gpt")) return raw;
  if (/^o3/i.test(raw) && !raw.startsWith("gpt")) return raw;

  if (/^\d+\.\d/.test(raw)) {
    return `gpt-${raw}`;
  }

  if (/^4o/i.test(lower)) {
    return raw.startsWith("gpt") ? raw : `gpt-${raw}`;
  }

  if (/^4-turbo|^turbo/i.test(lower)) {
    return raw.startsWith("gpt") ? raw : `gpt-${raw}`;
  }

  if (/^3\.5|^35/i.test(raw)) {
    return raw.startsWith("gpt") ? raw : `gpt-${raw}`;
  }

  return raw;
}
