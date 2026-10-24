
import 'dotenv/config';
import { sendProjectToTelegram } from './services/telegram.js';

try {
    await sendProjectToTelegram({
        kworkId: 'test-123',
        title: 'Тестовый заказ — разработка сайта на Nuxt 3',
        budget: '5000 ₽',
        url: 'https://kwork.ru/',
        aiReason: 'Тестируем отправку уведомлений в Telegram.',
        draftReply:
            'Здравствуйте. Поняла задачу. Готова обсудить детали разработки сайта.',
    });

    console.log('Тестовое сообщение отправлено!');
} catch (error) {
    console.error('Ошибка отправки:', error.message);
    process.exitCode = 1;
}
