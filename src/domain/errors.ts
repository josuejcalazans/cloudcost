export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAmountError extends DomainError {}

export class MoneyCurrencyMismatchError extends DomainError {}

export class InvalidDateRangeError extends DomainError {}

export class InvalidCostRecordError extends DomainError {}

export class UnsupportedGroupKeyError extends DomainError {}

export class MixedCurrencyError extends DomainError {}
