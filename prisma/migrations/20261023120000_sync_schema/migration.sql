-- Колонки, которые раньше добавлялись через db push и не попали в историю миграций.
ALTER TABLE "Order" ADD COLUMN "isSkipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "appliedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "appliedDraft" TEXT;
ALTER TABLE "Order" ADD COLUMN "estimatedDays" INTEGER;
ALTER TABLE "Order" ADD COLUMN "suggestedBudget" TEXT;
