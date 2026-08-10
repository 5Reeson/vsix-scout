import { JSON_SCHEMA_VERSION } from '@vsix-scout/shared';

export const ERROR_CODES = [
  'INVALID_INPUT',
  'EXTENSION_NOT_FOUND',
  'NO_COMPATIBLE_VERSION',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_INVALID_RESPONSE',
  'UNSAFE_RESOURCE_URL',
  'DOWNLOAD_FAILED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ScoutErrorJson {
  readonly schemaVersion: typeof JSON_SCHEMA_VERSION;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

interface ScoutErrorOptions {
  readonly retryable?: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class ScoutError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: ScoutErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ScoutError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  toJSON(): ScoutErrorJson {
    return {
      schemaVersion: JSON_SCHEMA_VERSION,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
