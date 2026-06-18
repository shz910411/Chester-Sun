import {
  Module, Controller, Post, Get, Body, Query, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeightRecord } from '../entities';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';

@Injectable()
export class WeightService {
  constructor(@InjectRepository(WeightRecord) private repo: Repository<WeightRecord>) {}

  /** 记录称重；client_uuid 幂等（防重复提交） */
  async create(userId: string, dto: any) {
    if (dto.client_uuid) {
      const exist = await this.repo.findOne({ where: { user_id: userId, client_uuid: dto.client_uuid } });
      if (exist) return exist;
    }
    const rec = this.repo.create({
      ...dto,
      user_id: userId,
      measured_at: dto.measured_at ? new Date(dto.measured_at) : new Date(),
    });
    return this.repo.save(rec);
  }

  /** 曲线/列表；range = 7d / 30d / all */
  async list(userId: string, range = 'all') {
    const qb = this.repo.createQueryBuilder('w')
      .where('w.user_id = :u', { u: userId })
      .orderBy('w.measured_at', 'ASC');
    if (range.endsWith('d')) {
      const days = parseInt(range, 10) || 7;
      const from = new Date(Date.now() - days * 86400000);
      qb.andWhere('w.measured_at >= :from', { from });
    }
    return qb.getMany();
  }
}

@Controller()
export class WeightController {
  constructor(private svc: WeightService) {}

  @UseGuards(JwtAuthGuard) @Post('weights')
  create(@CurrentUserId() uid: string, @Body() dto: any) { return this.svc.create(uid, dto); }

  @UseGuards(JwtAuthGuard) @Get('weights')
  list(@CurrentUserId() uid: string, @Query('range') range: string) { return this.svc.list(uid, range); }
}

@Module({
  imports: [TypeOrmModule.forFeature([WeightRecord])],
  controllers: [WeightController],
  providers: [WeightService],
})
export class WeightModule {}
