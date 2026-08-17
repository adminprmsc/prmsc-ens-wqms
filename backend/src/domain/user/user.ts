export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  USER = 'USER',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]: 'Administrator',
  [UserRole.SUPER_ADMIN]: 'PRMSC Manager',
  [UserRole.USER]: 'PCRWR User',
};

export const ORGANIZATION = {
  PRMSC: 'PRMSC-HO',
  PCRWR: 'PCRWR',
} as const;

export type OrganizationName = (typeof ORGANIZATION)[keyof typeof ORGANIZATION];

/** PRMSC roles → PRMSC-HO; PCRWR (USER) → PCRWR */
export function organizationForRole(role: UserRole): OrganizationName {
  return role === UserRole.USER ? ORGANIZATION.PCRWR : ORGANIZATION.PRMSC;
}

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organization: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = Omit<UserRecord, 'passwordHash'>;

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
