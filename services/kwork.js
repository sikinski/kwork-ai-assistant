const KWORK_PROJECTS_URL = 'https://kwork.ru/projects';

export async function fetchKworkProjects(page = 1, category = null) {
    const params = new URLSearchParams({
        a: '1',
    });

    if (category !== null) {
        params.set('fc', String(category));
    }

    const form = new FormData();
    form.append('a', '1');
    form.append('page', String(page));

    const requestUrl = `${KWORK_PROJECTS_URL}?${params.toString()}`;

    const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
            Accept: 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: `${requestUrl}&page=${page}`,
        },
        body: form,
    });

    if (!response.ok) {
        throw new Error(`Kwork вернул HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data?.pagination?.data) {
        throw new Error('Не удалось получить список проектов Kwork');
    }

    const pagination = result.data.pagination;

    return {
        currentPage: pagination.current_page,
        total: pagination.total,
        perPage: pagination.per_page,
        projects: pagination.data.map((project) => ({
            kworkId: String(project.id),
            title: project.name,
            url: `${KWORK_PROJECTS_URL}/${project.id}/view`,
            description: project.description ?? null,
            budget: project.possiblePriceLimit != null
                ? String(project.possiblePriceLimit)
                : project.priceLimit ?? null,
            category: project.category_id ?? null,
            publishedAt: project.date_active
                ? new Date(project.date_active.replace(' ', 'T'))
                : null,
        })),
    };
}