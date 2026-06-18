import {
  Module, Controller, Get, Put, Post, Body, Param, Query,
  UseGuards, Injectable, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataShare, User, ServiceNote, ServiceDayMark } from '../entities';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';
import { SummaryModule, SummaryService } from './summary.module';

/**
 * 服务视图 —— "我服务的人"。合规红线：
 *   1) 平等列表，无层级（只列直接授权我的人，不传递）
 *   2) 行级权限：每个请求校验 active 共享，否则 403
 *   3) 手机号脱敏；只读 + 备注，不能改原始记录、无导出
 *   4) 镜像原则：详情与用户本人同源（复用 SummaryService）
 */
@Injectable()
export class ServiceAccessService {
  constructor(
    @InjectRepository(DataShare) private shares: Repository<DataShare>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(ServiceNote) private notes: Repository<ServiceNote>,
    @InjectRepository(ServiceDayMark) private marks: Repository<ServiceDayMark>,
    private summary: SummaryService,
  ) {}

  private maskPhone(p?: string) {
    return p ? p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null;
  }

  /** 行级权限：校验 viewer 对 owner 有 active 共享 */
  private async assertAccess(viewerId: string, ownerId: string) {
    const s = await this.shares.findOne({
      where: { owner_user_id: ownerId, viewer_user_id: viewerId, status: 'active' },
    });
    if (!s) throw new ForbiddenException('没有该用户的共享权限');
  }

  /** 我服务的人（平等列表）：概要状态，不在列表泄露敏感数值 */
  async owners(viewerId: string) {
    const list = await this.shares.find({ where: { viewer_user_id: viewerId, status: 'active' } });
    const out = [];
    for (const s of list) {
      const u = await this.users.findOne({ where: { id: s.owner_user_id } });
      const d = await this.summary.daily(s.owner_user_id);
      out.push({
        owner_id: s.owner_user_id,
        nickname: u?.nickname || '伙伴',
        phone: this.maskPhone(u?.phone),
        today: { weighed: d.morning_weight != null, meals: d.meals_count, intake_kcal: d.total_kcal },
      });
    }
    return out;
  }

  /** 某人当日全维度（镜像用户本人，需 active 共享） */
  async dailyMirror(viewerId: string, ownerId: string, date?: string) {
    await this.assertAccess(viewerId, ownerId);
    return this.summary.dailyReport(ownerId, date);
  }

  /** 逐日归档/关注标记 */
  async dayMark(viewerId: string, ownerId: string, date: string, mark: string) {
    await this.assertAccess(viewerId, ownerId);
    let m = await this.marks.findOne({
      where: { owner_user_id: ownerId, viewer_user_id: viewerId, mark_date: date },
    });
    if (!m) m = this.marks.create({ owner_user_id: ownerId, viewer_user_id: viewerId, mark_date: date });
    m.mark = mark;
    return this.marks.save(m);
  }

  /** 服务者备注（默认「老师的话」用户可见，不改用户原始记录） */
  async addNote(viewerId: string, ownerId: string, dto: any) {
    await this.assertAccess(viewerId, ownerId);
    return this.notes.save(this.notes.create({
      owner_user_id: ownerId,
      author_user_id: viewerId,
      ref_date: dto.ref_date,
      content: dto.content,
      visibility: dto.visibility || 'visible_to_owner',
    }));
  }
}

@Controller('service')
export class ServiceController {
  constructor(private svc: ServiceAccessService) {}

  @UseGuards(JwtAuthGuard) @Get('owners')
  owners(@CurrentUserId() uid: string) { return this.svc.owners(uid); }

  @UseGuards(JwtAuthGuard) @Get('owners/:id/daily')
  daily(@CurrentUserId() uid: string, @Param('id') id: string, @Query('date') date: string) {
    return this.svc.dailyMirror(uid, id, date);
  }

  @UseGuards(JwtAuthGuard) @Put('owners/:id/day-mark')
  dayMark(@CurrentUserId() uid: string, @Param('id') id: string, @Body('date') date: string, @Body('mark') mark: string) {
    return this.svc.dayMark(uid, id, date, mark);
  }

  @UseGuards(JwtAuthGuard) @Post('owners/:id/notes')
  note(@CurrentUserId() uid: string, @Param('id') id: string, @Body() dto: any) {
    return this.svc.addNote(uid, id, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([DataShare, User, ServiceNote, ServiceDayMark]), SummaryModule],
  controllers: [ServiceController],
  providers: [ServiceAccessService],
})
export class ServiceModule {}
