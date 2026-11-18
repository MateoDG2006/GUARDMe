/**
 * Carga better-auth (ESM) en el proceso de Node antes de que Jest lo intercepte.
 * Uso: node --import ./test/helpers/preload-better-auth.mjs ...
 */
const [{ betterAuth }, { prismaAdapter }, { anonymous, bearer }, { toNodeHandler }] =
  await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/prisma'),
    import('better-auth/plugins'),
    import('better-auth/node'),
  ]);

globalThis.__guardmeBetterAuth = {
  betterAuth,
  prismaAdapter,
  anonymous,
  bearer,
  toNodeHandler,
};
