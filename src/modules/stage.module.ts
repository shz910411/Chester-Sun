import {
  Module, Controller, Post, Get, Body, Query, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageRecord, HealthReport } from '../entities';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';

const whr = (w?: number, h?: number) =>
  w && h ? Number((Number(w) / Number(h)).toFixed(2)) : null;

@Injectable()
export class StageService {
  constructor(
    @InjectRepository(StageRecord) private stages: Repository<StageRecord>,
    @InjectRepository(HealthReport) private reports: Repository<HealthReport>,
  ) {}

  /** 阶段记录：三面照 + 围度（photo_key 来自私有桶上传） */
  async create(userId: string, dto: any) {
    return this.stages.save(this.stages.create({
      user_id: userId,
      stage: dto.stage || 'periodic',
      taken_at: dto.taken_at ? new Date(dto.taken_at) : new Date(),
      front_photo_key: dto.front_photo_key,
      side_photo_key: dto.side_photo_key,
      back_photo_key: dto.back_photo_key,
      tongue_photo_key: dto.tongue_photo_key,
      waist_cm: dto.waist_cm,
      hip_cm: dto.hip_cm,
      thigh_cm: dto.thigh_cm,
      visible_to_advisors: dto.visible_to_advisors !== false,
      note: dto.note,
    }));
  }

  async list(userId: string) {
    const rows = await this.stages.find({ where: { user_id: userId }, order: { taken_at: 'ASC' } });
    return rows.map((r) => ({ ...r, whr: whr(r.waist_cm, r.hip_cm) }));
  }

  /** 阶段对比（围度差 + 腰臀比；照片不参与自动分析，仅返回 key 供前端看图） */
  async compare(userId: string, from?: string, to?: string) {
    const all = await this.list(userId);
    if (all.length === 0) return { from: null, to: null, rows: [] };
    const a = from ? all.find((r) => r.id === from) : all[0];
    const b = to ? all.find((r) => r.id === to) : all[all.length - 1];
    const fields = ['waist_cm', 'hip_cm', 'thigh_cm', 'whr'];
    const rows = fields.map((f) => ({
      key: f,
      from: a?.[f] ?? null,
      to: b?.[f] ?? null,
      delta: a && b && a[f] != null && b[f] != null ? Number((Number(b[f]) - Number(a[f])).toFixed(2)) : null,
    }));
    return { from: a, to: b, rows };
  }

  /** 生化/体检报告：仅存储，系统不做任何医疗解读 */
  async addReport(userId: string, dto: any) {
    return this.reports.save(this.reports.create({
      user_id: userId,
      type: dto.type || 'biochem',
      file_key: dto.file_key,
      taken_at: dto.taken_at ? new Date(dto.taken_at) : null,
      note: dto.note,
      visible_to_advisors: dto.visible_to_advisors !== false,
    }));
  }

  async listReports(userId: string) {
    return this.reports.find({ where: { user_id: userId }, order: { created_at: 'DESC' } });
  }
}

@Controller()
export class StageController {
  constructor(private svc: StageService) {}

  @UseGuards(JwtAuthGuard) @Post('me/stages')
  create(@CurrentUserId() uid: string, @Body() dto: any) { return this.svc.create(uid, dto); }

  @UseGuards(JwtAuthGuard) @Get('me/stages')
  list(@CurrentUserId() uid: string) { return this.svc.list(uid); }

  @UseGuards(JwtAuthGuard) @Get('me/stage-compare')
  compare(@CurrentUserId() uid: string, @Query('from') from: string, @Query('to') to: string) {
    return this.svc.compare(uid, from, to);
  }

  @UseGuards(JwtAuthGuard) @Post('me/reports')
  addReport(@CurrentUserId() uid: string, @Body() dto: any) { return this.svc.addReport(uid, dto); }

  @UseGuards(JwtAuthGuard) @Get('me/reports')
  listReports(@CurrentUserId() uid: string) { return this.svc.listReports(uid); }
}

@Module({
  imports: [TypeOrmModule.forFeature([StageRecord, HealthReport])],
  controllers: [StageController],
  providers: [StageService],
})
export class StageModule {}
