
import 'dotenv/config';
import { analyzeProject } from './services/ai.js';

const project = {
    title: 'Разработка сайта на Nuxt 3',
    description:
        'Нужен адаптивный сайт из 5 страниц на Nuxt 3. ' +
        'Нужна форма обратной связи и интеграция с API. ' +
        'Необходимо проверить работу на мобильных устройствах.',
    budget: '30 000 ₽',
    category: 'Создание сайтов',
    url: 'https://kwork.ru/',
};

try {
    const result = await analyzeProject(project);

    console.log('\nРезультат анализа:\n');
    console.log(JSON.stringify(result, null, 2));

    console.log('\nПроверка новых полей:');
    console.log('Рекомендуемый бюджет:', result.suggestedBudget);
    console.log('Срок выполнения:', result.estimatedDays, 'дн.');
} catch (error) {
    console.error('Ошибка тестирования:', error.message);
    process.exitCode = 1;
}