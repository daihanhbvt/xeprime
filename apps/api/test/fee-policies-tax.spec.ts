import { createPrismaClient, newId } from '@xeprime/prisma';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ACCOUNT_REALM, API_ERROR_CODE, TAX_RATES_DEFAULTS } from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { UpsertFeePolicyDto } from '../src/modules/fee-policies/dto/fee-policy.dto';
import { FeePoliciesService } from '../src/modules/fee-policies/fee-policies.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Chính sách phí — mục THUẾ theo ADR 0068 (bảng mức theo loại dịch vụ, tách GTGT/TNCN, căn cứ
 * pháp lý), trên PostgreSQL THẬT. Chỉ tạo/sửa/bỏ BẢN NHÁP — không đụng bản `active` toàn sàn.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new FeePoliciesService(asService, new AuditService(asService));

let dbAvailable = false;
let adminId: string;
const created: string[] = [];

const BASE = {
  name: 'Nháp thuế NĐ 117',
  holdMinAmount: '20000',
  holdPaymentWindowMinutes: 120,
  freeCancelHours: 2,
  depositPercent: 15,
  depositMinAmount: '0',
  depositMaxPercent: 30,
  taxEnabled: true,
  taxRates: TAX_RATES_DEFAULTS,
  taxLegalBasis: 'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
  tripInsuranceEnabled: false,
  vehicleProtectionEnabled: false,
} satisfies Partial<UpsertFeePolicyDto>;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  adminId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PLATFORM,
      id: adminId,
      displayName: 'Admin thuế',
      email: `fee-tax-${adminId.slice(-8).toLowerCase()}@xeprime.test`,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.feePolicy.deleteMany({ where: { id: { in: created } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const dtoErrors = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpsertFeePolicyDto, body))).map((e) => e.property);

describe('UpsertFeePolicyDto — thuế (ADR 0068)', () => {
  it('bật thuế: thiếu bảng mức hoặc căn cứ pháp lý ⇒ 400', async () => {
    expect(await dtoErrors({ ...BASE, taxRates: undefined })).toContain('taxRates');
    expect(await dtoErrors({ ...BASE, taxLegalBasis: '  ' })).toContain('taxLegalBasis');
    expect(await dtoErrors(BASE)).toEqual([]);
  });

  it('thiếu một loại dịch vụ, hay một sắc thuế vượt trần NĐ 117 (5%) ⇒ 400', async () => {
    const { with_driver: _omit, ...partial } = TAX_RATES_DEFAULTS;
    expect(await dtoErrors({ ...BASE, taxRates: partial })).toContain('taxRates');
    expect(
      await dtoErrors({
        ...BASE,
        taxRates: { ...TAX_RATES_DEFAULTS, self_drive: { vatPercent: 6, pitPercent: 2 } },
      }),
    ).toContain('taxRates');
  });

  it('tắt thuế: không cần bảng mức', async () => {
    expect(
      await dtoErrors({ ...BASE, taxEnabled: false, taxRates: null, taxLegalBasis: null }),
    ).toEqual([]);
  });
});

describe('FeePoliciesService — bản nháp có thuế', () => {
  maybe('lưu và đọc lại đúng bảng mức + căn cứ; cột một-mức cũ để trống', async () => {
    const dto = await service.createDraft(adminId, BASE as unknown as UpsertFeePolicyDto);
    created.push(dto.id);
    expect(dto.taxRates).toEqual(TAX_RATES_DEFAULTS);
    expect(dto.taxLegalBasis).toBe(BASE.taxLegalBasis);
    expect(dto.taxPercent).toBeNull();
    expect(dto.taxLabel).toBeNull();
    expect(dto.activationBlockers).not.toContain('tax_requires_rates_and_basis');
  });

  maybe('% giữ chỗ dưới mức thuế cao nhất (7%) ⇒ 400 rõ ô, không phải lỗi 500 của CHECK', async () => {
    await expect(
      service.createDraft(adminId, { ...BASE, depositPercent: 5 } as unknown as UpsertFeePolicyDto),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.VALIDATION_FAILED,
        details: [{ field: 'depositPercent' }],
      },
    });
  });

  maybe('tắt thuế khi sửa nháp ⇒ xoá bảng mức + căn cứ (không để số mồ côi)', async () => {
    const draft = await service.createDraft(adminId, BASE as unknown as UpsertFeePolicyDto);
    created.push(draft.id);
    const off = await service.updateDraft(draft.id, adminId, {
      ...BASE,
      taxEnabled: false,
    } as unknown as UpsertFeePolicyDto);
    expect(off.taxRates).toBeNull();
    expect(off.taxLegalBasis).toBeNull();
  });
});
