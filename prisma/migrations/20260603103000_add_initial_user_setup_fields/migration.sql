ALTER TABLE "User"
ADD COLUMN "interfaceLanguage" "Lang",
ADD COLUMN "initialSetupCompleted" BOOLEAN NOT NULL DEFAULT false;
