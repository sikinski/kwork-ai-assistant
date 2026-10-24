
import 'dotenv/config';
import Fastify from 'fastify';

import healthRoutes from './routes/health.js';
import kworkRoutes from './routes/kwork.js';
import aiRoutes from './routes/ai.js';

import { processProjects } from './services/process.js';
import { startTelegramBot } from './services/telegram.js';

const app = Fastify({
    logger: true,
});

const CHECK_INTERVAL = 5 * 60 * 1000;

let isProcessing = false;

async function runScheduledCheck() {
    if (isProcessing) {
        app.log.info('Предыдущая проверка ещё выполняется, пропускаем запуск');
        return;
    }

    isProcessing = true;

    try {
        app.log.info('Запуск автоматической проверки Kwork');

        const result = await processProjects(app);

        app.log.info(
            {
                added: result.sync.added,
                analyzed: result.analysis.analyzed,
                failed: result.analysis.failed,
                remaining: result.analysis.remaining,
            },
            'Автоматическая проверка завершена',
        );
    } catch (error) {
        app.log.error({ err: error }, 'Ошибка автоматической проверки Kwork');
    } finally {
        isProcessing = false;
    }
}

await app.register(healthRoutes);
await app.register(kworkRoutes);
await app.register(aiRoutes);

try {
    await app.listen({
        port: 3001,
        host: '127.0.0.1',
    });

    startTelegramBot().catch((error) => {
        app.log.error({ err: error }, 'Не удалось запустить Telegram-бота');
    });

    await runScheduledCheck();

    setInterval(() => {
        void runScheduledCheck();
    }, CHECK_INTERVAL);
} catch (error) {
    app.log.error(error);
    await app.close();
    process.exit(1);
}
