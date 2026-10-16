// Configuração do Prisma CLI (migrações, generate). O app em si conecta pelo lib/prisma.ts, com as mesmas variáveis DB_*.
// O Next carrega o .env.local sozinho; o CLI do Prisma não, então carregamos aqui.
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { dbUrl, readDbEnv } from './lib/db-env';

config({ path: '.env.local' });
config();

// "prisma generate" não precisa de banco; só lemos as variáveis quando há conexão a fazer
const hasDbVars = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_DATABASE);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: hasDbVars ? dbUrl(readDbEnv()) : undefined
  }
});
