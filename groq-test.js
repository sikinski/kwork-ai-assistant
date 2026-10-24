
import 'dotenv/config';
import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.error('Ошибка: GROQ_API_KEY не найден в .env');
  process.exit(1);
}

const groq = new Groq({ apiKey });

try {
  const response = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      {
        role: 'user',
        content: 'Ответь по-русски одной фразой: Groq API работает.',
      },
    ],
  });

  console.log('Ответ Groq:', response.choices[0].message.content);
} catch (error) {
  console.error('Ошибка Groq API:', error.status ?? '', error.message);
  process.exitCode = 1;
}
