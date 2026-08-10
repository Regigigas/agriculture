import { describe, expect, it } from 'vitest';
import { assertIntegerCents, multiplyCents } from '../src/money';

describe('money cents', () => {
  it('按整数分精确计算小数数量', () => expect(multiplyCents(0.3, 10)).toBe(3));
  it('按分执行四舍五入', () => expect(multiplyCents(1.005, 100)).toBe(101));
  it('拒绝非整数分', () => expect(() => assertIntegerCents(1.2, 'amount')).toThrow('整数分'));
  it('支持安全整数范围内的大金额', () => expect(multiplyCents(1_000_000, 999_999_999)).toBe(999_999_999_000_000));
});
