import { Test, TestingModule } from '@nestjs/testing';
import { GetAppInfoUseCase } from '../../application/app/get-app-info.use-case';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [GetAppInfoUseCase],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API info', () => {
      expect(controller.getInfo()).toEqual({
        name: 'Water Quality API',
        version: '1.0.0',
        status: 'ok',
        orm: 'prisma',
      });
    });
  });
});
