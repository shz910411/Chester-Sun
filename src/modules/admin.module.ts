import {
  Module, Controller, Post, Get, Put, Body, Param, Res,
  UseGuards, Injectable, UnauthorizedException, OnApplicationBootstrap, Logger,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AdminAccount, User, AdvisorChangeLog } from '../entities';
import { AdminGuard, CurrentAdmin } from '../common/auth';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private log = new Logger('Admin');
  constructor(
    @InjectRepository(AdminAccount) private admins: Repository<AdminAccount>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(AdvisorChangeLog) private changes: Repository<AdvisorChangeLog>,
    private jwt: JwtService,
  ) {}

  /** 首次启动：若无任何后台账号，用 env 的 SEED_ADMIN_* 自动建一个 admin */
  async onApplicationBootstrap() {
    const count = await this.admins.count();
    if (count === 0 && process.env.SEED_ADMIN_PASSWORD) {
      const username = process.env.SEED_ADMIN_USERNAME || 'admin';
      await this.admins.save(this.admins.create({
        username,
        password_hash: bcrypt.hashSync(process.env.SEED_ADMIN_PASSWORD, 10),
        role: 'admin',
      }));
      this.log.log(`已创建初始后台管理员: ${username}`);
    }
  }

  async login(username: string, password: string) {
    const a = await this.admins.findOne({ where: { username, active: true } });
    if (!a || !bcrypt.compareSync(password, a.password_hash)) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const token = this.jwt.sign({ sub: a.id, type: 'admin', role: a.role });
    return { token, role: a.role };
  }

  async listUsers() {
    const us = await this.users.find({ order: { created_at: 'DESC' }, take: 500 });
    return us.map((u) => ({
      id: u.id, nickname: u.nickname, phone: u.phone, gender: u.gender,
      height_cm: u.height_cm, target_weight_kg: u.target_weight_kg,
      advisor_id: u.advisor_id, group_tag: u.group_tag, status: u.status, created_at: u.created_at,
    }));
  }

  getUser(id: string) { return this.users.findOne({ where: { id } }); }

  /** 改归属（指派服务老师）+ 留痕 */
  async setAdvisor(adminId: string, userId: string, advisorId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    const old = u?.advisor_id;
    await this.users.update(userId, { advisor_id: advisorId });
    await this.changes.save(this.changes.create({
      user_id: userId, old_advisor_id: old, new_advisor_id: advisorId, changed_by: adminId,
    }));
    return { ok: true };
  }

  /** 导出用户 CSV（明细长表口径的简版；图片走签名 URL 不内嵌） */
  async exportCsv(): Promise<string> {
    const us = await this.users.find({ order: { created_at: 'DESC' } });
    const header = 'id,昵称,手机号,性别,身高cm,目标体重kg,归属老师,分组,状态,注册时间';
    const lines = us.map((u) => [
      u.id, u.nickname || '', u.phone || '', u.gender || '', u.height_cm || '',
      u.target_weight_kg || '', u.advisor_id || '', u.group_tag || '', u.status,
      u.created_at ? u.created_at.toISOString() : '',
    ].join(','));
    return [header, ...lines].join('\n');
  }
}

@Controller('admin')
export class AdminController {
  constructor(private svc: AdminService) {}

  @Post('login')
  login(@Body('username') u: string, @Body('password') p: string) { return this.svc.login(u, p); }

  @UseGuards(AdminGuard) @Get('users')
  users() { return this.svc.listUsers(); }

  @UseGuards(AdminGuard) @Get('users/:id')
  user(@Param('id') id: string) { return this.svc.getUser(id); }

  @UseGuards(AdminGuard) @Put('users/:id/advisor')
  setAdvisor(@CurrentAdmin() admin: any, @Param('id') id: string, @Body('advisor_id') aid: string) {
    return this.svc.setAdvisor(admin.id, id, aid);
  }

  @UseGuards(AdminGuard) @Get('export.csv')
  async export(@Res() res: any) {
    const csv = await this.svc.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="maisimei-users.csv"');
    res.send('﻿' + csv); // BOM 防 Excel 中文乱码
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AdminAccount, User, AdvisorChangeLog])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
