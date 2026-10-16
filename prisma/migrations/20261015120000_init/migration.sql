-- CreateTable
CREATE TABLE `Workspace` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Workspace_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Brand` (
    `workspaceId` VARCHAR(191) NOT NULL,
    `profile` LONGTEXT NOT NULL,
    `logo` LONGTEXT NOT NULL,
    `logoClara` LONGTEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`workspaceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarEntry` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `date` CHAR(10) NOT NULL,
    `ocasioes` TEXT NOT NULL,
    `objetivo` VARCHAR(255) NOT NULL,
    `detalhes` TEXT NOT NULL,
    `status` ENUM('pendente', 'gerado', 'postado') NOT NULL DEFAULT 'pendente',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CalendarEntry_workspaceId_status_idx`(`workspaceId`, `status`),
    UNIQUE INDEX `CalendarEntry_workspaceId_date_key`(`workspaceId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Post` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `date` CHAR(10) NOT NULL,
    `titulo` VARCHAR(255) NOT NULL,
    `layout` VARCHAR(20) NOT NULL,
    `formatId` VARCHAR(80) NOT NULL,
    `legenda` TEXT NOT NULL,
    `usedProvider` VARCHAR(120) NOT NULL,
    `imageProvider` VARCHAR(160) NOT NULL,
    `imageWarning` TEXT NOT NULL,
    `imagePrompt` TEXT NOT NULL,
    `imageJson` LONGTEXT NOT NULL,
    `postPrompt` LONGTEXT NOT NULL,
    `postJson` LONGTEXT NOT NULL,
    `brandJson` LONGTEXT NOT NULL,
    `imageType` VARCHAR(40) NOT NULL,
    `image` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Post_workspaceId_date_key`(`workspaceId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Brand` ADD CONSTRAINT `Brand_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEntry` ADD CONSTRAINT `CalendarEntry_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

