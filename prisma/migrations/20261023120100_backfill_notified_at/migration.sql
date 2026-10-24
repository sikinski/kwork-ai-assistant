-- Раньше notifiedAt не заполнялся. Считаем уже обработанные релевантные заказы отправленными,
-- чтобы повторная отправка не прислала их все заново.
UPDATE "Order" SET "notifiedAt" = "updatedAt" WHERE "isRelevant" = true AND "notifiedAt" IS NULL;
