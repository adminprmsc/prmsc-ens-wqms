import { Injectable } from '@nestjs/common';
import type {
  CreateUserInput,
  ListUsersFilter,
  UpdateUserInput,
  UserRepository,
} from '../../../../domain/user/repositories/user.repository';
import { UserRole, type UserRecord } from '../../../../domain/user/user';
import { PrismaService } from '../prisma.service';

type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  organization: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserRecord | null> {
    const row = (await this.prisma.user.findUnique({
      where: { id },
    })) as UserRow | null;
    return row ? this.map(row) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = (await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })) as UserRow | null;
    return row ? this.map(row) : null;
  }

  async list(filter: ListUsersFilter = {}): Promise<UserRecord[]> {
    const rows = (await this.prisma.user.findMany({
      where: {
        ...(filter.role ? { role: filter.role } : {}),
        ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
        ...(filter.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: 'insensitive' } },
                { email: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    })) as UserRow[];

    return rows.map((row) => this.map(row));
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const row = (await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        role: input.role,
        organization: input.organization ?? null,
        isActive: input.isActive ?? true,
        mustChangePassword: input.mustChangePassword ?? false,
      },
    })) as UserRow;
    return this.map(row);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserRecord> {
    const row = (await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.organization !== undefined
          ? { organization: input.organization }
          : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.passwordHash !== undefined
          ? { passwordHash: input.passwordHash }
          : {}),
        ...(input.mustChangePassword !== undefined
          ? { mustChangePassword: input.mustChangePassword }
          : {}),
        ...(input.lastLoginAt !== undefined
          ? { lastLoginAt: input.lastLoginAt }
          : {}),
      },
    })) as UserRow;
    return this.map(row);
  }

  async countByRole(role: UserRole): Promise<number> {
    return this.prisma.user.count({
      where: { role },
    });
  }

  private map(user: UserRow): UserRecord {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role as UserRole,
      organization: user.organization,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
