
import { prisma } from '../db/db.js';

export default async function healthRoutes(app) {
    app.get('/', async () => {
        return {
            message: 'Kwork Assistant is running!',
        };
    });

    app.get('/db-test', async () => {
        const count = await prisma.order.count();

        return {
            status: 'ok',
            database: 'connected',
            orders: count,
        };
    });
}
