import { InvalidAmountError, MoneyCurrencyMismatchError } from '../errors.ts';

/**
 * Immutable money value object backed by integer minor units (cents), so
 * `0.1 + 0.2` is exactly `0.3` — never `0.30000000000000004`.
 *
 * Complexity: O(1) for every operation.
 */
export class Money {
  readonly minor: number;
  readonly currency: string;

  private constructor(minor: number, currency: string) {
    this.minor = minor;
    this.currency = currency;
  }

  static fromAmount(amount: number, currency = 'USD'): Money {
    if (!Number.isFinite(amount)) {
      throw new InvalidAmountError(
        `amount must be a finite number, received ${String(amount)}`,
      );
    }
    return new Money(Math.round(amount * 100), currency);
  }

  static zero(currency = 'USD'): Money {
    return new Money(0, currency);
  }

  get amount(): number {
    return this.minor / 100;
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new MoneyCurrencyMismatchError(
        `cannot add ${other.currency} to ${this.currency}`,
      );
    }
    return new Money(this.minor + other.minor, this.currency);
  }

  equals(other: Money): boolean {
    return this.minor === other.minor && this.currency === other.currency;
  }

  isZero(): boolean {
    return this.minor === 0;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }
}
