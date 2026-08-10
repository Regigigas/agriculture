import Decimal from 'decimal.js';
import { HttpException, HttpStatus } from '@nestjs/common';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function multiplyCents(quantity: number, unitPriceCents: number): number {
  const result = new Decimal(quantity).times(unitPriceCents).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return assertIntegerCents(result, 'amount');
}

export function assertIntegerCents(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) throw new HttpException(`${field} 必须是安全范围内的整数分`, HttpStatus.BAD_REQUEST);
  return value;
}
