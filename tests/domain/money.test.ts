import { describe, expect, it } from 'vitest';
import {
  InvalidAmountError,
  MoneyCurrencyMismatchError,
} from '../../src/domain/errors.ts';
import { Money } from '../../src/domain/value-objects/money.ts';

describe('Money', () => {
  it('round-trips major units without float drift', () => {
    expect(Money.fromAmount(10.5).amount).toBe(10.5);
    expect(Money.fromAmount(0.1).amount).toBe(0.1);
  });

  it('adds amounts using integer minor units (0.1 + 0.2 = 0.3)', () => {
    const sum = Money.fromAmount(0.1).add(Money.fromAmount(0.2));
    expect(sum.amount).toBe(0.3);
  });

  it('supports negative amounts (credits/refunds)', () => {
    expect(Money.fromAmount(-5).amount).toBe(-5);
  });

  it('rejects amounts that are not finite numbers', () => {
    expect(() => Money.fromAmount(Number.NaN)).toThrow(InvalidAmountError);
    expect(() => Money.fromAmount(Number.POSITIVE_INFINITY)).toThrow(
      InvalidAmountError,
    );
  });

  it('rejects mixing currencies', () => {
    expect(() =>
      Money.fromAmount(1, 'USD').add(Money.fromAmount(1, 'EUR')),
    ).toThrow(MoneyCurrencyMismatchError);
  });

  it('knows when it is zero', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.fromAmount(0.01).isZero()).toBe(false);
  });

  it('formats as currency string', () => {
    expect(Money.fromAmount(10.5).toString()).toBe('USD 10.50');
    expect(Money.fromAmount(0).toString()).toBe('USD 0.00');
  });

  it('equality compares minor units and currency', () => {
    expect(Money.fromAmount(1).equals(Money.fromAmount(1))).toBe(true);
    expect(Money.fromAmount(1).equals(Money.fromAmount(2))).toBe(false);
    expect(Money.fromAmount(1, 'USD').equals(Money.fromAmount(1, 'EUR'))).toBe(
      false,
    );
  });
});
