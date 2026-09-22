import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import type { GeoPoint } from '@xeprime/domain';
import {
  DELIVERY_DISTANCE_STATUS,
  DELIVERY_MANUAL_REASON,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { GeoService } from '../src/modules/geo/geo.service';
import { GeoNotConfiguredProvider, type GeoProvider } from '../src/modules/geo/geo-provider';
import { GeoapifyGeoProvider } from '../src/modules/geo/geoapify-geo.provider';
import { DeliveryDistanceService } from '../src/modules/pricing/delivery-distance.service';
import type { SaveRentalPolicyDto } from '../src/modules/pricing/dto/pricing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePricingService, makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Tích hợp bản đồ cho giao xe tận nơi (24/08/2026), chạy trên PostgreSQL THẬT.
 *
 * Nhà cung cấp bản đồ là một `FakeGeoProvider` ĐẾM SỐ LẦN GỌI — không có request thật nào rời
 * khỏi máy. Cái được kiểm ở đây chính là thứ quyết định hạn mức miễn phí có đủ dùng hay không:
 *
 *   1. cache trả lời lần thứ hai mà không hỏi lại nhà cung cấp;
 *   2. ca "không tìm thấy" cũng được nhớ (nếu không, một địa chỉ gõ sai đốt một request cho MỖI
 *      lần người dùng bấm lại);
 *   3. lọc trước bằng đường chim bay kết luận "ngoài bán kính" mà KHÔNG gọi Routes API.
 *
 * Ba điều đó là toàn bộ lý do 3.000 credit/ngày của gói Geoapify miễn phí đủ dùng, nên chúng
 * phải có test — nếu không, một lần refactor vô tình bỏ cache sẽ chỉ lộ ra khi hạn mức cạn giữa
 * ban ngày.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const pricing = makePricingService(asService);
const vehicles = makeVehiclesService(asService);
const createVehicle = vehicleCreator(vehicles, asService);

/** Chi nhánh giữ xe: Bến Thành, Quận 1. */
const BRANCH_POINT: GeoPoint = { lat: 10.7721, lng: 106.698 };
/** Địa chỉ khách "gần" — đủ trong bán kính 10km. */
const NEAR_ADDRESS = '12 Nguyễn Huệ, Quận 1, TP.HCM';
const NEAR_POINT: GeoPoint = { lat: 10.7743, lng: 106.7038 };
/** Địa chỉ khách ở Hà Nội — đường chim bay ~1140km, chắc chắn ngoài mọi bán kính. */
const FAR_ADDRESS = '1 Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội';
const FAR_POINT: GeoPoint = { lat: 21.0287, lng: 105.8524 };

/**
 * Nhà cung cấp giả — trả kết quả cố định và ĐẾM số lần bị gọi.
 *
 * Bộ đếm là phần quan trọng nhất của test này: một provider giả chỉ trả đúng dữ liệu sẽ vẫn
 * xanh khi cache bị gỡ mất.
 */
class FakeGeoProvider implements GeoProvider {
  readonly name = 'fake';
  readonly enabled = true;
  geocodeCalls = 0;
  routeCalls = 0;

  geocode(address: string): Promise<{
    point: GeoPoint;
    formattedAddress: string | null;
    placeId: string | null;
  } | null> {
    this.geocodeCalls += 1;
    if (address.includes('Nguyễn Huệ')) {
      return Promise.resolve({
        point: NEAR_POINT,
        formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
        placeId: 'fake-near',
      });
    }
    if (address.includes('Đinh Tiên Hoàng')) {
      return Promise.resolve({
        point: FAR_POINT,
        formattedAddress: '1 Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội',
        placeId: 'fake-far',
      });
    }
    return Promise.resolve(null);
  }

  roadDistanceKm(): Promise<number | null> {
    this.routeCalls += 1;
    // 1.2 km: rơi vào bậc đầu (0–3 km, miễn phí) của chính sách demo bên dưới.
    return Promise.resolve(1.2);
  }

  /*
   * Ba khả năng của ô nhập ĐỊA CHỈ (tìm địa điểm, chi tiết địa điểm, tra ngược từ ghim) không
   * tham gia vào phép tính khoảng cách giao xe — thứ spec này kiểm. Trả rỗng/null thay vì ném:
   * `GeoService` nuốt lỗi thành `null` ở mọi nhánh, nên một provider giả biết ném sẽ che mất
   * sự khác nhau giữa "không có kết quả" và "hỏi không được".
   */
  searchPlaces(): Promise<[]> {
    return Promise.resolve([]);
  }

  placeDetails(): Promise<null> {
    return Promise.resolve(null);
  }

  reverseGeocode(): Promise<null> {
    return Promise.resolve(null);
  }
}

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let provider: FakeGeoProvider;
let geo: GeoService;
let distance: DeliveryDistanceService;

/** Cùng bộ bậc phí với `rental-pricing.spec.ts`: 0–3 miễn phí, 3–5: 30k, 5–10: 50k. */
function policyDto(over: Partial<SaveRentalPolicyDto> = {}): SaveRentalPolicyDto {
  return {
    collateralMode: 'cash',
    collateralAssetTypes: [],
    depositAmount: '5000000',
    deliveryEnabled: true,
    deliveryMaxRadiusKm: 10,
    deliveryTiers: [
      { toKm: 3, fee: '0' },
      { toKm: 5, fee: '30000' },
      { toKm: 10, fee: '50000' },
    ],
    overtimeFeePerHour: null,
    overtimeGraceMinutes: null,
    overtimeRoundingMinutes: null,
    discountEnabled: false,
    discountTiers: [],
    ...over,
  };
}

/**
 * Xoá sạch cache giữa các test — mỗi test tự quyết định trạng thái cache nó cần.
 *
 * Dọn CẢ hai tên nhà cung cấp, không chỉ `fake`: suite cuối file chạy provider thật (tên
 * `geoapify`), và nếu một assertion ở đó fail thì bước dọn cuối của nó không bao giờ chạy. Lần
 * chạy kế tiếp sẽ đọc trúng cache còn sót, thấy 0 request, rồi fail ở một chỗ KHÁC hẳn nguyên
 * nhân — kiểu hỏng tốn cả buổi để lần ra.
 */
async function clearGeoCache(): Promise<void> {
  const providers = { in: ['fake', 'geoapify'] };
  await prisma.geocodeCache.deleteMany({ where: { provider: providers } });
  await prisma.geoRouteCache.deleteMany({ where: { provider: providers } });
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop Geo', email: `geo-${ownerId}@xeprime.test` },
  });
  tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Geo',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  const v = await createVehicle(tenantId, ownerId, {
    code: 'GEO-1',
    name: 'Toyota Vios Geo',
    vehicleType: VEHICLE_TYPE.CAR,
    weekdayPrice: '800000',
  });
  vehicleId = v.id;

  // Xe phải ĐANG CÔNG KHAI: `DeliveryDistanceService` cố ý dùng cùng cổng vào với public quote.
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { publicStatus: 'approved_public' },
  });
  // Chi nhánh giữ xe phải có toạ độ — đó là điểm đi của mọi phép đo.
  await prisma.tenantBranch.updateMany({
    where: { tenantId },
    data: { latitude: BRANCH_POINT.lat, longitude: BRANCH_POINT.lng },
  });

  await pricing.saveShopPolicy(tenantId, ownerId, policyDto());
});

beforeEach(() => {
  if (!dbAvailable) return;
  provider = new FakeGeoProvider();
  geo = new GeoService(asService, provider);
  distance = new DeliveryDistanceService(asService, pricing, geo);
});

afterAll(async () => {
  if (dbAvailable) {
    await clearGeoCache();
    await prisma.rentalPolicy.deleteMany({ where: { tenantId } });
    await prisma.publicListing.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('GeoService — cache là thứ giữ hạn mức miễn phí đủ dùng', () => {
  maybe('hỏi hai lần cùng một địa chỉ chỉ tốn MỘT request', async () => {
    await clearGeoCache();

    const first = await geo.geocode(NEAR_ADDRESS);
    const second = await geo.geocode(NEAR_ADDRESS);

    expect(first?.point).toEqual(NEAR_POINT);
    expect(first?.cached).toBe(false);
    expect(second?.cached).toBe(true);
    expect(provider.geocodeCalls).toBe(1);
  });

  maybe('khác nhau ở khoảng trắng/hoa-thường/dấu phẩy vẫn trúng cùng một khoá cache', async () => {
    await clearGeoCache();

    await geo.geocode(NEAR_ADDRESS);
    await geo.geocode('  12   NGUYỄN HUỆ ,, quận 1 , tp.hcm  ');

    expect(provider.geocodeCalls).toBe(1);
  });

  maybe('ca KHÔNG TÌM THẤY cũng được nhớ — bấm lại không đốt thêm request', async () => {
    await clearGeoCache();

    const first = await geo.geocode('địa chỉ không tồn tại xyz');
    const second = await geo.geocode('địa chỉ không tồn tại xyz');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(provider.geocodeCalls).toBe(1);

    // Bản ghi có mặt với toạ độ NULL — đó là hình dạng của một câu trả lời "không có".
    const rows = await prisma.geocodeCache.findMany({ where: { provider: 'fake' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.latitude).toBeNull();
  });

  maybe('lọc trước bằng đường chim bay: ngoài bán kính thì KHÔNG gọi Routes API', async () => {
    await clearGeoCache();

    const res = await geo.roadDistance(BRANCH_POINT, FAR_POINT, 10);

    // Kết luận nói RÕ vì sao, và mang theo con số chim bay đã dùng để kết luận — người gọi phải
    // phân biệt được ca này với ca "không có đường bộ" và ca "không hỏi được".
    expect(res.outcome).toBe('outside_radius');
    expect(res.outcome === 'outside_radius' && res.straightLineKm).toBeGreaterThan(1000);
    expect(provider.routeCalls).toBe(0);
  });

  maybe('không có tuyến đường bộ → no_route, KHÔNG phải ngoài bán kính', async () => {
    await clearGeoCache();
    // Nhà cung cấp trả lời bình thường, nhưng câu trả lời là "không có đường".
    provider.roadDistanceKm = () => {
      provider.routeCalls += 1;
      return Promise.resolve(null);
    };

    const res = await geo.roadDistance(BRANCH_POINT, NEAR_POINT, 10);

    expect(res.outcome).toBe('no_route');
    expect(provider.routeCalls).toBe(1);
  });

  maybe('nhà cung cấp NÉM lỗi → unavailable, và KHÔNG ghi cache ca hỏng', async () => {
    await clearGeoCache();
    provider.roadDistanceKm = () => {
      provider.routeCalls += 1;
      return Promise.reject(new Error('HTTP 429'));
    };

    const res = await geo.roadDistance(BRANCH_POINT, NEAR_POINT, 10);

    expect(res.outcome).toBe('unavailable');
    // Nhớ một sự cố tạm thời trong 30 ngày tệ hơn nhiều so với tốn thêm một request.
    expect(await prisma.geoRouteCache.count({ where: { provider: 'fake' } })).toBe(0);
  });

  maybe('trong bán kính thì có gọi, và lần thứ hai đọc cache', async () => {
    await clearGeoCache();

    const first = await geo.roadDistance(BRANCH_POINT, NEAR_POINT, 10);
    const second = await geo.roadDistance(BRANCH_POINT, NEAR_POINT, 10);

    expect(first).toEqual({ outcome: 'ok', distanceKm: 1.2 });
    expect(second).toEqual({ outcome: 'ok', distanceKm: 1.2 });
    expect(provider.routeCalls).toBe(1);
  });

  /**
   * Khoá route được làm tròn về lưới ~110m trước khi băm, nên hai lần hỏi cùng một chuyến giao
   * (khách bấm lại, GPS nhích vài mét) dùng chung một bản ghi.
   *
   * Đây là lưới, không phải bán kính: hai điểm nằm hai bên MỘT CẠNH ô vẫn ra hai khoá dù chỉ
   * cách nhau vài mét. Đó là đánh đổi đã chấp nhận — cái giá của một lần trượt cache ở biên rẻ
   * hơn nhiều so với một khoá cache mờ.
   */
  maybe('toạ độ nhích vài mét trong cùng ô lưới dùng chung một bản ghi cache', async () => {
    await clearGeoCache();

    await geo.roadDistance(BRANCH_POINT, NEAR_POINT, 10);
    await geo.roadDistance(
      BRANCH_POINT,
      { lat: NEAR_POINT.lat + 0.00004, lng: NEAR_POINT.lng - 0.00004 },
      10,
    );

    expect(provider.routeCalls).toBe(1);
    expect(await prisma.geoRouteCache.count({ where: { provider: 'fake' } })).toBe(1);
  });

  maybe('chưa cấu hình nhà cung cấp → không ném lỗi ra luồng đặt xe', async () => {
    const offline = new GeoService(asService, new GeoNotConfiguredProvider());

    await expect(offline.geocode(NEAR_ADDRESS)).resolves.toBeNull();
    await expect(offline.roadDistance(BRANCH_POINT, NEAR_POINT)).resolves.toEqual({
      outcome: 'unavailable',
    });
    expect(offline.enabled).toBe(false);
  });
});

describe('DeliveryDistanceService — năm trạng thái, không trạng thái nào là lỗi', () => {
  maybe('trong bán kính → auto, kèm phí đúng bậc và địa chỉ bản đồ hiểu ra', async () => {
    await clearGeoCache();

    const res = await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.AUTO);
    expect(res.distanceKm).toBe(1.2);
    // 1.2 km rơi vào bậc 0–3 km → miễn phí. Con số này đến từ `PricingService.deliveryFeeFor`,
    // không phải từ một phép tính thứ hai ở service bản đồ.
    expect(res.fee).toBe('0');
    expect(res.origin).toEqual(BRANCH_POINT);
    expect(res.destination).toEqual(NEAR_POINT);
    expect(res.formattedAddress).toContain('Nguyễn Huệ');
  });

  maybe('ngoài bán kính → manual, không phí, và không tốn request Routes', async () => {
    await clearGeoCache();

    const res = await distance.forListing(vehicleId, FAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.MANUAL);
    expect(res.manualReason).toBe(DELIVERY_MANUAL_REASON.OUTSIDE_AUTO_RADIUS);
    expect(res.fee).toBeNull();
    /*
     * Chỉ có đường CHIM BAY, và nó nằm ở đúng trường mang tên đó — `distanceKm` (đường bộ) phải
     * để trống, nếu không giao diện sẽ trưng một con số chim bay như quãng đường lái xe.
     */
    expect(res.distanceKm).toBeNull();
    expect(res.straightLineKm).toBeGreaterThan(1000);
    // Bán kính của chính sách đi kèm để giao diện nói đúng con số chủ xe đã đặt.
    expect(res.maxRadiusKm).toBe(10);
    // Vẫn trả toạ độ để giao diện ghim được bản đồ, dù không có phí dự kiến.
    expect(res.destination).toEqual(FAR_POINT);
    expect(provider.routeCalls).toBe(0);
  });

  /**
   * Ba ngả cùng rơi về `manual` nhưng KHÔNG cùng một câu với khách (21/09/2026).
   *
   * Trước đây cả ba dùng chung một dòng nói "ngoài phạm vi", nên một địa chỉ ngay trong thành
   * phố vẫn bị báo là quá xa chỉ vì nhà cung cấp bản đồ timeout — và khách đi sửa một địa chỉ
   * vốn đã đúng.
   */
  maybe('trong bán kính nhưng không có đường bộ → manual vì route_unavailable', async () => {
    await clearGeoCache();
    provider.roadDistanceKm = () => {
      provider.routeCalls += 1;
      return Promise.resolve(null);
    };

    const res = await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.MANUAL);
    expect(res.manualReason).toBe(DELIVERY_MANUAL_REASON.ROUTE_UNAVAILABLE);
    expect(res.distanceKm).toBeNull();
    expect(res.straightLineKm).toBeNull();
  });

  maybe('nhà cung cấp lỗi ở bước đo đường → manual vì provider_unavailable', async () => {
    await clearGeoCache();
    provider.roadDistanceKm = () => {
      provider.routeCalls += 1;
      return Promise.reject(new Error('HTTP 500'));
    };

    const res = await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.MANUAL);
    expect(res.manualReason).toBe(DELIVERY_MANUAL_REASON.PROVIDER_UNAVAILABLE);
    // Lỗi thô của nhà cung cấp KHÔNG được lọt ra response công khai.
    expect(JSON.stringify(res)).not.toContain('500');
  });

  maybe('đo được đường bộ nhưng bậc phí không phủ tới → vẫn là ngoài phạm vi tự báo', async () => {
    await clearGeoCache();
    // 12 km: trong bán kính lọc trước (chim bay ~0.7 km) nhưng vượt bậc cuối 10 km.
    provider.roadDistanceKm = () => {
      provider.routeCalls += 1;
      return Promise.resolve(12);
    };

    const res = await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.MANUAL);
    expect(res.manualReason).toBe(DELIVERY_MANUAL_REASON.OUTSIDE_AUTO_RADIUS);
    // Ở đây là đường BỘ thật — giao diện được phép gọi nó bằng đúng tên.
    expect(res.distanceKm).toBe(12);
    expect(res.fee).toBeNull();
  });

  maybe('không định vị được địa chỉ → address_not_found (khách sửa được)', async () => {
    await clearGeoCache();

    const res = await distance.forListing(vehicleId, 'chỗ nào đó không có thật');

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.ADDRESS_NOT_FOUND);
    expect(res.distanceKm).toBeNull();
  });

  maybe('chính sách tắt giao nhận → unsupported, và KHÔNG hỏi bản đồ lần nào', async () => {
    await clearGeoCache();
    await pricing.saveShopPolicy(
      tenantId,
      ownerId,
      policyDto({ deliveryEnabled: false, deliveryMaxRadiusKm: null, deliveryTiers: [] }),
    );

    const res = await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.UNSUPPORTED);
    expect(provider.geocodeCalls).toBe(0);

    await pricing.saveShopPolicy(tenantId, ownerId, policyDto());
  });

  maybe('chi nhánh chưa có toạ độ → unavailable, KHÔNG đoán tâm tỉnh', async () => {
    await clearGeoCache();
    await prisma.tenantBranch.updateMany({
      where: { tenantId },
      data: { latitude: null, longitude: null },
    });

    const res = await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.UNAVAILABLE);
    expect(res.origin).toBeNull();
    expect(provider.geocodeCalls).toBe(0);

    await prisma.tenantBranch.updateMany({
      where: { tenantId },
      data: { latitude: BRANCH_POINT.lat, longitude: BRANCH_POINT.lng },
    });
  });

  maybe('chưa cấu hình bản đồ → unavailable, luồng đặt xe không hề gãy', async () => {
    const offline = new DeliveryDistanceService(
      asService,
      pricing,
      new GeoService(asService, new GeoNotConfiguredProvider()),
    );

    const res = await offline.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.UNAVAILABLE);
  });

  maybe('xe không công khai → 404, endpoint public không dò được vị trí xe ẩn', async () => {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { publicStatus: 'draft' },
    });

    await expect(distance.forListing(vehicleId, NEAR_ADDRESS)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });

    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { publicStatus: 'approved_public' },
    });
  });
});

/**
 * Toàn chuỗi với NHÀ CUNG CẤP THẬT — trả lời đúng câu "cắm key vào thì có chạy không".
 *
 * Khác mọi test ở trên: `GeoapifyGeoProvider` thật, `GeoService` thật, `PricingService` thật,
 * dữ liệu trên PostgreSQL thật. Thứ DUY NHẤT bị thay là máy chủ của Geoapify — `fetch` trả về
 * đúng hình response mà API của họ trả (hình đó được khoá riêng ở `geoapify-geo-provider.spec.ts`).
 *
 * Nói cách khác: nếu suite này xanh, phần còn thiếu để tính năng chạy thật đúng bằng một chuỗi
 * ký tự trong `.env`.
 */
describe('cắm nhà cung cấp thật vào — chuỗi đầy đủ, chỉ máy chủ Geoapify là giả', () => {
  const FAKE_KEY = 'e2e-test-key';
  const realFetch = global.fetch;
  let fetchCalls = 0;

  /** Trả response theo ĐÚNG hình của Geocoding API và Routing API (`format=json`). */
  function stubGeoapify(): void {
    fetchCalls = 0;
    global.fetch = ((url: string | URL) => {
      fetchCalls += 1;
      const href = String(url);
      if (href.includes('/geocode/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                {
                  lat: NEAR_POINT.lat,
                  lon: NEAR_POINT.lng,
                  formatted: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
                  place_id: '51abc_e2e',
                  // Trên ngưỡng `MIN_GEOCODE_CONFIDENCE` — dưới ngưỡng thì provider trả null và
                  // cả chuỗi này rơi về MANUAL, đó là một ca riêng ở spec của provider.
                  rank: { confidence: 0.9 },
                },
              ],
            }),
        } as Response);
      }
      // Routing API: 3421 m → 3.42 km → rơi vào bậc >3–5 km = 30.000₫.
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [{ distance: 3421 }] }),
      } as Response);
    }) as typeof fetch;
  }

  afterAll(() => {
    global.fetch = realFetch;
  });

  maybe('địa chỉ khách → toạ độ → km đường bộ → đúng bậc phí, và ghi cả hai bảng cache', async () => {
    await clearGeoCache();
    stubGeoapify();

    const config = { get: () => FAKE_KEY, getOrThrow: () => FAKE_KEY } as unknown as ConfigService;
    const liveGeo = new GeoService(asService, new GeoapifyGeoProvider(config));
    const liveDistance = new DeliveryDistanceService(asService, pricing, liveGeo);

    const res = await liveDistance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.AUTO);
    expect(res.distanceKm).toBe(3.42);
    // 3,42 km nằm trong bậc >3–5 km. Con số này đi ra từ `PricingService.deliveryFeeFor` đọc
    // chính sách THẬT trong DB — không phải một hằng số viết trong test.
    expect(res.fee).toBe('30000');
    expect(res.origin).toEqual(BRANCH_POINT);
    expect(res.destination).toEqual(NEAR_POINT);
    expect(res.formattedAddress).toContain('Bến Nghé');

    // Đúng hai lượt gọi ra ngoài cho một lần tra: 1 geocode + 1 routes.
    expect(fetchCalls).toBe(2);

    const geocodeRow = await prisma.geocodeCache.findFirst({ where: { provider: 'geoapify' } });
    // Mã địa điểm là TOẠ ĐỘ (xem `placeToken`), không phải `place_id` thô của Geoapify.
    expect(geocodeRow?.placeId).toBe('gp1:10.7743,106.7038');
    const routeRow = await prisma.geoRouteCache.findFirst({ where: { provider: 'geoapify' } });
    expect(Number(routeRow?.distanceKm)).toBe(3.42);

    // Lần thứ hai đọc sạch từ cache — KHÔNG một request nào nữa. Đây là thứ quyết định hạn mức
    // 3.000 credit/ngày có đủ dùng hay không, nên nó phải đúng với provider thật chứ không chỉ provider giả.
    const again = await liveDistance.forListing(vehicleId, NEAR_ADDRESS);
    expect(again.status).toBe(DELIVERY_DISTANCE_STATUS.AUTO);
    expect(again.fee).toBe('30000');
    expect(fetchCalls).toBe(2);

    await prisma.geocodeCache.deleteMany({ where: { provider: 'geoapify' } });
    await prisma.geoRouteCache.deleteMany({ where: { provider: 'geoapify' } });
  });
});
