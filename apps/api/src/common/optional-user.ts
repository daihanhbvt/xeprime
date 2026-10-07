import { USER_STATUS, type AccountRealm } from '@xeprime/types';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import type { SessionService } from '../modules/auth/session.service';
import type { RequestRealmService } from '../modules/auth/request-realm.service';
import { NativeSessionService } from '../modules/auth/native-session.service';

/** Những thứ cần để đọc một phiên tuỳ chọn — gom lại cho chữ ký nơi gọi khỏi dài. */
export interface OptionalUserDeps {
  sessions: SessionService;
  prisma: PrismaService;
  realms: RequestRealmService;
  /** Thiếu thì chỉ mất nhánh Bearer — không đổi hành vi cookie. */
  nativeSessions?: NativeSessionService;
}

export interface OptionalUser {
  userId: string;
  realm: AccountRealm;
}

/**
 * Người đang đăng nhập (kèm realm) nếu request mang credential hợp lệ và tài khoản còn active;
 * `null` với mọi trường hợp khác.
 *
 * Dùng cho endpoint `@Public()` muốn gắn hành động vào tài khoản khi khách tình cờ đang đăng
 * nhập, nhưng vẫn phục vụ khách vãng lai. Nhận cả hai đường: session cookie (web — ADR 0002) và
 * `Authorization: Bearer` (native — ADR 0017).
 *
 * Khác `AuthGuard` ở đúng một điểm, và là điểm cố ý: ở đây **mọi thất bại đều trả `null`**, kể cả
 * header sai dạng hay hai credential cùng lúc. Guard phải nói cho client biết nó gửi sai; còn đây
 * là bề mặt CÔNG KHAI — làm một khách vãng lai nhận 401 vì cookie cũ hỏng là làm hỏng đúng luồng
 * mà endpoint này tồn tại để phục vụ.
 *
 * Realm theo cùng luật với `AuthGuard` (ADR 0053 điều 4): cookie chỉ đọc đúng tên của realm web
 * do proxy quyết; Bearer lấy realm của phiên, và khi đi qua một site web thì realm đó phải trùng
 * realm của site; tài khoản lệch realm coi như không có phiên.
 */
export async function resolveOptionalUser(
  req: Request,
  deps: OptionalUserDeps,
): Promise<OptionalUser | null> {
  const { sessions, prisma, realms, nativeSessions } = deps;
  const webRealm = realms.webRealmOf(req);
  const cookieToken = webRealm
    ? (req.cookies as Record<string, string> | undefined)?.[sessions.cookieName(webRealm)]
    : undefined;
  const authHeader = req.headers.authorization;

  // Hai credential cùng lúc: không đoán bên nào (cùng lý do với AuthGuard), coi như khách vãng lai.
  if (cookieToken && authHeader) return null;

  const claim = authHeader
    ? bearerClaim(authHeader, nativeSessions)
    : cookieClaim(cookieToken, sessions, webRealm);
  if (!claim) return null;

  const user = await prisma.user.findFirst({
    where: { id: claim.userId, status: USER_STATUS.ACTIVE, deletedAt: null },
    select: { id: true, realm: true },
  });
  if (!user) return null;

  /*
   * Với Bearer còn phải hỏi phiên có bị thu hồi chưa — và cùng lượt đó lấy realm của phiên.
   *
   * Không có bước này thì một access token của thiết bị đã đăng xuất vẫn gắn được hành động vào
   * tài khoản đó ở các endpoint công khai — đúng thứ `revoked_at` tồn tại để chặn.
   */
  let realm = claim.realm;
  if (claim.sessionId !== null) {
    if (!nativeSessions) return null;
    realm = await nativeSessions.usableSessionRealm(claim.sessionId, user.id);
  }
  // Qua một site web thì phiên phải thuộc đúng realm của site — cả Bearer (cùng luật AuthGuard).
  if (!realm || user.realm !== realm || (webRealm && realm !== webRealm)) return null;

  return { userId: user.id, realm };
}

/**
 * `userId` của người đang đăng nhập Ở ĐÚNG realm yêu cầu, hoặc `null`. Endpoint của khách (đặt xe,
 * mã khuyến mãi) truyền `customer`: một phiên partner chạm tới đó là người lạ với site khách — họ
 * đi tiếp như khách vãng lai và luồng OTP tìm đúng tài khoản KHÁCH của số điện thoại đó.
 */
export async function resolveOptionalUserId(
  req: Request,
  deps: OptionalUserDeps,
  requiredRealm?: AccountRealm,
): Promise<string | null> {
  const found = await resolveOptionalUser(req, deps);
  if (!found) return null;
  if (requiredRealm && found.realm !== requiredRealm) return null;
  return found.userId;
}

interface OptionalClaim {
  userId: string;
  /** `null` với Bearer — realm đọc từ phiên ở bước sau. */
  realm: AccountRealm | null;
  /** `null` với cookie: phiên web không có bảng để tra (ADR 0002). */
  sessionId: string | null;
}

function cookieClaim(
  token: string | undefined,
  sessions: SessionService,
  realm: AccountRealm | null,
): OptionalClaim | null {
  if (!token || !realm) return null;
  try {
    return { userId: sessions.verify(token).sub, realm, sessionId: null };
  } catch {
    return null;
  }
}

function bearerClaim(
  authHeader: string,
  nativeSessions: NativeSessionService | undefined,
): OptionalClaim | null {
  if (!nativeSessions) return null;
  try {
    const token = NativeSessionService.parseBearer(authHeader);
    if (!token) return null;
    const payload = nativeSessions.verifyAccessToken(token);
    return { userId: payload.sub, realm: null, sessionId: payload.sid };
  } catch {
    return null;
  }
}
