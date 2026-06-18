import {
  Module, Controller, Post, Get, Put, Body, Param, Query,
  UseGuards, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MealRecord, MealItem } from '../entities';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';
import { FoodVisionService } from '../services/food-vision.service';

@Injectable()
export class MealService {
  constructor(
    @InjectRepository(MealRecord) private meals: Repository<MealRecord>,
    @InjectRepository(MealItem) private items: Repository<MealItem>,
    private vision: FoodVisionService,
  ) {}

  /** 创建一次餐食打卡（先落库，photo 已传 OSS 得 photo_key） */
  async create(userId: string, dto: any) {
    return this.meals.save(this.meals.create({
      user_id: userId,
      meal_date: dto.meal_date || new Date().toISOString().slice(0, 10),
      meal_type: dto.meal_type || 'lunch',
      photo_key: dto.photo_key,
      photo_kind: dto.photo_kind || 'food',
      ai_status: 'pending',
      note: dto.note,
    }));
  }

  /** 触发 AI 解析（image_url = OSS 短时效签名 URL，由前端/后端取得） */
  async analyze(userId: string, id: string, imageUrl: string) {
    const rec = await this.meals.findOne({ where: { id, user_id: userId } });
    if (!rec) throw new NotFoundException('记录不存在');
    const r = await this.vision.analyze(imageUrl);
    rec.ai_status = r.ai_status;
    rec.ai_raw = r.raw;
    await this.meals.save(rec);
    await this.items.delete({ meal_record_id: id });
    for (const it of r.items) {
      await this.items.save(this.items.create({
        meal_record_id: id, food_name: it.name, portion_text: it.portion,
        kcal: it.kcal_est, source: 'ai',
      }));
    }
    return this.detail(userId, id);
  }

  async detail(userId: string, id: string) {
    const rec = await this.meals.findOne({ where: { id, user_id: userId } });
    if (!rec) throw new NotFoundException('记录不存在');
    const items = await this.items.find({ where: { meal_record_id: id } });
    return { ...rec, items, total_kcal: items.reduce((s, i) => s + (i.kcal || 0), 0) };
  }

  /** 用户修正 AI 识别结果（手改/增删条目） */
  async updateItems(userId: string, id: string, list: any[]) {
    const rec = await this.meals.findOne({ where: { id, user_id: userId } });
    if (!rec) throw new NotFoundException('记录不存在');
    await this.items.delete({ meal_record_id: id });
    for (const it of list || []) {
      await this.items.save(this.items.create({
        meal_record_id: id,
        food_name: it.food_name || it.name,
        portion_text: it.portion_text || it.portion,
        kcal: it.kcal,
        source: 'user',
      }));
    }
    return this.detail(userId, id);
  }

  /** 配料表：OCR 读营养表 → kJ÷4.184=kcal → 按克数算本次摄入 */
  async parseLabel(imageUrl: string, grams: number) {
    const r = await this.vision.analyzeLabel(imageUrl);
    const kcalPer100 = r.energy_kj_per_100g ? Math.round(r.energy_kj_per_100g / 4.184) : null;
    const intake = kcalPer100 && grams ? Math.round((kcalPer100 * grams) / 100) : null;
    return { ...r, kcal_per_100g: kcalPer100, grams: grams || null, intake_kcal: intake };
  }
}

@Controller()
export class MealController {
  constructor(private svc: MealService) {}

  @UseGuards(JwtAuthGuard) @Post('meals')
  create(@CurrentUserId() uid: string, @Body() dto: any) { return this.svc.create(uid, dto); }

  @UseGuards(JwtAuthGuard) @Post('meals/:id/analyze')
  analyze(@CurrentUserId() uid: string, @Param('id') id: string, @Body('image_url') url: string) {
    return this.svc.analyze(uid, id, url);
  }

  @UseGuards(JwtAuthGuard) @Get('meals/:id')
  detail(@CurrentUserId() uid: string, @Param('id') id: string) { return this.svc.detail(uid, id); }

  @UseGuards(JwtAuthGuard) @Put('meals/:id/items')
  updateItems(@CurrentUserId() uid: string, @Param('id') id: string, @Body('items') items: any[]) {
    return this.svc.updateItems(uid, id, items);
  }

  @UseGuards(JwtAuthGuard) @Post('labels/parse')
  parseLabel(@Body('image_url') url: string, @Body('grams') grams: number) {
    return this.svc.parseLabel(url, grams);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([MealRecord, MealItem])],
  controllers: [MealController],
  providers: [MealService, FoodVisionService],
})
export class MealModule {}
