// Cliente do Prisma (MySQL/MariaDB) para as rotas de API. Só use no servidor.
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma/client';
import { readDbEnv } from '@/lib/db-env';

// Em desenvolvimento o Next recarrega os módulos; guardar o cliente no global evita abrir uma conexão nova a cada recarga.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const db = readDbEnv();
  const adapter = new PrismaMariaDb({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    connectionLimit: 5,
    // Servidor fora do ar ou de outra rede: falha em poucos segundos em vez de deixar a tela esperando
    connectTimeout: 5000,
    acquireTimeout: 6000
  });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}
