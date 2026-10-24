import { Bot, InlineKeyboard, Keyboard } from 'grammy';

// Получаем токен бота и ID Telegram-чата из переменных окружения.
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Проверяем, что токен задан.
if (!token) {
    throw new Error('Не задан TELEGRAM_BOT_TOKEN в файле .env');
}

// Создаём экземпляр Telegram-бота.
export const bot = new Bot(token);

// Лимит Telegram — 4096 символов на сообщение, оставляем запас под оформление.
const MAX_DRAFT_LENGTH = 2500;
const MAX_REASON_LENGTH = 600;
const MAX_TITLE_LENGTH = 300;

// Экранируем текст для parse_mode: 'HTML'.
function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

// Обрезаем слишком длинный текст, чтобы сообщение не отклонил Telegram.
function truncate(text, maxLength) {
    const value = String(text);

    return value.length > maxLength
        ? `${value.slice(0, maxLength)}… (текст обрезан)`
        : value;
}

// Пускаем к боту только владельца (TELEGRAM_CHAT_ID).
// /myid доступна всем: она нужна, чтобы узнать свой ID при настройке.
bot.use(async (ctx, next) => {
    if (ctx.message?.text?.startsWith('/myid')) {
        await next();
        return;
    }

    const currentChatId = ctx.chat?.id ?? ctx.from?.id;

    if (chatId && String(currentChatId) === String(chatId)) {
        await next();
        return;
    }

    if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа' });
    }
});

// Временное хранилище режима редактирования черновиков.
// Ключ — Telegram ID пользователя, значение — данные заказа.
const editingDrafts = new Map();

// Клавиатура главного меню.
const mainKeyboard = new Keyboard()
    .text('📋 Мои отклики')
    .resized();

// Получаем Prisma-клиент.
async function getPrisma() {
    const { prisma } = await import('../db/db.js');
    return prisma;
}

// Показываем список подтверждённых откликов.
async function sendMyApplications(ctx) {
    try {
        const prisma = await getPrisma();

        // Выбираем только заказы, подтверждённые кнопкой отправки отклика.
        const applications = await prisma.order.findMany({
            where: {
                appliedAt: { not: null },
            },
            orderBy: {
                appliedAt: 'desc',
            },
            select: {
                title: true,
                url: true,
                appliedDraft: true,
                appliedAt: true,
            },
        });

        if (applications.length === 0) {
            await ctx.reply(
                '📋 У тебя пока нет подтверждённых откликов.\n\n' +
                'Когда отправишь отклик на Kwork, нажми кнопку ' +
                '«✅ Я отправила отклик на заказ» в сообщении с заказом.'
            );
            return;
        }

        // Формируем отдельный текстовый блок для каждого отклика.
        const entries = applications.map((application, index) => {
            const date = application.appliedAt
                ? new Date(application.appliedAt).toLocaleDateString('ru-RU', {
                    timeZone: 'Europe/Moscow',
                })
                : 'Не указана';

            return [
                `📌 ${index + 1}. ${application.title}`,
                `🔗 ${application.url}`,
                `📅 Дата подтверждения: ${date}`,
                '',
                '✍️ Текст отклика:',
                application.appliedDraft
                    ? truncate(application.appliedDraft, MAX_DRAFT_LENGTH)
                    : 'Текст не сохранён',
            ].join('\n');
        });

        // Разбиваем длинный список на сообщения допустимого размера.
        let message = `📋 Мои отклики (${applications.length})\n\n`;

        for (const entry of entries) {
            const nextPart = `${entry}\n\n`;

            if (message.length + nextPart.length > 3500) {
                await ctx.reply(message);
                message = '';
            }

            message += nextPart;
        }

        if (message.trim()) {
            await ctx.reply(message);
        }
    } catch (error) {
        console.error('Ошибка при получении списка откликов:', error);
        await ctx.reply('Не удалось загрузить список откликов. Попробуй ещё раз.');
    }
}

// Обрабатываем кнопку «Изменить текст отклика».
bot.callbackQuery(/^edit:(.+)$/, async (ctx) => {
    const kworkId = ctx.match[1];

    try {
        const prisma = await getPrisma();

        const order = await prisma.order.findUnique({
            where: { kworkId },
        });

        if (!order || !order.draftReply || order.draftReply === '-') {
            await ctx.answerCallbackQuery({
                text: 'Черновик для этого заказа не найден',
                show_alert: true,
            });
            return;
        }

        editingDrafts.set(ctx.from.id, {
            kworkId,
            chatId: ctx.callbackQuery.message.chat.id,
            messageId: ctx.callbackQuery.message.message_id,
        });

        await ctx.answerCallbackQuery({
            text: 'Режим редактирования',
        });

        await ctx.reply(
            '✍️ Отправь сюда новый текст отклика одним сообщением.\n\n' +
            'Текущий черновик:\n\n' +
            truncate(order.draftReply, 3800)
        );
    } catch (error) {
        console.error('Ошибка при открытии редактирования:', error);

        await ctx.answerCallbackQuery({
            text: 'Не удалось открыть черновик',
            show_alert: true,
        });
    }
});

// Обрабатываем кнопку «Я отправила отклик на заказ».
bot.callbackQuery(/^applied:(.+)$/, async (ctx) => {
    const kworkId = ctx.match[1];

    try {
        const prisma = await getPrisma();

        const order = await prisma.order.findUnique({
            where: { kworkId },
        });

        if (!order) {
            await ctx.answerCallbackQuery({
                text: 'Заказ не найден в базе',
                show_alert: true,
            });
            return;
        }

        // Если отклик уже подтверждён, повторно его не записываем.
        if (order.appliedAt) {
            await ctx.answerCallbackQuery({
                text: 'Этот отклик уже сохранён',
            });

            await ctx.deleteMessage();
            return;
        }

        // Сохраняем именно текущий черновик как текст отправленного отклика.
        if (!order.draftReply || order.draftReply === '-') {
            await ctx.answerCallbackQuery({
                text: 'У этого заказа нет текста отклика',
                show_alert: true,
            });
            return;
        }

        await prisma.order.update({
            where: { kworkId },
            data: {
                appliedAt: new Date(),
                appliedDraft: order.draftReply,
            },
        });

        await ctx.answerCallbackQuery({
            text: 'Отклик сохранён в «Мои отклики»',
        });

        // Удаляем сообщение с заказом из чата.
        await ctx.deleteMessage();
    } catch (error) {
        console.error('Ошибка при подтверждении отклика:', error);

        await ctx.answerCallbackQuery({
            text: 'Не удалось сохранить отклик',
            show_alert: true,
        });
    }
});


// Обрабатываем текстовые сообщения пользователя.
bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Кнопка главного меню показывает сохранённые отклики.
    if (text === '📋 Мои отклики') {
        await sendMyApplications(ctx);
        return;
    }

    // Проверяем, находится ли пользователь в режиме редактирования.
    const editing = editingDrafts.get(userId);

    // Если редактирование не активно, передаём сообщение следующим обработчикам.
    if (!editing) {
        await next();
        return;
    }

    const { kworkId, chatId, messageId } = editing;
    const newDraft = text;

    if (!newDraft) {
        await ctx.reply('Текст отклика не должен быть пустым. Попробуй ещё раз.');
        return;
    }

    let prisma;

    try {
        prisma = await getPrisma();

        // Сохраняем новый черновик.
        await prisma.order.update({
            where: { kworkId },
            data: { draftReply: newDraft },
        });
    } catch (error) {
        console.error('Ошибка при сохранении черновика:', error);
        await ctx.reply('Не удалось сохранить черновик. Попробуй ещё раз.');
        return;
    }

    // Завершаем режим редактирования.
    editingDrafts.delete(userId);

    // Удаляем старое сообщение с заказом.
    try {
        await ctx.api.deleteMessage(chatId, messageId);
    } catch (error) {
        console.error('Не удалось удалить старое сообщение:', error.message);
    }

    // Отправляем заказ с обновлённым черновиком.
    try {
        const order = await prisma.order.findUnique({
            where: { kworkId },
        });

        if (order) {
            await sendProjectToTelegram(order);
        }
    } catch (error) {
        console.error('Ошибка при отправке обновлённого заказа:', error);
        await ctx.reply('Черновик сохранён, но не удалось отправить обновлённый заказ.');
    }
});

// Обрабатываем кнопку «Пропустить заказ».
bot.callbackQuery(/^skip:(.+)$/, async (ctx) => {
    const kworkId = ctx.match[1];

    try {
        const prisma = await getPrisma();

        await prisma.order.update({
            where: { kworkId },
            data: { isSkipped: true },
        });

        await ctx.answerCallbackQuery({
            text: 'Заказ пропущен',
        });

        await ctx.deleteMessage();
    } catch (error) {
        console.error('Ошибка при пропуске заказа:', error);

        await ctx.answerCallbackQuery({
            text: 'Не удалось пропустить заказ',
            show_alert: true,
        });
    }
});

// Команда /start.
bot.command('start', async (ctx) => {
    await ctx.reply(
        'Привет! Я Kwork Assistant 🤖\n\n' +
        'Буду проверять новые заказы Kwork и присылать подходящие проекты ' +
        'с черновиками откликов.\n\n' +
        'После отправки отклика на Kwork нажми кнопку подтверждения ' +
        'в сообщении с заказом. Сохранённые отклики можно посмотреть ' +
        'кнопкой «📋 Мои отклики».',
        {
            reply_markup: mainKeyboard,
        }
    );
});

// Команда /myapplications.
bot.command('myapplications', async (ctx) => {
    await sendMyApplications(ctx);
});

// Команда /myid.
bot.command('myid', async (ctx) => {
    await ctx.reply(`Твой Telegram ID: ${ctx.from.id}`);
});

// Глобальный обработчик ошибок grammY.
bot.catch((error) => {
    console.error('Ошибка Telegram-бота:', error);
});

// Запускаем Telegram-бота и настраиваем команды.
export async function startTelegramBot() {
    // Настройка команд не должна блокировать запуск бота.
    try {
        await bot.api.setMyCommands([
            { command: 'start', description: 'Запустить бота' },
            { command: 'myapplications', description: 'Мои отклики' },
            { command: 'myid', description: 'Показать Telegram ID' },
        ]);

        console.log('Команды Telegram успешно настроены');
    } catch (error) {
        console.error(
            'Не удалось настроить команды Telegram, продолжаем запуск:',
            error.message
        );
    }

    // Запускаем получение сообщений и обработку команд.
    await bot.start({
        onStart: (botInfo) => {
            console.log(`Telegram-бот @${botInfo.username} запущен`);
        },
    });
}

// Отправляем подходящий заказ в Telegram.
export async function sendProjectToTelegram(project) {
    if (!chatId) {
        throw new Error('Не задан TELEGRAM_CHAT_ID в файле .env');
    }

    const message = [
        '🎯 <b>Подходящий заказ на Kwork</b>',
        '',
        `📌 ${escapeHtml(truncate(project.title, MAX_TITLE_LENGTH))}`,
        `💰 Бюджет заказчика: ${escapeHtml(project.budget || 'Не указан')}`,
        `💵 Рекомендуемая стоимость: ${escapeHtml(project.suggestedBudget || 'Не определена')}`,
        `⏱ Срок выполнения: ${project.estimatedDays ? `${project.estimatedDays} дн.` : 'Не определён'
        }`,
        '',
        '🧠 Почему подходит:',
        escapeHtml(truncate(project.aiReason || 'Причина не указана', MAX_REASON_LENGTH)),
        '',
        '✍️ Черновик отклика (нажми, чтобы скопировать):',
        `<pre>${escapeHtml(truncate(project.draftReply || 'Черновик отсутствует', MAX_DRAFT_LENGTH))}</pre>`,
        '',
        `🔗 ${escapeHtml(project.url)}`,
    ].join('\n');

    // Создаём клавиатуру с действиями для заказа.
    const keyboard = new InlineKeyboard()
        .url('Открыть заказ', project.url)
        .row()
        .text('✏️ Изменить текст отклика', `edit:${project.kworkId}`)
        .row()
        .text('✅ Я отправила отклик на заказ', `applied:${project.kworkId}`)
        .row()
        .text('⏭ Пропустить заказ', `skip:${project.kworkId}`);

    const sentMessage = await bot.api.sendMessage(chatId, message, {
        reply_markup: keyboard,
        parse_mode: 'HTML',
    });

    return sentMessage.message_id;
}