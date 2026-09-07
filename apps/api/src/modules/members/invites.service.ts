import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  INVITE_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { maskEmail } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import {
  CreateInviteDto,
  CreateInviteResultDto,
  INVITE_DEFAULT_LIMIT,
  INVITE_MAX_LIMIT,
  InviteAnswerDto,
  InviteDto,
  InviteListQueryDto,
  InvitePreviewDto,
} from './dto/invite.dto';

/**
 * Thư mời vào gian hàng — thay cho việc thêm thẳng một tài khoản vào tenant.
 *
 * ## Vì sao tồn tại
 *
 * Trước 03/09/2026, `POST /members` nhận một email và LẬP TỨC tạo `tenant_memberships` ở trạng
 * thái `active`. Người bị thêm không được hỏi, không được báo, và lần sau đăng nhập thì thấy
 * mình là nhân viên của một gian hàng lạ — với đúng bộ quyền mà người thêm đã chọn cho họ.
 * Bảng `tenant_invites` đã có sẵn từ Phase 0 cho đúng việc này nhưng chưa dòng code nào dùng.
 *
 * ## Ba ràng buộc của token
 *
 *  1. **Chỉ lưu SHA-256**, không bao giờ lưu token thô — cùng kỷ luật với `password_reset_tokens`
 *     và với refresh token native (ADR 0017). Đọc được database không đồng nghĩa với chiếm được
 *     một chỗ trong gian hàng.
 *  2. **Có hạn.** Một lời mời sống mãi là một cánh cửa mở mãi.
 *  3. **Gắn với ĐÚNG email được mời.** Link đi qua hộp thư và bị chuyển tiếp là chuyện thường;
 *     "ai cầm link thì vào được" biến một email chuyển nhầm thành một tài khoản lạ trong gian hàng.
 */

/** 7 ngày — đủ cho một người bận qua một kỳ nghỉ, không đủ để thành một cánh cửa bỏ quên. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SELECT = {
  id: true,
  email: true,
  roleKey: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  creator: { select: { displayName: true } },
} satisfies Prisma.TenantInviteSelect;

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ── Phía gian hàng ────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    query: InviteListQueryDto,
  ): Promise<{ data: InviteDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, INVITE_DEFAULT_LIMIT, INVITE_MAX_LIMIT);

    const where: Prisma.TenantInviteWhereInput = {
      tenantId,
      // Không lọc gì = việc CẦN THEO DÕI, tức lời mời còn đang chờ. Lịch sử đầy đủ vẫn lấy được
      // bằng `?status=`, nhưng nó không phải thứ đáng chiếm màn hình mặc định.
      ...(query.status ? { status: query.status } : { status: INVITE_STATUS.PENDING }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenantInvite.count({ where }),
      this.prisma.tenantInvite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: SELECT,
      }),
    ]);

    return { data: rows.map(toDto), meta: paginationMeta(paging, total) };
  }

  /**
   * Gửi một lời mời.
   *
   * Không tiết lộ email đã có tài khoản hay chưa: cùng một phản hồi cho cả hai, vì endpoint này
   * chỉ cần quyền `members.invite` của MỘT gian hàng bất kỳ, và một danh sách email để dò là
   * thứ ai cũng có.
   */
  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateInviteDto,
  ): Promise<CreateInviteResultDto> {
    if (dto.roleKey === TENANT_ROLE.SHOP_OWNER) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể mời ai đó làm chủ gian hàng',
      });
    }

    const email = normalizeEmail(dto.email);

    // Người đã ở trong gian hàng thì đổi vai trò, không mời lại — mời lại sinh một lời mời
    // không bao giờ nhận được và một dòng rác trong danh sách.
    const existingMember = await this.prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        status: { not: MEMBERSHIP_STATUS.REMOVED },
        // `mode: 'insensitive'` chứ không so bằng chuỗi: không ràng buộc nào ép `users.email`
        // phải là chữ thường (đăng ký đi bằng SĐT; email đến từ social login hoặc nhập tay).
        // So khớp phân biệt hoa/thường ở đây sẽ bỏ sót một thành viên đang có và sinh ra một
        // lời mời không bao giờ nhận được — `accept` sẽ chặn, nhưng sau khi đã tốn một email.
        user: { email: { equals: email, mode: 'insensitive' } },
      },
      select: { userId: true },
    });
    if (existingMember) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVITE_ALREADY_MEMBER,
        message: 'Người này đã là thành viên của gian hàng',
      });
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const row = await this.prisma.$transaction(async (tx) => {
      /*
       * Lời mời đang chờ trước đó cho cùng email BỊ THU HỒI — đúng khuôn `requestPasswordReset`:
       * gửi lại nghĩa là link cũ hết giá trị.
       *
       * Đây cũng là chỗ thay cho một unique index bộ phận `(tenant_id, email) WHERE pending`:
       * hai người cùng bấm mời một lúc thì người sau thu hồi lời mời của người trước, và kết quả
       * vẫn là đúng MỘT link còn sống. Không có tiền ở đây nên không cần tới ràng buộc DB
       * (CLAUDE.md mục 5 nói về sổ tiền), nhưng vẫn không được để hai link cùng sống.
       */
      await tx.tenantInvite.updateMany({
        where: { tenantId, email, status: INVITE_STATUS.PENDING },
        data: { status: INVITE_STATUS.REVOKED },
      });

      const created = await tx.tenantInvite.create({
        data: {
          id: newId(),
          tenantId,
          email,
          roleKey: dto.roleKey,
          tokenHash: hashToken(token),
          status: INVITE_STATUS.PENDING,
          expiresAt,
          createdBy: actorUserId,
        },
        select: SELECT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'member.invite',
          targetType: 'tenant_invite',
          targetId: created.id,
          // Email là định danh của lời mời nên phải ghi; token thì KHÔNG bao giờ (ADR 0017 —
          // audit là nơi nhiều người đọc được hơn database).
          after: { email, roleKey: dto.roleKey },
        },
        tx,
      );

      return created;
    });

    // Gửi mail NGOÀI transaction: SMTP chậm và có thể lỗi, và một transaction giữ mở suốt thời
    // gian đó khoá hàng lâu hơn cần thiết.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });

    /*
     * SMTP hỏng KHÔNG được làm hỏng cả thao tác.
     *
     * Lời mời đã nằm trong database ở dòng trên và đã hiện ở bảng "Lời mời đang chờ". Để lỗi
     * gửi thư ném lên là biến một việc ĐÃ XONG MỘT NỬA thành HTTP 500 — người dùng thấy "Máy chủ
     * gặp sự cố", bấm lại, và mỗi lần bấm lại thu hồi lời mời cũ rồi tạo lời mời mới. Đó đúng là
     * chuyện đã xảy ra trên staging ngày 04/09/2026 khi SMTP thật vừa được bật.
     *
     * Nhưng cũng KHÔNG im lặng nuốt lỗi: `emailSent = false` đi thẳng lên giao diện để người gửi
     * biết mà bấm Gửi lại, thay vì ngồi chờ một lá thư không bao giờ tới. Nói dối rằng đã gửi
     * còn tệ hơn báo lỗi.
     */
    let emailSent = true;
    try {
      await this.email.sendTenantInvite(email, tenant.name, this.inviteUrl(token), expiresAt);
    } catch (error) {
      emailSent = false;
      // Địa chỉ nhận đã che, và KHÔNG log link/token — log là nơi nhiều người đọc được hơn DB.
      this.logger.error(
        `Không gửi được thư mời tới ${maskEmail(email)}: ${error instanceof Error ? error.message : 'lỗi không rõ'}`,
      );
    }

    return { ...toDto(row), emailSent };
  }

  async revoke(tenantId: string, actorUserId: string, inviteId: string): Promise<InviteDto> {
    const current = await this.prisma.tenantInvite.findFirst({
      where: { id: inviteId, tenantId },
      select: { id: true, status: true, email: true },
    });
    if (!current) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy lời mời',
      });
    }
    if (current.status !== INVITE_STATUS.PENDING) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Lời mời này không còn ở trạng thái chờ',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantInvite.update({
        where: { id: inviteId },
        data: { status: INVITE_STATUS.REVOKED },
        select: SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'member.invite_revoke',
          targetType: 'tenant_invite',
          targetId: inviteId,
          before: { status: current.status, email: current.email },
          after: { status: INVITE_STATUS.REVOKED },
        },
        tx,
      );
      return toDto(updated);
    });
  }

  // ── Phía người được mời ───────────────────────────────────────────────────

  /** Xem trước — KHÔNG cần đăng nhập. Xem `InvitePreviewDto` về vì sao. */
  async preview(token: string): Promise<InvitePreviewDto> {
    const invite = await this.loadByToken(token);
    return {
      status: this.effectiveStatus(invite.status, invite.expiresAt),
      tenantName: invite.tenant.name,
      roleKey: invite.roleKey,
      invitedByName: invite.creator.displayName,
      invitedEmailMasked: maskEmail(invite.email) ?? '',
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async accept(token: string, userId: string): Promise<InviteAnswerDto> {
    const invite = await this.loadAnswerable(token, userId);

    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: invite.tenantId, userId } },
      select: { status: true },
    });
    if (membership && membership.status !== MEMBERSHIP_STATUS.REMOVED) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVITE_ALREADY_MEMBER,
        message: 'Bạn đã là thành viên của gian hàng này',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      /*
       * Đóng lời mời bằng một `updateMany` CÓ ĐIỀU KIỆN `status = pending`, không phải `update`
       * theo id.
       *
       * Hai lần bấm "Đồng ý" cùng lúc (bấm đúp, hoặc link mở ở hai tab) sẽ có đúng một lần
       * `count = 1`; lần còn lại thấy 0 và dừng. Nếu đọc-rồi-ghi thì cả hai cùng qua được vòng
       * kiểm ở trên và cùng chạy tiếp.
       */
      const claimed = await tx.tenantInvite.updateMany({
        where: { id: invite.id, status: INVITE_STATUS.PENDING },
        data: { status: INVITE_STATUS.ACCEPTED, acceptedBy: userId },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVITE_INVALID,
          message: 'Lời mời này đã được xử lý',
        });
      }

      const data = {
        roleKey: invite.roleKey,
        status: MEMBERSHIP_STATUS.ACTIVE,
        invitedBy: invite.createdBy,
        joinedAt: new Date(),
      };
      // Người từng bị gỡ thì kích hoạt lại bản ghi cũ — unique (tenant, user) chỉ cho một hàng.
      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId } },
        create: { id: newId(), tenantId: invite.tenantId, userId, ...data },
        update: data,
      });

      await this.audit.record(
        {
          tenantId: invite.tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'member.invite_accept',
          targetType: 'tenant_membership',
          targetId: userId,
          after: { roleKey: invite.roleKey, inviteId: invite.id },
        },
        tx,
      );
    });

    return { status: INVITE_STATUS.ACCEPTED, tenantSlug: invite.tenant.slug };
  }

  async decline(token: string, userId: string): Promise<InviteAnswerDto> {
    const invite = await this.loadAnswerable(token, userId);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tenantInvite.updateMany({
        where: { id: invite.id, status: INVITE_STATUS.PENDING },
        data: { status: INVITE_STATUS.DECLINED, acceptedBy: userId },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVITE_INVALID,
          message: 'Lời mời này đã được xử lý',
        });
      }
      await this.audit.record(
        {
          tenantId: invite.tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'member.invite_decline',
          targetType: 'tenant_invite',
          targetId: invite.id,
          after: { status: INVITE_STATUS.DECLINED },
        },
        tx,
      );
    });

    return { status: INVITE_STATUS.DECLINED, tenantSlug: null };
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async loadByToken(token: string) {
    const invite = await this.prisma.tenantInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        tenantId: true,
        email: true,
        roleKey: true,
        status: true,
        expiresAt: true,
        createdBy: true,
        creator: { select: { displayName: true } },
        tenant: { select: { name: true, slug: true } },
      },
    });
    if (!invite) {
      throw new NotFoundException({
        code: API_ERROR_CODE.INVITE_INVALID,
        message: 'Lời mời không tồn tại hoặc đã bị thu hồi',
      });
    }
    return invite;
  }

  /** Lời mời còn trả lời được, và người đang đăng nhập đúng là người được mời. */
  private async loadAnswerable(token: string, userId: string) {
    const invite = await this.loadByToken(token);

    if (invite.status !== INVITE_STATUS.PENDING) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVITE_INVALID,
        message: 'Lời mời này đã được xử lý hoặc đã bị thu hồi',
      });
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVITE_EXPIRED,
        message: 'Lời mời đã hết hạn',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    // So khớp email đã CHUẨN HOÁ: `Nhan.Vien@Cty.VN` trong thư mời và `nhan.vien@cty.vn` lúc
    // đăng ký là cùng một người, và bắt họ chịu thua vì chữ hoa là một lỗi sản phẩm.
    if (!user?.email || normalizeEmail(user.email) !== invite.email) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.INVITE_EMAIL_MISMATCH,
        message: 'Lời mời này dành cho một địa chỉ email khác',
        details: { invitedEmail: maskEmail(invite.email) },
      });
    }

    return invite;
  }

  /**
   * Trạng thái NHÌN THẤY của một lời mời quá hạn.
   *
   * Cột `status` vẫn là `pending` cho tới khi có ai đó đụng vào — không có job nào quét bảng
   * này, và dựng một job cho một bảng nhỏ là đổi một phép so sánh lấy một thứ phải vận hành.
   * Mọi đường GHI đều kiểm `expiresAt` riêng (`loadAnswerable`), nên đây thuần là chuyện hiển thị.
   */
  private effectiveStatus(status: string, expiresAt: Date): string {
    if (status === INVITE_STATUS.PENDING && expiresAt.getTime() <= Date.now()) {
      return INVITE_STATUS.EXPIRED;
    }
    return status;
  }

  private inviteUrl(token: string): string {
    const base = this.config.getOrThrow<string>('APP_WEB_URL').replace(/\/+$/, '');
    return `${base}/invites/${token}`;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type InviteRow = Prisma.TenantInviteGetPayload<{ select: typeof SELECT }>;

function toDto(row: InviteRow): InviteDto {
  return {
    id: row.id,
    email: row.email ?? '',
    roleKey: row.roleKey,
    status: row.status,
    expiresAt: (row.expiresAt as unknown as Date).toISOString(),
    createdAt: (row.createdAt as unknown as Date).toISOString(),
    createdByName: row.creator.displayName,
  };
}
