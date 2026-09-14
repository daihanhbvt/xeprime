/**
 * Tải danh mục đơn vị hành chính CẤP XÃ (xã / phường / đặc khu) từ nguồn NHÀ NƯỚC và ghi ra
 * `prisma/data/ward-catalog.json`.
 *
 * Nguồn: cổng tra cứu đơn vị hành chính của **Bộ Nông nghiệp và Môi trường — Nhà xuất bản Tài
 * nguyên Môi trường và Bản đồ Việt Nam** (`https://sapnhap.bando.com.vn`), điểm cuối
 * `POST /p.co_dvhc` với `ma=0` trả toàn bộ cây 2 cấp sau sắp xếp. Bộ dữ liệu này công bố đúng
 * danh mục của **Quyết định 19/2025/QĐ-TTg** (ban hành 30/06/2025, hiệu lực 01/07/2025) —
 * 34 đơn vị cấp tỉnh và 3.321 đơn vị cấp xã (13 đặc khu, 697 phường, 2.611 xã).
 *
 * Vì sao KHÔNG lấy thẳng từ Tổng cục Thống kê: `danhmuchanhchinh.gso.gov.vn` đã ngừng phân giải
 * tên miền sau khi Tổng cục sáp nhập về Bộ Tài chính, còn bản PDF đính kèm quyết định trên Cổng
 * thông tin Chính phủ là bản SCAN (không có lớp văn bản) nên không bóc được mã bằng máy. Nguồn
 * trên là bản điện tử máy đọc được duy nhất còn phục vụ, do một cơ quan nhà nước phát hành.
 *
 * Vì sao KHÔNG gọi lúc deploy: danh mục hành chính là văn bản pháp lý, đổi bằng quyết định chứ
 * không đổi hằng ngày. Script này chạy TAY khi có quyết định mới; kết quả commit vào repo và
 * migration sinh ra từ chính file JSON đó (`gen-ward-sql.ts`). Không môi trường nào phụ thuộc
 * mạng ngoài để có danh mục.
 *
 * Chạy: pnpm --filter @xeprime/prisma exec tsx ./scripts/fetch-ward-catalog.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROVINCE_CATALOG, WARD_ADMINISTRATIVE_TYPE, type WardAdministrativeType } from '@xeprime/types';

const SOURCE_URL = 'https://sapnhap.bando.com.vn/p.co_dvhc';
const SOURCE_PUBLISHER =
  'Bộ Nông nghiệp và Môi trường — NXB Tài nguyên Môi trường và Bản đồ Việt Nam (sapnhap.bando.com.vn)';
const LEGAL_BASIS = 'Quyết định 19/2025/QĐ-TTg (ban hành 30/06/2025, hiệu lực 01/07/2025)';

/** Con số trong chính văn bản — dùng làm chốt chặn, lệch là DỪNG chứ không ghi đè file cũ. */
const EXPECTED = { provinces: 34, wards: 3321, specialZones: 13, wards_: 697, communes: 2611 };

interface SourceRow {
  /** Mã đơn vị: 2 ký tự với cấp tỉnh, 5 ký tự với cấp xã. */
  ma: string;
  ten: string;
  /** `'0'` = cấp tỉnh; ngược lại là mã tỉnh chứa đơn vị này. */
  magoc: string;
  malk: string;
  /** Mô tả các đơn vị cũ đã nhập lại — giữ để tra ngược, KHÔNG dùng để suy mã. */
  truocsapnhap: string;
}

/** Tiền tố tên chuẩn → loại đơn vị. Không đoán: tên nào không khớp ba tiền tố này là lỗi dữ liệu. */
const TYPE_BY_PREFIX: ReadonlyArray<readonly [string, WardAdministrativeType]> = [
  ['Phường ', WARD_ADMINISTRATIVE_TYPE.WARD],
  ['Xã ', WARD_ADMINISTRATIVE_TYPE.COMMUNE],
  ['Đặc khu ', WARD_ADMINISTRATIVE_TYPE.SPECIAL_ZONE],
];

/**
 * Dọn khoảng trắng lạ trước khi phân loại.
 *
 * Không phải dọn dẹp cho đẹp: bộ dữ liệu gốc có đúng một bản ghi dùng NBSP (`Xã Yên Thành`),
 * và một NBSP làm hỏng cả phép tách tiền tố lẫn khoá tìm kiếm bỏ dấu.
 */
function cleanName(raw: string): string {
  return raw.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function classify(name: string): { administrativeType: WardAdministrativeType; shortName: string } {
  for (const [prefix, administrativeType] of TYPE_BY_PREFIX) {
    if (name.startsWith(prefix)) {
      return { administrativeType, shortName: name.slice(prefix.length).trim() };
    }
  }
  throw new Error(`Tên đơn vị cấp xã không nhận dạng được loại: "${name}"`);
}

async function main(): Promise<void> {
  const res = await fetch(SOURCE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Nguồn chỉ phục vụ request đến từ chính trang tra cứu của họ.
      Referer: 'https://sapnhap.bando.com.vn/',
    },
    body: new URLSearchParams({ ma: '0' }),
  });
  if (!res.ok) throw new Error(`Nguồn trả HTTP ${res.status}`);

  const rows = JSON.parse((await res.text()).trim()) as SourceRow[];
  const provinceRows = rows.filter((r) => r.magoc === '0');
  const wardRows = rows.filter((r) => r.magoc !== '0');

  if (provinceRows.length !== EXPECTED.provinces || wardRows.length !== EXPECTED.wards) {
    throw new Error(
      `Nguồn trả ${provinceRows.length} tỉnh / ${wardRows.length} xã, chờ đợi ` +
        `${EXPECTED.provinces}/${EXPECTED.wards}. Danh mục có thể đã đổi — ĐỌC quyết định mới ` +
        'trước khi cập nhật hằng số, đừng nới lỏng kiểm tra này.',
    );
  }

  /*
   * Mã tỉnh của nguồn phải TRÙNG KHỚP bản soạn đang dùng. `provinces` là bảng đã có dữ liệu
   * tham chiếu (chi nhánh, snapshot marketplace) nên mã ở đó là bất biến — nếu một ngày nguồn
   * dùng mã khác thì phải xử lý bằng quyết định, không phải bằng một lần chạy script.
   */
  const knownCodes = new Set(PROVINCE_CATALOG.map((p) => p.code));
  const unknown = provinceRows.filter((p) => !knownCodes.has(p.ma)).map((p) => `${p.ma} ${p.ten}`);
  if (unknown.length > 0 || knownCodes.size !== provinceRows.length) {
    throw new Error(`Mã tỉnh của nguồn lệch bản soạn packages/types: ${unknown.join(', ')}`);
  }

  const wards = wardRows
    .map((r) => {
      const name = cleanName(r.ten);
      const { administrativeType, shortName } = classify(name);
      if (!/^\d{5}$/.test(r.ma)) throw new Error(`Mã cấp xã không hợp lệ: "${r.ma}" (${name})`);
      return { code: r.ma, provinceCode: r.magoc, name, shortName, administrativeType };
    })
    /*
     * Sắp theo (tỉnh, tên) chứ không theo mã: mã cấp xã kế thừa thứ tự quận/huyện CŨ, nên sắp
     * theo mã là đưa ra một thứ tự vô nghĩa với người đang tìm phường trong danh sách.
     */
    .sort(
      (a, b) =>
        a.provinceCode.localeCompare(b.provinceCode) || a.name.localeCompare(b.name, 'vi'),
    );

  const duplicated = wards.length - new Set(wards.map((w) => w.code)).size;
  if (duplicated > 0) throw new Error(`Trùng ${duplicated} mã cấp xã trong nguồn`);

  const counts = {
    [WARD_ADMINISTRATIVE_TYPE.WARD]: 0,
    [WARD_ADMINISTRATIVE_TYPE.COMMUNE]: 0,
    [WARD_ADMINISTRATIVE_TYPE.SPECIAL_ZONE]: 0,
  };
  for (const w of wards) counts[w.administrativeType] += 1;
  if (
    counts[WARD_ADMINISTRATIVE_TYPE.SPECIAL_ZONE] !== EXPECTED.specialZones ||
    counts[WARD_ADMINISTRATIVE_TYPE.WARD] !== EXPECTED.wards_ ||
    counts[WARD_ADMINISTRATIVE_TYPE.COMMUNE] !== EXPECTED.communes
  ) {
    throw new Error(`Cơ cấu loại đơn vị lệch văn bản: ${JSON.stringify(counts)}`);
  }

  const out = {
    _source: {
      publisher: SOURCE_PUBLISHER,
      url: SOURCE_URL,
      legalBasis: LEGAL_BASIS,
      effectiveFrom: '2025-07-01',
      fetchedAt: new Date().toISOString().slice(0, 10),
      counts: { provinces: provinceRows.length, wards: wards.length, ...counts },
      note:
        'Sinh bằng prisma/scripts/fetch-ward-catalog.ts. Không sửa tay: sửa ở nguồn rồi chạy lại, ' +
        'sau đó chạy gen-ward-sql.ts để dựng migration.',
    },
    wards,
  };

  const target = resolve(import.meta.dirname, '../data/ward-catalog.json');
  writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  process.stdout.write(`Đã ghi ${wards.length} đơn vị cấp xã → ${target}\n`);
}

void main();
