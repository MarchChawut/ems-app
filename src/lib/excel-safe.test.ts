import { describe, it, expect } from 'vitest';
import { neutralizeFormula, csvCell } from './excel-safe';

describe('neutralizeFormula', () => {
  it('prefixes formula triggers with an apostrophe', () => {
    expect(neutralizeFormula('=HYPERLINK("http://evil","x")')).toBe(`'=HYPERLINK("http://evil","x")`);
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutralizeFormula('+cmd|calc!A0')).toBe("'+cmd|calc!A0");
    expect(neutralizeFormula('-2+3+cmd|x')).toBe("'-2+3+cmd|x");
    expect(neutralizeFormula('\t=1+1')).toBe("'\t=1+1");
  });

  it('leaves normal text, numbers, phone-like and "-" placeholders alone', () => {
    expect(neutralizeFormula('ประชุมคณะกรรมการ')).toBe('ประชุมคณะกรรมการ');
    expect(neutralizeFormula('-')).toBe('-');
    expect(neutralizeFormula('+66 81-234-5678')).toBe('+66 81-234-5678');
    expect(neutralizeFormula('-5')).toBe('-5');
    expect(neutralizeFormula(42)).toBe(42);
    expect(neutralizeFormula('')).toBe('');
  });
});

describe('csvCell', () => {
  it('quotes, escapes quotes, and neutralizes formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell(null)).toBe('""');
    expect(csvCell(7)).toBe('"7"');
  });
});
