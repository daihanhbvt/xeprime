import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, normalizeWardName } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { WardDto } from './dto/ward.dto';

const WARD_SELECT = {
  code: true,
  provinceCode: true,
  name: true,
  shortName: true,
  administrativeType: true,
} satisfies Prisma.WardSelect;

/** Trần mặc định — tỉnh đông đơn vị nhất (TP.HCM) có 168, nên 500 là "cả tỉnh" với biên an toàn. */
const DEFAULT_LIMIT = 500;

/** Tra theo mã: chặn một request hỏi cả danh mục bằng cách liệt kê 3.321 mã. */
const MAX_LOOKUP_CODES = 50;

/**
 * Danh mục đơn vị hành chính CẤP XÃ — nửa còn lại của địa chỉ có cấu trúc.
 *
 * Vì sao là service riêng chứ không nhét vào `ProvincesService`: bảng `wards` lớn gấp trăm lần
 * bảng `provinces` (3.321 vs 34) nên nó có luật riêng — luôn lọc theo tỉnh, luôn có ô tìm, luôn
 * có trần số dòng. Trộn hai danh mục vào một service là mời gọi một câu `findMany` không điều
 * kiện trả về cả nước.
 *
 * `assertSelectable` là nơi DUY NHẤT trả lời "mã xã này gắn vào dữ liệu mới được không". Nó
 * kiểm CẢ hai vế (xã tồn tại + thuộc đúng tỉnh) — vế thứ hai còn được DB giữ bằng FK tổ hợp
 * `(ward_code, province_code)`, nên đây là lớp cho THÔNG BÁO ĐẸP, không phải lớp bảo vệ duy nhất.
 */
@Injectable()
export class WardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đơn vị cấp xã của MỘT tỉnh, có tìm kiếm.
   *
   * Tìm chạy trên `normalized_name` (đã bỏ dấu, bỏ tiền tố loại) nên khách gõ `"ba dinh"`,
   * `"Ba Đình"` hay `"phuong ba dinh"` đều ra cùng một kết quả mà không cần extension `unaccent`
   * — VPS có thể không cài, và một tính năng tìm kiếm không được phép phụ thuộc vào việc đó.
   */
  async listByProvince(
    provinceCode: string,
    q?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<{ items: WardDto[]; total: number }> {
    const needle = q ? normalizeWardName(q) : '';
    // Người dùng dán nguyên mã từ giấy tờ — cho tra thẳng, không bắt họ biết đó là mã.
    const digits = needle.replace(/\D/g, '');
    const search: Prisma.WardWhereInput[] = needle
      ? [
          { normalizedName: { contains: needle } },
          ...(digits ? [{ code: { startsWith: digits } }] : []),
        ]
      : [];

    const where: Prisma.WardWhereInput = {
      provinceCode,
      isEnabled: true,
      ...(search.length > 0 ? { OR: search } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.ward.findMany({
        where,
        select: WARD_SELECT,
        orderBy: [{ name: 'asc' }],
        take: Math.min(limit, DEFAULT_LIMIT),
      }),
      // Tổng của CẢ TỈNH, không theo `q`: bộ chọn cần biết "tỉnh này có bao nhiêu đơn vị" để
      // nói "hiện 20/168", chứ không phải đếm lại kết quả tìm mà nó đang cầm trong tay.
      this.prisma.ward.count({ where: { provinceCode, isEnabled: true } }),
    ]);

    return { items, total };
  }

  /** Tra tên của các mã ĐÃ LƯU — màn chi tiết/danh sách cần nhãn mà không tải cả tỉnh. */
  async findByCodes(codes: string[]): Promise<WardDto[]> {
    const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    if (unique.length === 0) return [];
    if (unique.length > MAX_LOOKUP_CODES) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Tối đa ${MAX_LOOKUP_CODES} mã mỗi lượt tra`,
        details: { field: 'codes' },
      });
    }
    return this.prisma.ward.findMany({
      // KHÔNG lọc `isEnabled`: đây là tra NHÃN cho dữ liệu đã lưu. Một đơn vị bị tắt khỏi danh
      // mục chọn mới vẫn phải hiện đúng tên trên những địa chỉ đang trỏ tới nó.
      where: { code: { in: unique } },
      select: WARD_SELECT,
      orderBy: [{ provinceCode: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Xác nhận một mã xã dùng được để GẮN VÀO dữ liệu mới, và nó THUỘC tỉnh đã chọn.
   *
   * Trả về bản ghi thay vì boolean vì gần như mọi caller cần tên chuẩn ngay sau đó (để ghép
   * chuỗi hiển thị) — tách thành hai lượt query là chỗ để chúng lệch nhau.
   */
  async assertSelectable(
    wardCode: string,
    provinceCode: string,
    /**
     * Có đòi đơn vị đang mở cho lựa chọn MỚI không.
     *
     * `false` cho địa chỉ do KHÁCH khai (giao xe, điểm đón, sổ khách): `is_enabled` là công tắc
     * vận hành của danh mục, không phải phán quyết rằng nơi đó không tồn tại. Chặn một địa chỉ
     * giao xe vì xã đó tạm đóng đăng ký là từ chối một chuyến đi có thật.
     */
    requireEnabled = true,
  ): Promise<WardDto> {
    const ward = await this.prisma.ward.findUnique({
      where: { code: wardCode },
      select: { ...WARD_SELECT, isEnabled: true },
    });

    if (!ward) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Xã/phường/đặc khu không hợp lệ',
        details: { field: 'wardCode' },
      });
    }
    if (ward.provinceCode !== provinceCode) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `"${ward.name}" không thuộc tỉnh/thành đã chọn`,
        details: { field: 'wardCode' },
      });
    }
    if (requireEnabled && !ward.isEnabled) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `"${ward.name}" hiện không nhận đăng ký mới`,
        details: { field: 'wardCode' },
      });
    }

    const { isEnabled: _isEnabled, ...rest } = ward;
    return rest;
  }
}
