import type { UserRecord, UserRole } from '../user';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organization?: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
};

export type UpdateUserInput = {
  name?: string;
  organization?: string | null;
  role?: UserRole;
  isActive?: boolean;
  passwordHash?: string;
  mustChangePassword?: boolean;
  lastLoginAt?: Date | null;
};

export type ListUsersFilter = {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
};

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  list(filter?: ListUsersFilter): Promise<UserRecord[]>;
  create(input: CreateUserInput): Promise<UserRecord>;
  update(id: string, input: UpdateUserInput): Promise<UserRecord>;
  countByRole(role: UserRole): Promise<number>;
}
