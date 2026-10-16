# Gerador de posts institucionais

Cria posts para redes sociais no padrão visual da marca: a IA aprende a identidade a partir de posts e do manual
em PDF, o calendário guarda as datas e os objetivos de cada dia, e cada dia gera a arte e a legenda.

Next.js (App Router) + Prisma + MySQL. A API é feita nas rotas do próprio Next (`app/api`).

## Como rodar

1. **Chaves e banco.** Copie `.env.example` para `.env.local` e preencha ao menos uma chave de IA e as variáveis do banco (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`).
2. **Crie o banco vazio** (MySQL ou MariaDB, inclusive o do XAMPP):

   ```sql
   CREATE DATABASE post_generator CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **Instale e crie as tabelas:**

   ```bash
   npm install          # também gera o cliente do Prisma e copia o worker do pdf.js
   npm run db:migrate   # aplica as migrações em prisma/migrations
   npm run dev
   ```

4. Abra http://localhost:3000.

A conexão usa só as variáveis `DB_*` (sem URL): a senha pode ter qualquer símbolo, sem precisar codificar. O app e o
Prisma CLI leem as mesmas variáveis. Se o MySQL estiver desligado ou em outra rede, as telas mostram um aviso com o
botão "Tentar de novo".

## Dados

| Tabela | O que guarda |
| --- | --- |
| `Workspace` | A empresa. Hoje existe uma só (`default`), criada sozinha; todas as tabelas já têm `workspaceId`. |
| `Brand` | Identidade visual: perfil em JSON de texto e as logos (PNG) |
| `CalendarEntry` | Um dia planejado por data (datas comemorativas, objetivo, detalhes, situação) |
| `Post` | O post gerado do dia: arte final (PNG), legenda e os prompts para outra IA |

Ainda **não há login**: quem abrir o app vê e altera os mesmos dados. Use em rede local ou atrás de outra proteção.

Se este navegador tem dados das versões anteriores (guardados só nele), o app oferece enviá-los ao banco uma vez.

## Scripts

- `npm run db:migrate` aplica as migrações (`prisma migrate deploy`).
- `npm run db:studio` abre o Prisma Studio para ver as tabelas.
- Para alterar o esquema: edite `prisma/schema.prisma` e rode `npx prisma migrate dev --name descricao`.

## Rotas da API

`/api/brand`, `/api/calendar` (+ `/import` e `/[date]`), `/api/posts` (+ `/[date]` e `/[date]/image`),
`/api/analyze`, `/api/generate`, `/api/og`, `/api/providers`.
