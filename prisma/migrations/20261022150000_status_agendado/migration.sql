-- Novo status "agendado": a arte já foi programada na ferramenta de publicação (ex.: Meta Business Suite).
-- Só acrescenta um valor ao enum; os registros existentes não mudam.

-- AlterTable
ALTER TABLE `CalendarEntry` MODIFY `status` ENUM('pendente', 'gerado', 'agendado', 'postado') NOT NULL DEFAULT 'pendente';
