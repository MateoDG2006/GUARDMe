export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'SESSION_REVOKED',
  'INSTALLATION_MISMATCH',
  'ACCOUNT_NOT_BOOTSTRAPPED',
  'NOT_FOUND',
  'FORBIDDEN_ACTION',
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
  'INCOMPATIBLE_STATE',
  'IDEMPOTENCY_KEY_REUSED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'CAPABILITY_NOT_ENABLED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  SESSION_REVOKED: 401,
  INSTALLATION_MISMATCH: 401,
  ACCOUNT_NOT_BOOTSTRAPPED: 403,
  NOT_FOUND: 404,
  FORBIDDEN_ACTION: 403,
  VALIDATION_FAILED: 400,
  VERSION_CONFLICT: 409,
  INCOMPATIBLE_STATE: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  CAPABILITY_NOT_ENABLED: 501,
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'No autenticado',
  SESSION_REVOKED: 'Sesión revocada',
  INSTALLATION_MISMATCH: 'La instalación no corresponde a la sesión',
  ACCOUNT_NOT_BOOTSTRAPPED: 'La cuenta no está inicializada',
  NOT_FOUND: 'Recurso no encontrado',
  FORBIDDEN_ACTION: 'Operación no permitida',
  VALIDATION_FAILED: 'Validación fallida',
  VERSION_CONFLICT: 'La versión del recurso cambió',
  INCOMPATIBLE_STATE: 'El estado actual no permite esta transición',
  IDEMPOTENCY_KEY_REUSED:
    'La clave de idempotencia se reutilizó con otro cuerpo',
  RATE_LIMITED: 'Demasiadas solicitudes',
  PROVIDER_UNAVAILABLE: 'El proveedor no está disponible',
  CAPABILITY_NOT_ENABLED: 'Capacidad no habilitada',
};

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'DomainError';
  }
}
