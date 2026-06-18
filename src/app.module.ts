import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import * as entities from './entities';
import { AuthModule } from './modules/auth.module';
import { WeightModule } from './modules/weight.module';
import { DailyModule } from './modules/daily.module';
import { MealModule } from './modules/meal.module';
import { SummaryModule } from './modules/summary.module';
import { StageModule } from './modules/stage.module';
import { ShareModule } from './modules/share.module';
import { ServiceModule } from './modules/service.module';
import { AdminModule } from './modules/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres',
        host: c.get('DB_HOST', 'maisimei-db'),
        port: +c.get('DB_PORT', 5432),
        username: c.get('DB_USER', 'maisimei'),
        password: c.get('DB_PASSWORD'),
        database: c.get('DB_NAME', 'maisimei'),
        entities: Object.values(entities),
        // 首次部署自动建表；表结构稳定后在 .env 设 DB_SYNC=false 并改用 migration
        synchronize: c.get('DB_SYNC', 'true') === 'true',
      }),
    }),
    // 全局 JWT，供各模块与守卫注入
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.get('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: c.get('JWT_EXPIRES', '30d') },
      }),
    }),
    AuthModule,
    WeightModule,
    DailyModule,
    MealModule,
    SummaryModule,
    StageModule,
    ShareModule,
    ServiceModule,
    AdminModule,
  ],
})
export class AppModule {}
