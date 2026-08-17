import { Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, CATALOG_TYPE, CONTRACT_STATUS } from '@xeprime/types';
import { bookingDebt } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContractDto, ContractSnapshotDto } from './dto/contract.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CONTRACT_SELECT = {
  id: true,
  bookingId: true,
  contractNo: true,
  templateVersion: true,
  status: true,
  snapshotJson: true,
  createdAt: true,
} satisfies Prisma.ContractSelect;

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tạo hợp đồng từ một booking — **idempotent**: booking đã có hợp đồng thì trả bản cũ (số HĐ và
   * snapshot không đổi). Snapshot đông cứng bên A/B, xe, thời gian, bảng giá, cọc lúc lập; sửa
   * booking sau KHÔNG ảnh hưởng HĐ đã in. `tenantId` từ scope, không tin client.
   */
  async createFromBooking(
    tenantId: string,
    userId: string,
    bookingId: string,
  ): Promise<ContractDto> {
    const existing = await this.prisma.contract.findFirst({
      where: { bookingId, tenantId },
      select: CONTRACT_SELECT,
    });
    if (existing) return toDto(existing);

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        customerName: true,
        customerPhone: true,
        serviceType: true,
        pickupAt: true,
        returnAt: true,
        baseAmount: true,
        deliveryFee: true,
        discountAmount: true,
        totalAmount: true,
        depositAmount: true,
        paidAmount: true,
        note: true,
        vehicle: {
          select: {
            name: true,
            plateNumber: true,
            vehicleType: true,
            brand: true,
            model: true,
            manufactureYear: true,
            color: true,
            seatCount: true,
          },
        },
        tenant: {
          select: {
            name: true,
            phone: true,
            email: true,
            profile: {
              select: {
                address: true,
                provinceName: true,
                taxCode: true,
                businessLicenseNo: true,
                bankName: true,
                bankAccountNo: true,
                bankAccountName: true,
              },
            },
          },
        },
      },
    });
    if (!booking) throw notFound();

    const profile = booking.tenant.profile;
    const total = new Prisma.Decimal(booking.totalAmount);
    const paid = new Prisma.Decimal(booking.paidAmount);
    const remaining = bookingDebt(total, paid);
    const days = Math.max(
      1,
      Math.ceil((booking.returnAt.getTime() - booking.pickupAt.getTime()) / MS_PER_DAY),
    );

    const snapshot: ContractSnapshotDto = {
      shop: {
        name: booking.tenant.name,
        phone: booking.tenant.phone,
        email: booking.tenant.email,
        address: profile?.address ?? null,
        province: profile?.provinceName ?? null,
        taxCode: profile?.taxCode ?? null,
        businessLicenseNo: profile?.businessLicenseNo ?? null,
        bankName: profile?.bankName ?? null,
        bankAccountNo: profile?.bankAccountNo ?? null,
        bankAccountName: profile?.bankAccountName ?? null,
      },
      customer: { name: booking.customerName, phone: booking.customerPhone },
      vehicle: {
        name: booking.vehicle.name,
        plateNumber: booking.vehicle.plateNumber,
        vehicleType: booking.vehicle.vehicleType,
        // Dịch vụ đóng băng là CỦA CHUYẾN (booking), không phải của xe — xe giờ mang MẢNG
        // dịch vụ, còn hợp đồng ký cho đúng một chuyến. GIỮ key `serviceType` trong snapshot:
        // hợp đồng cũ đã ký đọc y nguyên, không migrate jsonb.
        serviceType: booking.serviceType,
        // Đổi key danh mục ("vinfast") sang tên hiển thị ("VinFast") NGAY khi chốt snapshot:
        // hợp đồng là văn bản đóng băng, in ra phải là tên hãng chứ không phải slug, và sau này
        // admin đổi nhãn cũng không được sửa hợp đồng đã ký.
        brand: await this.brandLabel(booking.vehicle.brand),
        model: booking.vehicle.model,
        manufactureYear: booking.vehicle.manufactureYear,
        color: booking.vehicle.color,
        seatCount: booking.vehicle.seatCount,
      },
      rental: {
        bookingCode: booking.code,
        pickupAt: booking.pickupAt.toISOString(),
        returnAt: booking.returnAt.toISOString(),
        days,
      },
      pricing: {
        baseAmount: booking.baseAmount.toString(),
        deliveryFee: booking.deliveryFee.toString(),
        discountAmount: booking.discountAmount.toString(),
        totalAmount: total.toString(),
        depositAmount: booking.depositAmount.toString(),
        paidAmount: paid.toString(),
        remainingAmount: remaining.toString(),
      },
      note: booking.note,
    };

    const id = newId();
    const contractNo = genContractNo(id);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contract.create({
          data: {
            id,
            tenantId,
            bookingId,
            contractNo,
            snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            status: CONTRACT_STATUS.ACTIVE,
            createdBy: userId,
          },
          select: CONTRACT_SELECT,
        });
        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'contract.create',
            targetType: 'contract',
            targetId: id,
            after: { contractNo, bookingId },
          },
          tx,
        );
        return created;
      });
      return toDto(row);
    } catch (err) {
      // Đua tạo cùng booking (unique booking_id) → trả bản đối phương vừa tạo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.contract.findFirst({
          where: { bookingId, tenantId },
          select: CONTRACT_SELECT,
        });
        if (raced) return toDto(raced);
      }
      throw err;
    }
  }

  async getById(tenantId: string, id: string): Promise<ContractDto> {
    const row = await this.prisma.contract.findFirst({
      where: { id, tenantId },
      select: CONTRACT_SELECT,
    });
    if (!row) throw notFound();
    return toDto(row);
  }

  async getByBooking(tenantId: string, bookingId: string): Promise<ContractDto> {
    const row = await this.prisma.contract.findFirst({
      where: { bookingId, tenantId },
      select: CONTRACT_SELECT,
    });
    if (!row) throw notFound();
    return toDto(row);
  }

  /** Key hãng xe → tên hiển thị. Key lạ (chưa chuẩn hoá) thì giữ nguyên, không bỏ trắng. */
  private async brandLabel(key: string | null): Promise<string | null> {
    if (!key) return null;
    const item = await this.prisma.catalogItem.findUnique({
      where: { type_key: { type: CATALOG_TYPE.VEHICLE_BRAND, key } },
      select: { label: true },
    });
    return item?.label ?? key;
  }
}

type ContractRow = Prisma.ContractGetPayload<{ select: typeof CONTRACT_SELECT }>;

function toDto(r: ContractRow): ContractDto {
  return {
    id: r.id,
    bookingId: r.bookingId,
    contractNo: r.contractNo,
    templateVersion: r.templateVersion,
    status: r.status,
    snapshot: r.snapshotJson as unknown as ContractSnapshotDto,
    createdAt: r.createdAt as unknown as string,
  };
}

/** `HD-YYYYMMDD-XXXXX` — số HĐ cố định, hậu tố từ ULID (duy nhất trong shop). */
function genContractNo(id: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `HD-${ymd}-${id.slice(-5).toUpperCase()}`;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy hợp đồng',
  });
}
