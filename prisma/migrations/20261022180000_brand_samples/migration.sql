-- Amostras reduzidas (miniaturas JPEG) dos posts de exemplo e das páginas do manual, para a IA de imagem
-- usar como referência visual ao gerar a arte completa. Tabela nova: nada que já existe muda.

-- CreateTable
CREATE TABLE `BrandSample` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(10) NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `largura` INTEGER NOT NULL,
    `altura` INTEGER NOT NULL,
    `image` LONGTEXT NOT NULL,
    `usadoEm` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BrandSample_workspaceId_tipo_idx`(`workspaceId`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BrandSample` ADD CONSTRAINT `BrandSample_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
