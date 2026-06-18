import {
  Module, Controller, Get, Query, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeightRecord, MealRecord, MealItem, DailyLog, ServiceNote } from '../entities';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';
import { sanitizeText } from '../common/compliance';

function dayRange(date: string) {
  return { start: new Date(date + 'T00:00:00'), end: new Date(date + 'T23:59:59') };
}
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class SummaryService {
  constructor(
    @InjectRepository(WeightRecord) private weights: Repository<WeightRecord>,
    @InjectRepository(MealRecord) private meals: Repository<MealRecord>,
    @InjectRepository(MealItem) private items: Repository<MealItem>,
    @InjectRepository(DailyLog) private dailies: Repository<DailyLog>,
    @InjectRepository(ServiceNote) private notes: Repository<ServiceNote>,
  ) {}

  private async morningWeight(userId: string, date: string) {
    const { start, end } = dayRange(date);
    return this.weights.createQueryBuilder('w')
      .where('w.user_id = :u', { u: userId })
      .andWhere('w.measured_at BETWEEN :s AND :e', { s: start, e: end })
      .orderBy('w.is_morning', 'DESC').addOrderBy('w.measured_at', 'DESC')
      .getOne();
  }

  private async dayIntake(userId: string, date: string) {
    const meals = await this.meals.find({ where: { user_id: userId, meal_date: date } });
    let total = 0;
    const ids = meals.map((m) => m.id);
    if (ids.length) {
      const items = await this.items.createQueryBuilder('i')
        .where('i.meal_record_id IN (:...ids)', { ids }).getMany();
      total = items.reduce((s, i) => s + (i.kcal || 0), 0);
    }
    return { meals_count: meals.length, total_kcal: total };
  }

  /** 当日汇总（首页/汇总页/服务视图同源） */
  async daily(userId: string, date?: string) {
    date = date || today();
    const w = await this.morningWeight(userId, date);
    const intake = await this.dayIntake(userId, date);
    const dl = await this.dailies.findOne({ where: { user_id: userId, log_date: date } });
    const note = await this.notes.findOne({
      where: { owner_user_id: userId, ref_date: date, visibility: 'visible_to_owner' },
      order: { created_at: 'DESC' },
    });
    return {
      date,
      morning_weight: w?.weight_kg ?? null,
      body_fat_pct: w?.body_fat_pct ?? null,
      total_kcal: intake.total_kcal,
      meals_count: intake.meals_count,
      water_cups: dl?.water_cups ?? 0,
      water_ml: (dl?.water_cups ?? 0) * (dl?.water_cup_ml ?? 250),
      bowel_count: dl?.bowel_count ?? 0,
      bowel_status: dl?.bowel_status ?? null,
      sleep_hours: dl?.sleep_hours ?? null,
      teacher_note: note ? sanitizeText(note.content) : null,
    };
  }

  async summary(userId: string, range = '7d') {
    const days = parseInt(range, 10) || 7;
    const from = new Date(Date.now() - days * 86400000);
    const ws = await this.weights.createQueryBuilder('w')
      .where('w.user_id = :u', { u: userId })
      .andWhere('w.measured_at >= :f', { f: from })
      .orderBy('w.measured_at', 'ASC').getMany();
    return { range, weights: ws.map((w) => ({ date: w.measured_at, kg: w.weight_kg })) };
  }

  /** 全维度体成分对比（数据对比页） */
  async weightCompare(userId: string, from: string, to: string) {
    const pick = async (date: string) => {
      const { start, end } = dayRange(date);
      return this.weights.createQueryBuilder('w')
        .where('w.user_id = :u', { u: userId })
        .andWhere('w.measured_at BETWEEN :s AND :e', { s: start, e: end })
        .orderBy('w.is_morning', 'DESC').getOne();
    };
    const a = await pick(from);
    const b = await pick(to);
    const fields = ['weight_kg', 'bmi', 'body_fat_pct', 'fat_kg', 'visceral_fat_level',
      'water_pct', 'skeletal_muscle_kg', 'muscle_kg', 'bmr_kcal', 'protein_pct'];
    const rows = fields.map((f) => ({
      key: f,
      from: a?.[f] ?? null,
      to: b?.[f] ?? null,
      delta: a && b && a[f] != null && b[f] != null ? Number((Number(b[f]) - Number(a[f])).toFixed(1)) : null,
    }));
    return { from, to, rows };
  }

  /** 全维度日报 + 规则版小结（服务端生成，保证口径合规，非 AI 医疗判断） */
  async dailyReport(userId: string, date?: string) {
    const d = await this.daily(userId, date);
    const parts: string[] = [];
    if (d.morning_weight) parts.push(`今晨体重 ${d.morning_weight}kg`);
    if (d.total_kcal) parts.push(`今日记录摄入约 ${d.total_kcal}kcal、${d.meals_count} 餐`);
    if (d.water_ml) parts.push(`饮水 ${d.water_cups} 杯（${d.water_ml}ml）`);
    if (d.bowel_count) parts.push(`排便 ${d.bowel_count} 次`);
    if (d.sleep_hours) parts.push(`睡眠 ${d.sleep_hours} 小时`);
    const text = (parts.length ? parts.join('；') + '。' : '今天还没有记录。') + '记录本身就是改变的开始，继续保持节奏。';
    return { ...d, report: sanitizeText(text) };
  }

  /** 分享卡数据（转发微信群） */
  async shareCard(userId: string, date?: string) {
    const d = await this.daily(userId, date);
    return {
      date: d.date,
      weight: d.morning_weight,
      intake: d.total_kcal,
      water_cups: d.water_cups,
      slogan: '吃饱也能轻 · 吃对样子好 · 自律成良习',
    };
  }
}

@Controller()
export class SummaryController {
  constructor(private svc: SummaryService) {}

  @UseGuards(JwtAuthGuard) @Get('me/daily')
  daily(@CurrentUserId() uid: string, @Query('date') date: string) { return this.svc.daily(uid, date); }

  @UseGuards(JwtAuthGuard) @Get('me/summary')
  summary(@CurrentUserId() uid: string, @Query('range') range: string) { return this.svc.summary(uid, range); }

  @UseGuards(JwtAuthGuard) @Get('me/weight-compare')
  compare(@CurrentUserId() uid: string, @Query('from') from: string, @Query('to') to: string) {
    return this.svc.weightCompare(uid, from, to);
  }

  @UseGuards(JwtAuthGuard) @Get('me/daily-report')
  report(@CurrentUserId() uid: string, @Query('date') date: string) { return this.svc.dailyReport(uid, date); }

  @UseGuards(JwtAuthGuard) @Get('me/share-card')
  card(@CurrentUserId() uid: string, @Query('date') date: string) { return this.svc.shareCard(uid, date); }
}

@Module({
  imports: [TypeOrmModule.forFeature([WeightRecord, MealRecord, MealItem, DailyLog, ServiceNote])],
  controllers: [SummaryController],
  providers: [SummaryService],
  exports: [SummaryService], // 服务视图镜像用户同源数据，复用此服务
})
export class SummaryModule {}
