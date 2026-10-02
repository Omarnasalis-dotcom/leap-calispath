// Reads a typed kg value: Arabic-Indic / Persian digits and a decimal
// comma ("١٢٫٥", "12,5") are normalised first, so Arabic keyboards don't
// turn 12.5 into 12 or into nothing. Returns undefined when empty/invalid.
export function parseKg(text: string): number | undefined {
  const normalised = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[,٫]/g, '.')
    .trim();
  const n = parseFloat(normalised);
  return Number.isFinite(n) ? n : undefined;
}
