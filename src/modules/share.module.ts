import {
  Module, Controller, Post, Get, Delete, Body, Param,
  UseGuards, Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { DataShare, ShareInvite, User } from '../entities';
import { JwtAuthGuard, CurrentUserId } from '../common/auth';

/**
 * 数据共享 = 加好友逻辑：
 *   owner 发邀请码 → viewer 领取（claim）→ 建立 active 共享 → 任一方可随时移除。
 * 平等、点对点、不传递（A 共享给 B，不会让 B 的上级看到 A）——天然避开传销层级穿透。
 */
@Injectable()
export class ShareService {
  constructor(
    @InjectRepository(DataShare) private shares: Repository<DataShare>,
    @InjectRepository(ShareInvite) private invites: Repository<ShareInvite>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  /** owner 生成邀请码（24h 单次有效）——"把我的数据共享出去" */
  async invite(ownerId: string) {
    const code = randomBytes(4).toString('hex'); // 8 位十六进制
    const expires = new Date(Date.now() + 24 * 3600 * 1000);
    await this.invites.save(this.invites.create({
      code, owner_user_id: ownerId, status: 'pending', expires_at: expires,
    }));
    return { code, expires_at: expires };
  }

  /** viewer 用邀请码领取 → 建立 active 共享（=加好友通过） */
  async claim(viewerId: string, code: string) {
    const inv = await this.invites.findOne({ where: { code, status: 'pending' } });
    if (!inv) throw new BadRequestException('邀请码无效或已被使用');
    if (inv.expires_at < new Date()) {
      inv.status = 'expired';
      await this.invites.save(inv);
      throw new BadRequestException('邀请码已过期');
    }
    if (inv.owner_user_id === viewerId) throw new BadRequestException('不能领取自己的邀请');

    let share = await this.shares.findOne({
      where: { owner_user_id: inv.owner_user_id, viewer_user_id: viewerId, status: 'active' },
    });
    if (!share) {
      share = await this.shares.save(this.shares.create({
        owner_user_id: inv.owner_user_id, viewer_user_id: viewerId,
        status: 'active', source: 'user_invite', invite_code: code,
      }));
    }
    inv.status = 'claimed';
    inv.claimed_by = viewerId;
    await this.invites.save(inv);
    const owner = await this.users.findOne({ where: { id: inv.owner_user_id } });
    return { ok: true, owner: { id: owner?.id, nickname: owner?.nickname || '伙伴' } };
  }

  /** 我把数据共享给了谁（owner=我 的 active）——"数据共享"页 */
  async mySharedTo(ownerId: string) {
    const list = await this.shares.find({
      where: { owner_user_id: ownerId, status: 'active' }, order: { created_at: 'DESC' },
    });
    const out = [];
    for (const s of list) {
      const v = await this.users.findOne({ where: { id: s.viewer_user_id } });
      out.push({
        id: s.id, viewer_id: s.viewer_user_id, nickname: v?.nickname || '伙伴',
        source: s.source, created_at: s.created_at,
      });
    }
    return out;
  }

  /** 移除共享（owner 或 viewer 任一方，即时生效，留痕） */
  async revoke(userId: string, shareId: string) {
    const s = await this.shares.findOne({ where: { id: shareId } });
    if (!s) throw new NotFoundException('共享不存在');
    if (s.owner_user_id !== userId && s.viewer_user_id !== userId) {
      throw new BadRequestException('无权操作');
    }
    s.status = 'revoked';
    s.revoked_at = new Date();
    await this.shares.save(s);
    return { ok: true };
  }
}

@Controller()
export class ShareController {
  constructor(private svc: ShareService) {}

  @UseGuards(JwtAuthGuard) @Post('shares/invite')
  invite(@CurrentUserId() uid: string) { return this.svc.invite(uid); }

  @UseGuards(JwtAuthGuard) @Post('shares/claim')
  claim(@CurrentUserId() uid: string, @Body('code') code: string) { return this.svc.claim(uid, code); }

  @UseGuards(JwtAuthGuard) @Get('me/shares')
  mine(@CurrentUserId() uid: string) { return this.svc.mySharedTo(uid); }

  @UseGuards(JwtAuthGuard) @Delete('shares/:id')
  revoke(@CurrentUserId() uid: string, @Param('id') id: string) { return this.svc.revoke(uid, id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([DataShare, ShareInvite, User])],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
