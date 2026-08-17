-- AlterTable
ALTER TABLE "water_quality_reports" ADD COLUMN "source_file_name" TEXT;
ALTER TABLE "water_quality_reports" ADD COLUMN "source_file_mime" TEXT;
ALTER TABLE "water_quality_reports" ADD COLUMN "source_file_path" TEXT;
ALTER TABLE "water_quality_reports" ADD COLUMN "source_file_size" INTEGER;

-- CreateTable
CREATE TABLE "lab_document_staging" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_document_staging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_document_staging_token_key" ON "lab_document_staging"("token");

-- CreateIndex
CREATE INDEX "lab_document_staging_created_by_id_idx" ON "lab_document_staging"("created_by_id");

-- CreateIndex
CREATE INDEX "lab_document_staging_expires_at_idx" ON "lab_document_staging"("expires_at");

-- AddForeignKey
ALTER TABLE "lab_document_staging" ADD CONSTRAINT "lab_document_staging_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
