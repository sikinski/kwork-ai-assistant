import { prisma } from '../db/db.js';
import { fetchKworkProjects } from './kwork.js';
import { analyzeProject } from './ai.js';
import { sendProjectToTelegram } from './telegram.js';
import { KWORK_CATEGORIES, ANALYZE_BATCH_SIZE } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Сколько неотправленных подходящих заказов пытаемся доставить за один запуск.
const NOTIFY_BATCH_SIZE = 20;

export async function syncProjects() {
    let fetched = 0;
    let added = 0;
    let skipped = 0;
    let totalAvailable = 0;
    let pagesProcessed = 0;

    for (const category of KWORK_CATEGORIES) {
        let totalPages = 1;

        for (let page = 1; page <= totalPages; page++) {
            const result = await fetchKworkProjects(page, category);

            if (page === 1) {
                totalAvailable += result.total;
            }

            totalPages = Math.ceil(result.total / result.perPage);
            fetched += result.projects.length;
            pagesProcessed++;

            let addedOnPage = 0;

            for (const project of result.projects) {
                try {
                    await prisma.order.create({ data: project });
                    added++;
                    addedOnPage++;
                } catch (error) {
                    if (error.code === 'P2002') {
                        skipped++;
                    } else {
                        throw error;
                    }
                }
            }

            // Заказы идут от новых к старым: если на странице нет ни одного нового,
            // дальше будут только уже известные — не тратим запросы.
            if (addedOnPage === 0) {
                break;
            }

            if (page < totalPages) {
                await sleep(1000);
            }
        }

        await sleep(1000);
    }

    return {
        categories: KWORK_CATEGORIES,
        pagesProcessed,
        fetched,
        added,
        skipped,
        totalAvailable,
    };
}

// Анализирует очередную порцию заказов, которые ещё не оценивал ИИ.
export async function analyzePendingOrders(app) {
    const orders = await prisma.order.findMany({
        where: {
            isRelevant: null,
            isSkipped: false,
        },
        orderBy: { discoveredAt: 'desc' },
        take: ANALYZE_BATCH_SIZE,
    });

    let analyzed = 0;
    let failed = 0;
    const results = [];

    for (const order of orders) {
        try {
            const analysis = await analyzeProject(order);

            await prisma.order.update({
                where: { id: order.id },
                data: {
                    isRelevant: analysis.isRelevant,
                    aiReason: analysis.reason,
                    draftReply: analysis.draftReply,
                    suggestedBudget: analysis.suggestedBudget,
                    estimatedDays: analysis.estimatedDays,
                },
            });

            analyzed++;

            results.push({
                kworkId: order.kworkId,
                title: order.title,
                isRelevant: analysis.isRelevant,
                score: analysis.score,
                priority: analysis.priority,
                reason: analysis.reason,
                draftReply: analysis.draftReply,
                suggestedBudget: analysis.suggestedBudget,
                estimatedDays: analysis.estimatedDays,
            });
        } catch (error) {
            failed++;

            app.log.error(
                { err: error, kworkId: order.kworkId },
                'Failed to analyze project',
            );
        }
    }

    const remaining = await prisma.order.count({
        where: {
            isRelevant: null,
            isSkipped: false,
        },
    });

    return {
        found: orders.length,
        analyzed,
        failed,
        remaining,
        results,
    };
}

// Отправляет в Telegram подходящие заказы, которые ещё не были доставлены.
// Если отправка не удалась, заказ останется в очереди до следующего запуска.
export async function notifyPendingOrders(app) {
    const orders = await prisma.order.findMany({
        where: {
            isRelevant: true,
            notifiedAt: null,
            isSkipped: false,
            appliedAt: null,
        },
        orderBy: { discoveredAt: 'asc' },
        take: NOTIFY_BATCH_SIZE,
    });

    let notified = 0;
    let failed = 0;

    for (const order of orders) {
        try {
            await sendProjectToTelegram(order);

            await prisma.order.update({
                where: { id: order.id },
                data: { notifiedAt: new Date() },
            });

            notified++;
        } catch (error) {
            failed++;

            app.log.error(
                { err: error, kworkId: order.kworkId },
                'Не удалось отправить заказ в Telegram',
            );
        }
    }

    return { notified, failed };
}

export async function processProjects(app) {
    const sync = await syncProjects();
    const analysis = await analyzePendingOrders(app);
    const notification = await notifyPendingOrders(app);

    return {
        status: 'ok',
        sync,
        analysis: {
            ...analysis,
            notified: notification.notified,
            notifyFailed: notification.failed,
        },
    };
}
