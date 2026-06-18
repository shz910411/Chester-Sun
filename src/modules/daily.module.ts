import {
  Module, Controller, Put, Body, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyLog } from '../entities';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';

@Injectable()
export class DailyService {
  constructor(@InjectRepository(DailyLog) private repo: Repository<DailyLog>) {}

  /** 饮水/排便/睡眠 当日 upsert（可加可减，直接改当日值） */
  async upsert(userId: string, dto: any) {
    const date = dto.log_date || new Date().toISOString().slice(0, 10);
    let row = await this.repo.findOne({ where: { user_id: userId, log_date: date } });
    if (!row) row = this.repo.create({ user_id: userId, log_date: date });
    if (dto.water_cups !== undefined) row.water_cups = dto.water_cups;
    if (dto.water_cup_ml !== undefined) row.water_cup_ml = dto.water_cup_ml;
    if (dto.bowel_count !== undefined) row.bowel_count = dto.bowel_count;
    if (dto.bowel_status !== undefined) row.bowel_status = dto.bowel_status;
    if (dto.sleep_hours !== undefined) row.sleep_hours = dto.sleep_hours;
    if (dto.note !== undefined) row.note = dto.note;
    return this.repo.save(row);
  }
}

@Controller()
export class DailyController {
  constructor(private svc: DailyService) {}

  @UseGuards(JwtAuthGuard) @Put('me/daily-log')
  upsert(@CurrentUserId() uid: string, @Body() dto: any) { return this.svc.upsert(uid, dto); }
}

@Module({
  imports: [TypeOrmModule.forFeature([DailyLog])],
  controllers: [DailyController],
  providers: [DailyService],
})
export class DailyModule {}
