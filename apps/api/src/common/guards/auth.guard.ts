import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODE, USER_STATUS } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../../modules/auth/session.service';
import { IS_PUBLIC_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Xác thực mọi request bằng session cookie — ADR 0002.
 *
 * Guard này được đăng ký GLOBAL: mặc định mọi endpoint đều cần đăng nhập, muốn mở thì
 * phải gắn `@Public()`. Chiều ngược lại (mặc định mở, nhớ khoá từng cái) là cách quên
 * một endpoint là lộ dữ liệu.
 *
 * Cố ý KHÔNG đọc `Authorization: Bearer` ở Phase 0: chỉ có web client, và mở thêm một
 * đường vào nghĩa là thêm một đường phải bảo vệ.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    const token = (req.cookies as Record<string, string> | undefined)?.[this.sessions.cookieName];

    if (!token) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Chưa đăng nhập',
      });
    }

    const payload = this.sessions.verify(token);

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        email: true,
        phoneVerifiedAt: true,
        status: true,
      },
    });

    // Token còn hạn nhưng user đã bị khoá/xoá — phải chặn ngay, không đợi token hết hạn.
    if (!user || user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Tài khoản không còn hiệu lực',
      });
    }

    req.user = {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      phoneVerified: user.phoneVerifiedAt !== null,
      sessionId: payload.sid,
    };

    return true;
  }
}
