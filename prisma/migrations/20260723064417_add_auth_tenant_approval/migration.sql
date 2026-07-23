-- CreateTable
CREATE TABLE "phone_verifications" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26),
    "phone" VARCHAR(30) NOT NULL,
    "purpose" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "otp_hash" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_profiles" (
    "tenant_id" CHAR(26) NOT NULL,
    "display_name" VARCHAR(255),
    "bio" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "address" TEXT,
    "province_code" VARCHAR(50),
    "province_name" VARCHAR(100),
    "tax_code" VARCHAR(50),
    "business_license_no" VARCHAR(100),
    "bank_name" VARCHAR(100),
    "bank_account_no" VARCHAR(100),
    "bank_account_name" VARCHAR(255),
    "qr_url" TEXT,
    "settings_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_profiles_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "tenant_documents" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "file_url" TEXT NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "reject_reason" TEXT,
    "uploaded_by" CHAR(26),
    "reviewed_by" CHAR(26),
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_invites" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "role_key" VARCHAR(50) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" CHAR(26) NOT NULL,
    "accepted_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_tasks" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" CHAR(26) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "submitted_by" CHAR(26) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" CHAR(26),
    "reviewed_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "snapshot_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_logs" (
    "id" CHAR(26) NOT NULL,
    "approval_task_id" CHAR(26) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "from_status" VARCHAR(50),
    "to_status" VARCHAR(50) NOT NULL,
    "note" TEXT,
    "actor_user_id" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" CHAR(26) NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "note" TEXT NOT NULL,
    "visibility" VARCHAR(50) NOT NULL DEFAULT 'platform_only',
    "created_by" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_verifications_phone_idx" ON "phone_verifications"("phone");

-- CreateIndex
CREATE INDEX "phone_verifications_user_id_idx" ON "phone_verifications"("user_id");

-- CreateIndex
CREATE INDEX "phone_verifications_status_expires_at_idx" ON "phone_verifications"("status", "expires_at");

-- CreateIndex
CREATE INDEX "tenant_profiles_province_code_idx" ON "tenant_profiles"("province_code");

-- CreateIndex
CREATE INDEX "tenant_documents_tenant_id_status_idx" ON "tenant_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenant_invites_tenant_id_status_idx" ON "tenant_invites"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invites_token_hash_key" ON "tenant_invites"("token_hash");

-- CreateIndex
CREATE INDEX "approval_tasks_status_target_type_idx" ON "approval_tasks"("status", "target_type");

-- CreateIndex
CREATE INDEX "approval_tasks_tenant_id_status_idx" ON "approval_tasks"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "approval_tasks_target_type_target_id_idx" ON "approval_tasks"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "approval_logs_approval_task_id_idx" ON "approval_logs"("approval_task_id");

-- CreateIndex
CREATE INDEX "admin_notes_target_type_target_id_idx" ON "admin_notes"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_notes_tenant_id_idx" ON "admin_notes"("tenant_id");

-- AddForeignKey
ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_profiles" ADD CONSTRAINT "tenant_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_documents" ADD CONSTRAINT "tenant_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_documents" ADD CONSTRAINT "tenant_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_documents" ADD CONSTRAINT "tenant_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_approval_task_id_fkey" FOREIGN KEY ("approval_task_id") REFERENCES "approval_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
