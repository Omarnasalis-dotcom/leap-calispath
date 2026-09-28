import { arabicPlural, englishPlural } from '../pluralRules';

it.each([
  [0, 'zero'], [1, 'one'], [2, 'two'], [3, 'few'], [10, 'few'], [11, 'many'], [99, 'many'],
  [100, 'other'], [102, 'other'], [103, 'few'], [111, 'many'],
])('Arabic %i -> %s', (n, category) => {
  expect(arabicPlural(n)).toBe(category);
});

it('English: one vs other', () => {
  expect(englishPlural(1)).toBe('one');
  expect(englishPlural(0)).toBe('other');
  expect(englishPlural(5)).toBe('other');
});

it('matches the engine rules where they exist', () => {
  const ar = new Intl.PluralRules('ar');
  for (const n of [0, 1, 2, 3, 7, 10, 11, 25, 99, 100, 101, 102, 103, 111, 1000]) {
    expect(arabicPlural(n)).toBe(ar.select(n));
  }
});
