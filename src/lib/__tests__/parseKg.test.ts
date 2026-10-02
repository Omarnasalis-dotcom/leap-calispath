import { parseKg } from '../parseKg';

describe('parseKg', () => {
  it('reads plain and decimal-point values', () => {
    expect(parseKg('40')).toBe(40);
    expect(parseKg('12.5')).toBe(12.5);
  });

  it('reads a decimal comma', () => {
    expect(parseKg('12,5')).toBe(12.5);
  });

  it('reads Arabic-Indic and Persian digits with the Arabic decimal separator', () => {
    expect(parseKg('١٢٫٥')).toBe(12.5);
    expect(parseKg('۴۰')).toBe(40);
  });

  it('returns undefined for empty or invalid input', () => {
    expect(parseKg('')).toBeUndefined();
    expect(parseKg('kg')).toBeUndefined();
  });
});
