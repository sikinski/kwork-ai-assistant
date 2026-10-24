import { syncProjects, processProjects } from '../services/process.js';

export default async function kworkRoutes(app) {
    app.post('/sync', async () => {
        const result = await syncProjects();

        return {
            status: 'ok',
            ...result,
        };
    });

    app.post('/process', async () => {
        return await processProjects(app);
    });
}