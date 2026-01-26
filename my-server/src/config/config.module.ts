import { Module } from '@nestjs/common';
import {
  ConfigModule as NestConfigModule,
  ConfigService,
} from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DataClient } from '../etl/client/data-client';

@Module({
  imports: [
    NestConfigModule,
    HttpModule.registerAsync({
      imports: [NestConfigModule],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get<string>('API_BASE_URL'), // .env 에서 셋팅
        timeout: configService.get<number>('API_TIMEOUT', 5000),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [DataClient],
  exports: [HttpModule, DataClient],
})
export class ConfigModule {}
