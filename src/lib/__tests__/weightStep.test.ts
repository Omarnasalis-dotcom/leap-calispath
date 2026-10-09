import { formatKg, stepWeight } from '../weightStep';

describe('stepWeight (kg − / +)', () => {
  it('+ on an empty box starts from the previous set, else 2.5', () => {
    expect(stepWeight('', 1, 20)).toBe('20');
    expect(stepWeight('', 1)).toBe('2.5');
    expect(stepWeight('', 1, 0)).toBe('2.5');
  });
  it('steps by 2.5 kg and handles typed decimals and Arabic digits', () => {
    expect(stepWeight('20', 1)).toBe('22.5');
    expect(stepWeight('22.5', -1)).toBe('20');
    expect(stepWeight('12,5', 1)).toBe('15');
    expect(stepWeight('١٥', 1)).toBe('17.5');
  });
  it('− to zero (or on empty) clears the box', () => {
    expect(stepWeight('2.5', -1)).toBe('');
    expect(stepWeight('1', -1)).toBe('');
    expect(stepWeight('', -1, 20)).toBe('');
  });
  it('formats without trailing zeros', () => {
    expect(formatKg(17.5)).toBe('17.5');
    expect(formatKg(20)).toBe('20');
    expect(formatKg(0)).toBe('');
  });
});
