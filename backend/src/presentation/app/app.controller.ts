import { Controller, Get } from '@nestjs/common';
import { GetAppInfoUseCase } from '../../application/app/get-app-info.use-case';
import { Public } from '../auth/auth.decorators';

@Controller()
export class AppController {
  constructor(private readonly getAppInfo: GetAppInfoUseCase) {}

  @Public()
  @Get()
  getInfo() {
    return this.getAppInfo.execute();
  }
}
