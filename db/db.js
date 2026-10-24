import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';

// Prisma считает относительный путь "file:./dev.db" от папки со schema.prisma,
// поэтому разрешаем его так же, независимо от текущей директории процесса.
const schemaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.startsWith('file:')) {
    throw new Error('DATABASE_URL в .env должен быть вида file:./dev.db');
}

const adapter = new PrismaBetterSQLite3({
    url: path.resolve(schemaDir, databaseUrl.slice('file:'.length)),
});

export const prisma = new PrismaClient({ adapter });
