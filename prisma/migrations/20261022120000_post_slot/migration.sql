-- Até 2 posts por dia do calendário: cada item passa a ser identificado por data + posição (slot).
-- Os registros que já existem ficam na posição 1.

-- AlterTable
ALTER TABLE `CalendarEntry` ADD COLUMN `slot` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Post` ADD COLUMN `slot` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex (antes do DropIndex: a chave estrangeira precisa de um índice que comece por workspaceId)
CREATE UNIQUE INDEX `CalendarEntry_workspaceId_date_slot_key` ON `CalendarEntry`(`workspaceId`, `date`, `slot`);

-- CreateIndex
CREATE UNIQUE INDEX `Post_workspaceId_date_slot_key` ON `Post`(`workspaceId`, `date`, `slot`);

-- DropIndex
DROP INDEX `CalendarEntry_workspaceId_date_key` ON `CalendarEntry`;

-- DropIndex
DROP INDEX `Post_workspaceId_date_key` ON `Post`;
