export function normalizeCpf(input) {
  if (input === null || input === undefined) {
    return null;
  }

  const onlyDigits = String(input).replace(/\D/g, "");
  const padded = onlyDigits.padStart(11, "0");

  if (padded.length !== 11) {
    return null;
  }

  return padded;
}
