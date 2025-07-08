export class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProviderNotConfiguredError extends ApplicationError {
  constructor(provider: string) {
    super(`provider "${provider}" is not configured`);
  }
}

export class UnsupportedFormatError extends ApplicationError {
  constructor(format: string) {
    super(
      `unsupported report format "${format}" (expected one of: json, csv, xlsx, zip)`,
    );
  }
}

export class MissingRecipientsError extends ApplicationError {
  constructor() {
    super(
      'no recipients configured for the report (set MAIL_TO or pass recipients)',
    );
  }
}

export class InvalidQueryError extends ApplicationError {}
