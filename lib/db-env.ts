// Configuração do banco lida das variáveis de ambiente (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE).
// Usada pelo app (lib/prisma.ts) e pelo Prisma CLI (prisma.config.ts), para os dois olharem o mesmo banco.

export interface DbEnv {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** Lê e confere as variáveis. A senha pode ficar vazia (como o root do XAMPP); o resto é obrigatório. */
export function readDbEnv(env: Record<string, string | undefined> = process.env): DbEnv {
  const missing = ['DB_HOST', 'DB_USERNAME', 'DB_DATABASE'].filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Configuração do banco incompleta: falta ${missing.join(', ')} no .env.local. ` +
        'Defina DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD e DB_DATABASE.'
    );
  }

  const port = Number(env.DB_PORT?.trim() || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`DB_PORT inválida: "${env.DB_PORT}". Use um número, como 3306.`);
  }

  return {
    host: env.DB_HOST!.trim(),
    port,
    user: env.DB_USERNAME!.trim(),
    password: env.DB_PASSWORD ?? '',
    database: env.DB_DATABASE!.trim()
  };
}

/** URL de conexão (com usuário e senha codificados) para o Prisma CLI. */
export function dbUrl(db: DbEnv): string {
  const auth = db.password ? `${encodeURIComponent(db.user)}:${encodeURIComponent(db.password)}` : encodeURIComponent(db.user);
  return `mysql://${auth}@${db.host}:${db.port}/${encodeURIComponent(db.database)}`;
}
