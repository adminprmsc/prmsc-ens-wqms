import { Injectable } from '@nestjs/common';

export type AppInfo = {
  name: string;
  version: string;
  status: string;
  orm: string;
};

@Injectable()
export class GetAppInfoUseCase {
  execute(): AppInfo {
    return {
      name: 'WQMS API',
      version: '0.1.0',
      status: 'ok',
      orm: 'prisma',
    };
  }
}
