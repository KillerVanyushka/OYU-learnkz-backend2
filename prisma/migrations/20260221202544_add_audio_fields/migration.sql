-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskType" ADD VALUE 'AUDIO_DICTATION';
ALTER TYPE "TaskType" ADD VALUE 'AUDIO_TRANSLATE';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "audioText" TEXT,
ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "translateText" TEXT,
ALTER COLUMN "promptText" DROP NOT NULL,
ALTER COLUMN "optionsWords" DROP NOT NULL,
ALTER COLUMN "correctWords" DROP NOT NULL;
