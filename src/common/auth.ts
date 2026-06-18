import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException, createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

function extractToken(req: any): string {
  return (req.headers?.authorization || '').replace('Bearer ', '').trim();
}

/** 用户端鉴权：校验 user JWT，把 userId 挂到 req */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('未登录');
    try {
      const p: any = this.jwt.verify(token);
      if (p.type !== 'user') throw new Error();
      req.userId = p.sub;
      return true;
    } catch {
      throw new UnauthorizedException('登录已过期，请重新进入');
    }
  }
}

/** 后台鉴权：校验 admin JWT，把 admin{id,role} 挂到 req */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('未登录');
    try {
      const p: any = this.jwt.verify(token);
      if (p.type !== 'admin') throw new Error();
      req.admin = { id: p.sub, role: p.role };
      return true;
    } catch {
      throw new UnauthorizedException('登录已过期');
    }
  }
}

export const CurrentUserId = createParamDecorator(
  (_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().userId,
);
export const CurrentAdmin = createParamDecorator(
  (_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().admin,
);
