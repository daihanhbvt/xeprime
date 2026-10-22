import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM_VALUES,
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  type AccountRealm,
} from '@xeprime/types';
import { maskEmail, maskPhone } from '../../common/mask';
import { phoneLookupVariants } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccountLookupItemDto,
  AccountLookupQueryDto,
} from './dto/platform-account-lookup.dto';

/**
 * Tra cứu XUYÊN REALM cho hỗ trợ — ADR 0053 điều 9.
 *
 * Một số điện thoại có thể là ba tài khoản khác nhau (khách · chủ xe · quản trị). Màn "Khách hàng"
 * và màn "Đối tác" mỗi màn chỉ thấy realm của nó; câu hỏi "số này là những tài khoản nào" là câu của
 * HỖ TRỢ, nên nó có một endpoint riêng — chỉ đọc, liên hệ đã che, khớp chính xác.
 *
 * Kết quả tối đa một dòng mỗi realm vì định danh unique TRONG realm. Không phân trang: tập kết quả
 * bị chặn trên bởi số realm, không phải bởi dữ liệu.
 */
@Injectable()
export class PlatformAccountLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(query: AccountLookupQueryDto): Promise<AccountLookupItemDto[]> {
    const phone = query.phone?.trim();
    const email = query.email?.trim().toLowerCase();
    if (Boolean(phone) === Boolean(email)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Tra cứu theo đúng một định danh: số điện thoại HOẶC email',
      });
    }

    const where: Prisma.UserWhereInput = phone
      ? { phone: { in: phoneLookupVariants(phone) }, deletedAt: null }
      : { email, deletedAt: null };

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: ACCOUNT_REALM_VALUES.length * 2,
      select: {
        id: true,
        realm: true,
        displayName: true,
        phone: true,
        email: true,
        status: true,
        createdAt: true,
        tenantMemberships: {
          where: { status: MEMBERSHIP_STATUS.ACTIVE },
          take: 1,
          select: { roleKey: true, tenant: { select: { name: true } } },
        },
        platformMemberships: {
          where: { status: MEMBERSHIP_STATUS.ACTIVE },
          take: 1,
          select: { roleKey: true },
        },
      },
    });

    // Thứ tự realm cố định (theo `ACCOUNT_REALM_VALUES`) để màn hình luôn đọc cùng một hàng:
    // khách → chủ xe → quản trị — không dựa vào thứ tự chữ cái của chuỗi realm.
    return rows
      .sort((a, b) => realmOrder(a.realm) - realmOrder(b.realm))
      .map((row) => {
        const membership = row.tenantMemberships[0];
        return {
          id: row.id,
          realm: row.realm as AccountRealm,
          displayName: row.displayName,
          phoneMasked: maskPhone(row.phone),
          emailMasked: maskEmail(row.email),
          status: row.status,
          tenantName: membership?.tenant.name ?? null,
          tenantRoleKey: membership?.roleKey ?? null,
          platformRoleKey: row.platformMemberships[0]?.roleKey ?? null,
          createdAt: row.createdAt.toISOString(),
        };
      });
  }
}

function realmOrder(realm: string): number {
  const index = (ACCOUNT_REALM_VALUES as string[]).indexOf(realm);
  return index < 0 ? ACCOUNT_REALM_VALUES.length : index;
}
