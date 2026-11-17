import { VEHICLE_DATA_ISSUE, VEHICLE_DATA_ROW_ACTION, VEHICLE_TYPE } from '@xeprime/types';
import { Workbook } from 'exceljs';
import {
  parseVnd,
  parseFeatures,
  parseTransmission,
} from '../src/modules/vehicle-data/import/columns';
import {
  parseSheets,
  planImport,
  type VehicleDataSnapshot,
} from '../src/modules/vehicle-data/import/import-plan';
import {
  cellText,
  parseCsv,
  readSpreadsheet,
} from '../src/modules/vehicle-data/import/spreadsheet';
import { EMPTY_FIELDS } from '../src/modules/vehicle-data/vehicle-data.service';

/**
 * Bộ đọc + lập kế hoạch nhập file Dữ liệu xe — thuần, không DB. Định dạng: MỘT sheet, mỗi dòng một
 * xe với đủ thông số, tiện ích, giá bán, giá thuê (ADR 0090).
 */
const HEADER = [
  'Mã',
  'Loại xe',
  'Hãng',
  'Dòng xe',
  'Phiên bản',
  'Năm từ',
  'Năm đến',
  'Số chỗ',
  'Kiểu dáng',
  'Nhiên liệu',
  'Hộp số',
  'Tiện ích',
  'Giá bán mới (VNĐ)',
  'Giá thuê ngày thường (VNĐ)',
  'Giá thuê cuối tuần (VNĐ)',
  'Trạng thái',
];

function snapshot(extra: Partial<VehicleDataSnapshot> = {}): VehicleDataSnapshot {
  return {
    brands: [{ key: 'vinfast', label: 'VinFast', vehicleTypes: ['car', 'motorbike'] }],
    models: [{ id: 'm-vf5', brandKey: 'vinfast', vehicleType: VEHICLE_TYPE.CAR, label: 'VF 5' }],
    records: [],
    catalogValues: new Map([
      ['body_type:cuv', ['car']],
      ['body_type:sedan', ['car']],
      ['fuel_type:electric', []],
      ['fuel_type:gasoline', []],
      ['vehicle_feature:bluetooth', []],
      ['vehicle_feature:backup_camera', ['car']],
      ['vehicle_feature:smart_key', ['motorbike']],
    ]),
    ...extra,
  };
}

function file(rows: string[][]) {
  return parseSheets([
    {
      name: 'Dữ liệu xe',
      rows: [HEADER, ...rows].map((cells, i) => ({ rowNumber: i + 1, cells })),
    },
  ]);
}

const VF5 = [
  '',
  'Ô tô',
  'VinFast',
  'VF 5',
  'Plus',
  '2023',
  '',
  '5',
  'CUV',
  'Điện',
  '1 cấp (EV)',
  'Bluetooth; Camera lùi',
  '471.000.000',
  '650000',
  '720000',
  'Đang gợi ý',
];

describe('đọc ô', () => {
  it('giá VND nhận dấu chấm/phẩy nghìn, không nhận số lẻ hay 0', () => {
    expect(parseVnd('471.000.000')).toBe('471000000');
    expect(parseVnd('650,000')).toBe('650000');
    expect(parseVnd('650000.0')).toBe('650000');
    expect(parseVnd('')).toBeNull();
    expect(parseVnd('6.5')).toBe(false);
    expect(parseVnd('0')).toBe(false);
  });

  it('hộp số nhận nhãn tiếng Việt, mã và bí danh', () => {
    expect(parseTransmission('Số tự động (AT)')).toBe('automatic');
    expect(parseTransmission('cvt')).toBe('cvt');
    expect(parseTransmission('Tay ga')).toBe('automatic_cvt');
    expect(parseTransmission('Bay')).toBe(false);
  });

  it('tiện ích theo nhãn hoặc mã; phần lạ tách riêng', () => {
    expect(parseFeatures('Bluetooth; camera_360 | Bay')).toEqual({
      keys: ['bluetooth', 'camera_360'],
      unknown: ['Bay'],
    });
  });

  it('ô hyperlink rich text đọc ra chữ, CSV theo RFC 4180', () => {
    expect(cellText({ text: { richText: [{ text: 'VF 5' }] }, hyperlink: 'x' } as never)).toBe('x');
    expect(parseCsv('a;"b;c"\n1;2', ';', 10)).toEqual([
      { rowNumber: 1, cells: ['a', 'b;c'] },
      { rowNumber: 2, cells: ['1', '2'] },
    ]);
  });
});

describe('lập kế hoạch', () => {
  it('dòng mới: tạo xe chuẩn với đủ thông số + giá, liệt kê thay đổi', () => {
    const plan = planImport(file([VF5]), snapshot());
    expect(plan.summary).toMatchObject({ rowsTotal: 1, rowsCreate: 1, rowsError: 0 });
    const op = plan.ops.find((o) => o.type === 'record');
    expect(op).toMatchObject({
      modelRef: 'm-vf5',
      label: 'Plus',
      yearFrom: 2023,
      yearTo: null,
      active: true,
    });
    expect(op && op.type === 'record' ? op.fields : null).toMatchObject({
      seatCount: 5,
      bodyType: 'cuv',
      fuelType: 'electric',
      transmission: 'direct_drive',
      featureKeys: ['backup_camera', 'bluetooth'],
      listPrice: '471000000',
      weekdayPrice: '650000',
      weekendPrice: '720000',
    });
    expect(plan.results[0]!.changes.map((c) => c.field)).toEqual(
      expect.arrayContaining(['model', 'variant', 'yearFrom', 'listPrice', 'weekdayPrice']),
    );
  });

  it('hãng / dòng xe chưa có ⇒ tạo mới (báo trước); dòng trùng trong file ⇒ lỗi', () => {
    const row = [
      '',
      'Xe máy',
      'Honda',
      'Vision',
      'Tiêu chuẩn',
      '2021',
      '',
      '',
      '',
      'Xăng',
      'Tay ga',
      'Khoá thông minh',
      '',
      '150000',
      '',
      '',
    ];
    const plan = planImport(file([row, row]), snapshot());
    expect(plan.ops.filter((o) => o.type === 'brand')).toHaveLength(1);
    expect(plan.ops.filter((o) => o.type === 'model')).toHaveLength(1);
    expect(plan.results[0]!.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([VEHICLE_DATA_ISSUE.NEW_BRAND, VEHICLE_DATA_ISSUE.NEW_MODEL]),
    );
    expect(plan.results[1]).toMatchObject({ action: VEHICLE_DATA_ROW_ACTION.ERROR });
    expect(plan.results[1]!.issues[0]!.code).toBe(VEHICLE_DATA_ISSUE.DUPLICATE_ROW);
  });

  it('khớp xe đã có: ô trống giữ nguyên, chỉ báo ô đổi; giống hệt ⇒ không đổi', () => {
    const existing = {
      id: 'r1',
      modelId: 'm-vf5',
      key: 'plus',
      label: 'Plus',
      yearFrom: 2023,
      yearTo: null,
      active: true,
      reviewStatus: 'approved',
      fields: {
        ...EMPTY_FIELDS,
        seatCount: 5,
        bodyType: 'cuv',
        fuelType: 'electric',
        transmission: 'direct_drive',
        featureKeys: ['bluetooth', 'backup_camera'],
        listPrice: '471000000',
        weekdayPrice: '600000',
        weekendPrice: '720000',
      },
    };
    const plan = planImport(file([VF5]), snapshot({ records: [existing] }));
    expect(plan.results[0]).toMatchObject({
      action: VEHICLE_DATA_ROW_ACTION.UPDATE,
      recordId: 'r1',
    });
    expect(plan.results[0]!.changes).toEqual([
      { field: 'weekdayPrice', before: '600000', after: '650000' },
    ]);

    const same = planImport(
      file([['r1', '', '', '', '', '', '', '', '', '', '', '', '', '650000', '', '']]),
      snapshot({
        records: [{ ...existing, fields: { ...existing.fields, weekdayPrice: '650000' } }],
      }),
    );
    expect(same.results[0]!.action).toBe(VEHICLE_DATA_ROW_ACTION.UNCHANGED);
  });

  it('Mã không có ⇒ lỗi; xe máy mang số chỗ ⇒ lỗi luật; tiện ích không hợp loại xe ⇒ cảnh báo', () => {
    const plan = planImport(
      file([
        ['ZZZ', 'Ô tô', 'VinFast', 'VF 5', '', '', '', '', '', '', '', '', '', '', '', ''],
        [
          '',
          'Xe máy',
          'VinFast',
          'Evo200',
          '',
          '',
          '',
          '2',
          '',
          'Điện',
          '',
          'Camera lùi',
          '',
          '',
          '',
          '',
        ],
      ]),
      snapshot(),
    );
    expect(plan.results[0]!.issues[0]!.code).toBe(VEHICLE_DATA_ISSUE.ID_NOT_FOUND);
    expect(plan.results[1]!.action).toBe(VEHICLE_DATA_ROW_ACTION.ERROR);
    expect(plan.results[1]!.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([VEHICLE_DATA_ISSUE.UNKNOWN_FEATURE, VEHICLE_DATA_ISSUE.INVALID_SPEC]),
    );
  });

  it('đọc .xlsx thật, bỏ sheet hướng dẫn', async () => {
    const wb = new Workbook();
    const data = wb.addWorksheet('Dữ liệu xe');
    data.addRow(HEADER);
    data.addRow(VF5);
    wb.addWorksheet('Hướng dẫn').addRow(['Một dòng', 'Một xe']);
    const sheets = await readSpreadsheet(Buffer.from(await wb.xlsx.writeBuffer()), 100);
    const parsed = parseSheets(sheets);
    expect(parsed.sheetsRead).toEqual(['Dữ liệu xe']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.cells).toMatchObject({
      brand: 'VinFast',
      model: 'VF 5',
      listPrice: '471.000.000',
    });
  });
});
