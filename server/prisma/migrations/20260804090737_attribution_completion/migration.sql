-- CreateTable
CREATE TABLE "OrderAttributionHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "previousMatchMethod" TEXT,
    "previousMatchStatus" TEXT,
    "previousConfidence" DOUBLE PRECISION,
    "previousReason" TEXT,
    "previousStateJson" TEXT,
    "newMatchMethod" TEXT,
    "newMatchStatus" TEXT NOT NULL,
    "newConfidence" DOUBLE PRECISION NOT NULL,
    "newReason" TEXT,
    "newStateJson" TEXT,
    "changeSource" TEXT NOT NULL,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAttributionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportColumnTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mappingJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportColumnTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "enabledBy" TEXT,
    "disabledAt" TIMESTAMP(3),
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "matchWindowHours" INTEGER NOT NULL DEFAULT 48,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "platformThreadId" TEXT NOT NULL,
    "customerPsid" TEXT NOT NULL,
    "referralAdId" TEXT,
    "referralAdInternalId" TEXT,
    "referralAdSetInternalId" TEXT,
    "referralCampaignInternalId" TEXT,
    "referralCreativeInternalId" TEXT,
    "referralAdNameSnapshot" TEXT,
    "referralAdSetNameSnapshot" TEXT,
    "referralCampaignNameSnapshot" TEXT,
    "referralVideoIdSnapshot" TEXT,
    "normalizedPhoneExtracted" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchedOrderId" TEXT,
    "candidateOrdersJson" TEXT,
    "matchedAt" TIMESTAMP(3),
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "metaMessageId" TEXT,
    "textRaw" TEXT,
    "extractedPhone" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "textPurgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderAttributionHistory_orderId_idx" ON "OrderAttributionHistory"("orderId");

-- CreateIndex
CREATE INDEX "OrderAttributionHistory_workspaceId_idx" ON "OrderAttributionHistory"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportColumnTemplate_workspaceId_name_key" ON "ImportColumnTemplate"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingIntegration_workspaceId_key" ON "MessagingIntegration"("workspaceId");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_idx" ON "Conversation"("workspaceId");

-- CreateIndex
CREATE INDEX "Conversation_normalizedPhoneExtracted_idx" ON "Conversation"("normalizedPhoneExtracted");

-- CreateIndex
CREATE INDEX "Conversation_matchedOrderId_idx" ON "Conversation"("matchedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_platform_platformThreadId_key" ON "Conversation"("workspaceId", "platform", "platformThreadId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_workspaceId_idx" ON "Message"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_workspaceId_metaMessageId_key" ON "Message"("workspaceId", "metaMessageId");

-- AddForeignKey
ALTER TABLE "OrderAttributionHistory" ADD CONSTRAINT "OrderAttributionHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttributionHistory" ADD CONSTRAINT "OrderAttributionHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportColumnTemplate" ADD CONSTRAINT "ImportColumnTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingIntegration" ADD CONSTRAINT "MessagingIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingIntegration" ADD CONSTRAINT "MessagingIntegration_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_matchedOrderId_fkey" FOREIGN KEY ("matchedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
