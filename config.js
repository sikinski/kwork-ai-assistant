import 'dotenv/config';

export const KWORK_CATEGORIES = (process.env.KWORK_CATEGORIES ?? '37,24,38,41')
    .split(',')
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);

export const ANALYZE_BATCH_SIZE = Math.max(
    1,
    Number.parseInt(process.env.ANALYZE_BATCH_SIZE ?? '5', 10) || 5,
);