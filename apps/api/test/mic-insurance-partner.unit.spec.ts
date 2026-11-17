import {
  coverageWindow,
  MicClient,
  MicInsurancePartner,
  MicUnavailableError,
  parseVnDateTime,
  partnerRefFor,
  insurancePhotoUrls,
  vnDate,
  vnTime,
  type IssuePolicyRequest,
} from '@xeprime/prisma';
import { INSURANCE_ISSUE_ERROR, INSURANCE_PRODUCT_KIND } from '@xeprime/types';

/**
 * Adapter MIC thật (ADR 0088) — chạy trên client GIẢ, không gọi mạng. Khoá bốn luật:
 *  1. tra cứu `id_tras` TRƯỚC: thử lại sau một lần mất phản hồi không cấp hợp đồng thứ hai;
 *  2. gửi 5 ảnh TRƯỚC khi cấp, rồi validate → cấp, cùng một thân;
 *  3. MIC từ chối ⇒ không thử lại; lỗi mạng/5xx ⇒ thử lại;
 *  4. sandbox ⇒ số GCN mang `TEST-`, cờ `isTest`.
 */
type Call = { method: string; path: string; body?: unknown };

class FakeMic extends MicClient {
  calls: Call[] = [];
  lookups: Array<Record<string, unknown> | null> = [];
  responses = new Map<
    string,
    { status: number; body: { code: string | null; message: string | null; data: unknown } }
  >();
  throwOn: string | null = null;

  constructor(sandbox = true) {
    super({
      baseUrl: 'https://mic.test',
      username: 'u',
      password: 'p',
      clientId: 'c',
      clientSecret: 's',
      sandbox,
    });
  }

  override async call<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
    this.calls.push({ method, path, body });
    if (this.throwOn && path.includes(this.throwOn)) throw new MicUnavailableError('timeout');
    const key = Object.keys(Object.fromEntries(this.responses)).find((k) => path.includes(k));
    const res = key
      ? this.responses.get(key)!
      : { status: 200, body: { code: '00', message: 'ok', data: null } };
    return res as {
      status: number;
      body: { code: string | null; message: string | null; data: T | null };
    };
  }

  override async lookup(idTras: string) {
    this.calls.push({ method: 'GET', path: `lookup:${idTras}` });
    return (this.lookups.shift() ?? null) as never;
  }
}

const silent = { warn: () => undefined };
const NOW = new Date('2026-12-10T02:00:00Z'); // 09:00 giờ Việt Nam

function request(over: Partial<IssuePolicyRequest> = {}): IssuePolicyRequest {
  return {
    idempotencyKey: 'bk1:vehicle_trip',
    productKind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
    premiumAmount: '112200',
    coverageFrom: new Date('2026-12-10T02:00:00Z'),
    coverageTo: new Date('2026-12-12T11:00:00Z'),
    vehicle: {
      plateNumber: '51H-100.00',
      name: 'Toyota Vios',
      vehicleType: 'car',
      brand: 'Toyota',
      model: 'Vios',
      manufactureYear: 2019,
      seatCount: 5,
      insuredValue: '340000000',
      chassisNumber: 'RL4100000VN0',
      engineNumber: 'E200000',
      registrationHolderName: 'Tran Quoc Bao',
      photoUrls: [],
    },
    customer: { name: 'Nguyen Van An', phone: '0912345678', address: '12 Nguyen Trai, Q1' },
    consent: null,
    product: null,
    partnerRef: 'XP0123456789ABCDEFGH',
    trip: {
      pickupAt: new Date('2026-12-10T02:00:00Z'),
      returnAt: new Date('2026-12-12T11:00:00Z'),
      handedOverAt: new Date(Date.now() - 60_000),
    },
    photosSent: true,
    ...over,
  };
}

describe('MicInsurancePartner (ADR 0088)', () => {
  it('chỉ bán vật chất xe', async () => {
    const partner = new MicInsurancePartner(new FakeMic(), silent);
    expect(partner.supportsKind(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP)).toBe(true);
    expect(partner.supportsKind(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT)).toBe(false);
    const r = await partner.issue(
      request({ productKind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT }),
    );
    expect(r).toMatchObject({ ok: false, retryable: false });
  });

  it('cấp mới: tra cứu → validate → cấp → tra cứu; sandbox gắn TEST-', async () => {
    const mic = new FakeMic(true);
    mic.lookups = [
      null,
      { so_hd: '202610010442019', so_id: 26111101571307, ttrang: '4', ttoan: 112200 },
    ];
    mic.responses.set('gcn_vcx_validate', {
      status: 200,
      body: { code: '00', message: 'ok', data: null },
    });
    mic.responses.set('/gcn_vcx', {
      status: 200,
      body: {
        code: '00',
        message: 'ok',
        data: { contact_number: '202610010442019', id_number: '26111101571307', total_fee: 112200 },
      },
    });
    const r = await new MicInsurancePartner(mic, silent).issue(request());
    expect(r).toMatchObject({
      ok: true,
      certificateNumber: 'TEST-202610010442019',
      isTest: true,
      partnerContractNumber: '202610010442019',
      partnerPolicyId: '26111101571307',
      partnerStatus: '4',
      partnerPremiumAmount: '112200',
    });
    const paths = mic.calls.map((c) => c.path);
    expect(paths[0]).toBe('lookup:XP0123456789ABCDEFGH');
    expect(paths.findIndex((p) => p.includes('gcn_vcx_validate'))).toBeLessThan(
      paths.findIndex((p) => p.endsWith('/gcn_vcx')),
    );
    const body = mic.calls.find((c) => c.path.endsWith('/gcn_vcx'))!.body as {
      id_tras: string;
      contract_info: { vehicle_type: string; usage_purpose: string; coverage_scope: unknown };
      vehicle_owner_info: { name: string };
      buyer_info: { address_buyer: string };
    };
    expect(body.id_tras).toBe('XP0123456789ABCDEFGH');
    expect(body.contract_info.vehicle_type).toBe('M1.11');
    expect(body.contract_info.usage_purpose).toBe('C');
    expect(body.contract_info.coverage_scope).toEqual({
      tpl: 0,
      tpb: 0,
      vehicle_price: 340000000,
      tv: 340000000,
    });
    expect(body.vehicle_owner_info.name).toBe('Tran Quoc Bao');
    expect(body.buyer_info.address_buyer).toBe('12 Nguyen Trai, Q1');
  });

  it('production: không gắn TEST-', async () => {
    const mic = new FakeMic(false);
    mic.lookups = [{ so_hd: '2026X', so_id: '1', ttrang: '4', ttoan: 44200 }];
    const r = await new MicInsurancePartner(mic, silent).issue(request());
    expect(r).toMatchObject({ ok: true, certificateNumber: '2026X', isTest: false });
  });

  it('thử lại sau khi mất phản hồi: tra cứu ra hợp đồng cũ, KHÔNG cấp lần hai', async () => {
    const mic = new FakeMic();
    mic.lookups = [
      {
        so_hd: '202610020442020',
        so_id: '26111101571308',
        ttrang: '4',
        ttoan: 44200,
        ngay_hl: '14/12/2026',
        gio_hl: '09:00',
        ngay_kt: '16/12/2026',
        gio_kt: '09:00',
      },
    ];
    const r = await new MicInsurancePartner(mic, silent).issue(request());
    expect(r).toMatchObject({ ok: true, partnerContractNumber: '202610020442020' });
    expect(mic.calls.some((c) => c.path.includes('gcn_vcx'))).toBe(false);
    if (r.ok) expect(r.coverageFrom?.toISOString()).toBe('2026-12-14T02:00:00.000Z');
  });

  it('MIC từ chối hồ sơ ⇒ lỗi vĩnh viễn, không thử lại, thân lưu chỉ có mã + câu báo', async () => {
    const mic = new FakeMic();
    mic.responses.set('gcn_vcx_validate', {
      status: 200,
      body: { code: '02', message: 'Bắt buộc nhập ngày kết thúc', data: { secret: 'x' } },
    });
    const r = await new MicInsurancePartner(mic, silent).issue(request());
    expect(r).toMatchObject({
      ok: false,
      code: INSURANCE_ISSUE_ERROR.PARTNER_REJECTED,
      retryable: false,
    });
    if (!r.ok) expect(JSON.stringify(r.raw)).not.toContain('secret');
  });

  it('mạng hỏng / MIC 5xx ⇒ thử lại', async () => {
    const mic = new FakeMic();
    mic.throwOn = 'gcn_vcx_validate';
    const r = await new MicInsurancePartner(mic, silent).issue(request());
    expect(r).toMatchObject({
      ok: false,
      code: INSURANCE_ISSUE_ERROR.PARTNER_UNAVAILABLE,
      retryable: true,
    });

    const mic2 = new FakeMic();
    mic2.responses.set('/gcn_vcx', {
      status: 502,
      body: { code: null, message: null, data: null },
    });
    const r2 = await new MicInsurancePartner(mic2, silent).issue(request());
    expect(r2).toMatchObject({ ok: false, retryable: true });
  });

  it('thiếu dữ liệu bắt buộc ⇒ INVALID_REQUEST, không gọi cấp', async () => {
    const mic = new FakeMic();
    const r = await new MicInsurancePartner(mic, silent).issue(
      request({ customer: { name: 'A', phone: null, address: null } }),
    );
    expect(r).toMatchObject({ ok: false, code: INSURANCE_ISSUE_ERROR.INVALID_REQUEST });
    if (!r.ok) expect(r.message).toContain('địa chỉ khách thuê');
    expect(mic.calls.some((c) => c.path.includes('gcn_vcx'))).toBe(false);
  });

  it('gửi ảnh trước khi cấp khi chưa gửi', async () => {
    const mic = new FakeMic();
    const realFetch = global.fetch;
    global.fetch = jest.fn(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
    ) as typeof fetch;
    try {
      mic.responses.set('/gcn_vcx', {
        status: 200,
        body: { code: '00', message: 'ok', data: { contact_number: 'C1', id_number: '9' } },
      });
      const urls = ['f', 'l', 'r', 'b', 'i'].map((k) => `https://cdn.test/${k}.jpg`);
      const r = await new MicInsurancePartner(mic, silent).issue(
        request({ photosSent: false, vehicle: { ...request().vehicle, photoUrls: urls } }),
      );
      expect(r).toMatchObject({ ok: true, photosSent: true });
      const uploads = mic.calls.filter((c) => c.path.includes('upload-file'));
      expect(uploads).toHaveLength(5);
      expect(uploads[0]!.body).toMatchObject({
        refer: 'XP0123456789ABCDEFGH',
        fileExtension: 'jpg',
      });
      const firstUpload = mic.calls.findIndex((c) => c.path.includes('upload-file'));
      expect(firstUpload).toBeLessThan(
        mic.calls.findIndex((c) => c.path.includes('gcn_vcx_validate')),
      );
    } finally {
      global.fetch = realFetch;
    }
  });
});

describe('tiện ích hợp đồng MIC', () => {
  it('hiệu lực = giao xe + 5 phút, làm tròn lên phút; không sớm hơn hiện tại + 5 phút', () => {
    const w = coverageWindow(
      request({
        trip: {
          pickupAt: NOW,
          returnAt: new Date('2026-12-12T11:00:00Z'),
          handedOverAt: new Date('2026-12-10T01:30:20Z'),
        },
      }),
      NOW,
    );
    expect(w.from.toISOString()).toBe('2026-12-10T02:05:00.000Z');
    expect(w.to.toISOString()).toBe('2026-12-12T11:00:00.000Z');
    expect(w.problem).toBeNull();
    const late = coverageWindow(
      request({
        trip: { pickupAt: NOW, returnAt: new Date('2026-12-10T02:03:00Z'), handedOverAt: NOW },
      }),
      NOW,
    );
    expect(late.problem).not.toBeNull();
  });

  it('ngày giờ Việt Nam hai chiều', () => {
    expect(vnDate(NOW)).toBe('10/12/2026');
    expect(vnTime(NOW)).toBe('09:00');
    expect(parseVnDateTime('10/12/2026', '09:00')?.toISOString()).toBe(NOW.toISOString());
    expect(parseVnDateTime('bad', '09:00')).toBeNull();
  });

  it('mã giao dịch ≤ 20 ký tự, tất định theo hợp đồng', () => {
    const ref = partnerRefFor('01JABCDEFGHJKMNPQRSTVWXYZ0');
    expect(ref).toHaveLength(20);
    expect(ref).toBe(partnerRefFor('01JABCDEFGHJKMNPQRSTVWXYZ0'));
  });

  it('ảnh gửi MIC theo thứ tự trước · trái · phải · sau · nội thất, bỏ ảnh phụ', () => {
    const urls = insurancePhotoUrls('car', [
      { imageUrl: 'rear', imageType: 'rear', sortOrder: 0 },
      { imageUrl: 'extra', imageType: 'other', sortOrder: 1 },
      { imageUrl: 'front', imageType: 'front', sortOrder: 2 },
      { imageUrl: 'interior', imageType: 'interior', sortOrder: 3 },
      { imageUrl: 'right', imageType: 'right', sortOrder: 4 },
      { imageUrl: 'left', imageType: 'left', sortOrder: 5 },
    ]);
    expect(urls).toEqual(['front', 'left', 'right', 'rear', 'interior']);
  });
});
