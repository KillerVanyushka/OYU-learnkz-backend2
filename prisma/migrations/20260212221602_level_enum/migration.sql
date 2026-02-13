/*
  Warnings:

  - The `level` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Level" AS ENUM ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "level",
ADD COLUMN     "level" "Level" NOT NULL DEFAULT 'A0';
