import { USER_STATUS } from '@xeprime/types';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import type { SessionService } from '../modules/auth/session.service';

/**
 * userId nếu request kèm cookie session hợp lệ và user còn active; null với mọi trường hợp khác
 * (không cookie / token hết hạn / user bị khoá). Dùng cho endpoint `@Public()` muốn gắn hành
 * động vào tài khoản khi khách tình cờ đang đăng nhập, nhưng vẫn phục vụ khách vãng lai.
 */
export async function resolveOptionalUserId(
  req: Request,
  sessions: SessionService,
  prisma: PrismaService,
): Promise<string | null> {
  const token = (req.cookies as Record<string, string> | undefined)?.[sessions.cookieName];
  if (!token) return null;

  let sub: string;
  try {
    sub = sessions.verify(token).sub;
  } catch {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { id: sub, status: USER_STATUS.ACTIVE, deletedAt: null },
    select: { id: true },
  });
  return user?.id ?? null;
}
