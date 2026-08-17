import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ChangePasswordUseCase } from '../../application/auth/change-password.use-case';
import { GetCurrentUserUseCase } from '../../application/auth/get-current-user.use-case';
import { LoginUseCase } from '../../application/auth/login.use-case';
import {
  clientIp,
  CurrentUser,
  Public,
  type AuthUser,
} from './auth.decorators';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.loginUseCase.execute(dto.email, dto.password, clientIp(req));
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.getCurrentUser.execute(user.id);
  }

  @Post('change-password')
  async updatePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const updated = await this.changePassword.execute(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      clientIp(req),
    );
    return { user: updated };
  }
}
