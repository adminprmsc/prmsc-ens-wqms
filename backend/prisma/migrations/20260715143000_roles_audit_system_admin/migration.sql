-- Remap UserRole to SYSTEM_ADMIN / SUPER_ADMIN / USER
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "UserRole_new" AS ENUM ('SYSTEM_ADMIN', 'SUPER_ADMIN', 'USER');

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE "role"::text
      WHEN 'PCRWR_USER' THEN 'USER'::"UserRole_new"
      WHEN 'ENVIRONMENTAL_SPECIALIST' THEN 'USER'::"UserRole_new"
      WHEN 'RESEARCH_ANALYST' THEN 'USER'::"UserRole_new"
      ELSE 'USER'::"UserRole_new"
    END
  );

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";

-- Account control columns
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

-- Audit history
CREATE TYPE "AuditAction" AS ENUM (
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'PASSWORD_RESET',
  'ROLE_CHANGED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED'
);

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "actor_id" TEXT,
  "target_id" TEXT,
  "metadata" JSONB,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_target_id_idx" ON "audit_logs"("target_id");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_target_id_fkey"
  FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default SYSTEM_ADMIN (password: ChangeMe@123) — change after first login
INSERT INTO "users" (
  "id",
  "name",
  "email",
  "password_hash",
  "role",
  "organization",
  "is_active",
  "must_change_password",
  "created_at",
  "updated_at"
)
VALUES (
  'cm_system_admin_seed_001',
  'System Administrator',
  'system.admin@prmsc.gov.pk',
  '$2b$10$4RPjLpZONp.KWYf0eTGL8Or372bh.zXDh6MI5I1G1uSWYHt7tNEX.',
  'SYSTEM_ADMIN',
  'PRMSC-HO',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO NOTHING;
