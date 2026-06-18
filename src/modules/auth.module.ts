import {
  Module, Controller, Post, Get, Put, Delete,
  Body, Param, UseGuards, Injectable,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User, ConsentRecord } from '../entities';
import { WechatService } from '../services/wechat.service';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(ConsentRecord) private consents: Repository<ConsentRecord>,
    private wechat: WechatService,
    private jwt: JwtService,
  ) {}

  /** 小程序 wx.login 的 code → openid → 找/建用户 → 发 JWT */
  async login(code: string) {
    const { openid, unionid } = await this.wechat.code2Session(code);
    let user = await this.users.findOne({ where: { openid } });
    if (!user) {
      user = await this.users.save(this.users.create({ openid, unionid, status: 'active' }));
    }
    const token = this.jwt.sign({ sub: user.id, type: 'user' });
    return {
      token,
      user: { id: user.id, nickname: user.nickname, hasProfile: !!user.height_cm },
    };
  }

  async getProfile(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) return null;
    return {
      id: u.id, nickname: u.nickname, avatar: u.avatar, gender: u.gender,
      height_cm: u.height_cm, age: u.age, target_weight_kg: u.target_weight_kg, phone: u.phone,
    };
  }

  /** 轻建档：身高/年龄/性别/目标体重/昵称 */
  async updateProfile(userId: string, dto: any) {
    await this.users.update(userId, {
      nickname: dto.nickname, avatar: dto.avatar, gender: dto.gender,
      height_cm: dto.height_cm, age: dto.age, target_weight_kg: dto.target_weight_kg,
    });
    return this.getProfile(userId);
  }

  async grantConsent(userId: string, type: string) {
    await this.consents.save(this.consents.create({ user_id: userId, type, version: 'v1' }));
    return { ok: true };
  }

  /** 撤回健康授权（留痕） */
  async revokeConsent(userId: string, type: string) {
    await this.consents.update(
      { user_id: userId, type, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
    return { ok: true };
  }
}

@Controller()
export class AuthController {
  constructor(private svc: AuthService) {}

  @Post('auth/login')
  login(@Body('code') code: string) { return this.svc.login(code); }

  @UseGuards(JwtAuthGuard) @Get('me/profile')
  profile(@CurrentUserId() uid: string) { return this.svc.getProfile(uid); }

  @UseGuards(JwtAuthGuard) @Put('me/profile')
  update(@CurrentUserId() uid: string, @Body() dto: any) { return this.svc.updateProfile(uid, dto); }

  @UseGuards(JwtAuthGuard) @Post('me/consents')
  consent(@CurrentUserId() uid: string, @Body('type') type: string) { return this.svc.grantConsent(uid, type); }

  @UseGuards(JwtAuthGuard) @Delete('me/consents/:type')
  revoke(@CurrentUserId() uid: string, @Param('type') type: string) { return this.svc.revokeConsent(uid, type); }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, ConsentRecord])],
  controllers: [AuthController],
  providers: [AuthService, WechatService],
})
export class AuthModule {}
