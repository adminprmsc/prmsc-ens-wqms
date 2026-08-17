import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository';
import type { UserRepository } from '../../domain/user/repositories/user.repository';
import { toPublicUser, type PublicUser } from '../../domain/user/user';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async execute(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }
}
