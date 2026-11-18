import { Prisma } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';

export function isUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return true;
  }
  // $executeRaw / $queryRaw: Prisma envuelve 23505 como P2010.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2010'
  ) {
    const message = error.message ?? '';
    return message.includes('23505') || /unique constraint/i.test(message);
  }
  return false;
}

export function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

export function recordNotFoundError(): DomainError {
  return new DomainError('NOT_FOUND');
}
