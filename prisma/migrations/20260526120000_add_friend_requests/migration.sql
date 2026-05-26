CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "FriendRequest" (
  "id" SERIAL NOT NULL,
  "senderId" INTEGER NOT NULL,
  "receiverId" INTEGER NOT NULL,
  "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FriendRequest"
ADD CONSTRAINT "FriendRequest_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FriendRequest"
ADD CONSTRAINT "FriendRequest_receiverId_fkey"
FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FriendRequest_senderId_receiverId_key"
ON "FriendRequest"("senderId", "receiverId");

CREATE INDEX "FriendRequest_senderId_status_createdAt_idx"
ON "FriendRequest"("senderId", "status", "createdAt");

CREATE INDEX "FriendRequest_receiverId_status_createdAt_idx"
ON "FriendRequest"("receiverId", "status", "createdAt");
