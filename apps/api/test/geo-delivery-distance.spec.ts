import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import { addressGeocodeQuery, type GeoPoint } from '@xeprime/domain';
import {
  ACCOUNT_REALM,
  DELIVERY_DISTANCE_STATUS,
  DELIVERY_MANUAL_REASON,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { GeoService } from '../src/modules/geo/geo.service';
import {
  GeoNotConfiguredProvider,
  type GeoProvider,
  type PlaceDetail,
  type PlaceSuggestion,
} from '../src/modules/geo/geo-provider';
import { VietmapGeoProvider } from '../src/modules/geo/vietmap-geo.provider';
import { DeliveryDistanceService } from '../src/modules/pricing/delivery-distance.service';
import { PickupMapService } from '../src/modules/pricing/pickup-map.service';
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
 * Vietmap tính tiền theo giao dịch (ADR 0061), nên ba điều đó — cộng hai lớp tiết kiệm ở ô gợi ý
 * địa chỉ — là toàn bộ lý do chi phí bản đồ giữ ở mức thấp. Chúng phải có test: nếu không, một lần
 * refactor vô tình bỏ cache sẽ chỉ lộ ra ở hoá đơn cuối tháng.
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
  /** Chuỗi cuối cùng được gửi đi tra — khoá luật "cùng chuỗi với lúc gửi yêu cầu". */
  lastGeocodeQuery: string | null = null;

  geocode(address: string): Promise<{
    point: GeoPoint;
    formattedAddress: string | null;
    placeId: string | null;
  } | null> {
    this.geocodeCalls += 1;
    this.lastGeocodeQuery = address;
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
  searchPlaces(): Promise<PlaceSuggestion[]> {
    return Promise.resolve([]);
  }

  placeDetails(_placeId: string): Promise<PlaceDetail | null> {
    return Promise.resolve(null);
  }

  reverseGeocode(): Promise<null> {
    return Promise.resolve(null);
  }

  staticMapCalls = 0;
  lastStaticLabel: string | null = null;
  staticMapPng(_point: GeoPoint, label: string): Promise<Buffer> {
    this.staticMapCalls += 1;
    this.lastStaticLabel = label;
    return Promise.resolve(Buffer.from('png'));
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
 * `vietmap`), và nếu một assertion ở đó fail thì bước dọn cuối của nó không bao giờ chạy. Lần
 * chạy kế tiếp sẽ đọc trúng cache còn sót, thấy 0 request, rồi fail ở một chỗ KHÁC hẳn nguyên
 * nhân — kiểu hỏng tốn cả buổi để lần ra.
 */
async function clearGeoCache(): Promise<void> {
  const providers = { in: ['fake', 'vietmap'] };
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
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ shop Geo',
      email: `geo-${ownerId}@xeprime.test`,
    },
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
    // Nhớ một sự cố tạm thời trong 90 ngày tệ hơn nhiều so với tốn thêm một request.
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

  /**
   * Danh sách rỗng và `null` là hai câu trả lời khác nhau: rỗng = gõ tiếp hoặc dùng địa chỉ đã gõ,
   * `null` = ô địa chỉ phải mở cho nhập tay (controller trả `available: false`).
   */
  maybe('gợi ý địa điểm: không có kết quả → [], nhà cung cấp hỏng → null', async () => {
    await expect(geo.searchPlaces('Nguyễn Huệ')).resolves.toEqual([]);

    provider.searchPlaces = () => Promise.reject(new Error('Autocomplete: OVER_DAILY_LIMIT'));
    // Chuỗi KHÁC — chuỗi trên đã nằm trong cache gợi ý 10 phút.
    await expect(geo.searchPlaces('Lê Lợi')).resolves.toBeNull();
  });

  /**
   * Gợi ý của Vietmap KHÔNG kèm toạ độ, nên "chọn gợi ý" là một lượt Place thật (ADR 0061 điều 3).
   * Cache theo mã địa điểm: mở lại form sửa, hay hai khách chọn cùng một chỗ, chỉ tốn MỘT lượt.
   */
  maybe('chọn cùng một địa điểm hai lần → nhà cung cấp chỉ bị hỏi MỘT lần', async () => {
    await clearGeoCache();
    let detailCalls = 0;
    provider.placeDetails = (placeId: string) => {
      detailCalls += 1;
      return Promise.resolve({
        placeId,
        point: NEAR_POINT,
        formattedAddress: '12 Nguyễn Huệ, Phường Sài Gòn, Thành Phố Hồ Chí Minh',
        administrativeArea: 'Thành Phố Hồ Chí Minh',
        locality: 'Phường Sài Gòn',
      });
    };

    const first = await geo.placeDetailsOutcome('auto:near');
    const second = await geo.placeDetailsOutcome('auto:near');

    expect(detailCalls).toBe(1);
    expect(first.outcome === 'ok' && first.detail.point).toEqual(NEAR_POINT);
    expect(second.outcome === 'ok' && second.detail).toEqual({
      placeId: 'auto:near',
      point: NEAR_POINT,
      formattedAddress: '12 Nguyễn Huệ, Phường Sài Gòn, Thành Phố Hồ Chí Minh',
      // Tỉnh đọc lại từ chính địa chỉ đầy đủ — luồng khách thuê vẫn có tỉnh để gợi ý (ADR 0042).
      administrativeArea: 'Thành Phố Hồ Chí Minh',
      locality: null,
    });
  });

  /**
   * `ref_id` của Vietmap dài theo địa chỉ và có thể vượt cột `place_id VarChar(255)`. Bản ghi cache
   * vẫn phải ghi được (khoá là mã băm) — nếu không, mỗi lần chọn lại địa điểm đó là một lượt tiền.
   */
  maybe('mã địa điểm dài hơn cột vẫn được cache; cột tham chiếu để trống', async () => {
    await clearGeoCache();
    const longId = `geocode:${'x'.repeat(400)}`;
    let detailCalls = 0;
    provider.placeDetails = (placeId: string) => {
      detailCalls += 1;
      return Promise.resolve({
        placeId,
        point: NEAR_POINT,
        formattedAddress: '12 Nguyễn Huệ, Phường Sài Gòn, Thành Phố Hồ Chí Minh',
        administrativeArea: 'Thành Phố Hồ Chí Minh',
        locality: null,
      });
    };

    await geo.placeDetailsOutcome(longId);
    const again = await geo.placeDetailsOutcome(longId);

    expect(detailCalls).toBe(1);
    expect(again.outcome === 'ok' && again.detail.placeId).toBe(longId);
    const row = await prisma.geocodeCache.findFirst({
      where: { provider: 'fake', query: `place:${longId}` },
    });
    expect(row).not.toBeNull();
    expect(row?.placeId).toBeNull();
  });

  /**
   * "Nhà cung cấp không trả lời" và "mã không ra gì" là hai câu khác nhau với khách: cái thứ nhất
   * mở ô cho nhập tay, cái thứ hai bảo chọn lại. Ca "không ra gì" được nhớ — một mã hỏng gửi lại
   * nhiều lần không được thành nhiều lượt tính tiền.
   */
  maybe('chi tiết địa điểm: unavailable ≠ not_found, và "không ra gì" được cache', async () => {
    await clearGeoCache();
    let detailCalls = 0;
    provider.placeDetails = () => {
      detailCalls += 1;
      return Promise.reject(new Error('Place: OVER_DAILY_LIMIT'));
    };
    await expect(geo.placeDetailsOutcome('auto:x')).resolves.toEqual({ outcome: 'unavailable' });
    // Lỗi KHÔNG được ghi cache — lần sau có thể hỏi được.
    await expect(geo.placeDetailsOutcome('auto:x')).resolves.toEqual({ outcome: 'unavailable' });
    expect(detailCalls).toBe(2);

    provider.placeDetails = () => {
      detailCalls += 1;
      return Promise.resolve(null);
    };
    await expect(geo.placeDetailsOutcome('auto:x')).resolves.toEqual({ outcome: 'not_found' });
    await expect(geo.placeDetailsOutcome('auto:x')).resolves.toEqual({ outcome: 'not_found' });
    expect(detailCalls).toBe(3);
  });

  /** Lớp tiết kiệm thứ hai: cùng chuỗi + cùng vùng (làm tròn ~1km) trong 10 phút → một lượt gọi. */
  maybe('gõ lại cùng chuỗi trong cùng vùng → nhà cung cấp chỉ bị hỏi MỘT lần', async () => {
    let searchCalls = 0;
    provider.searchPlaces = () => {
      searchCalls += 1;
      return Promise.resolve([]);
    };

    await geo.searchPlaces('Trần Hưng Đạo', { lat: 16.0544, lng: 108.2022 });
    await geo.searchPlaces('  trần hưng   đạo ', { lat: 16.0539, lng: 108.2018 });
    expect(searchCalls).toBe(1);

    // Vùng khác hẳn (tỉnh khác) là câu hỏi khác.
    await geo.searchPlaces('Trần Hưng Đạo', { lat: 10.7721, lng: 106.698 });
    expect(searchCalls).toBe(2);
  });

  maybe('tra địa chỉ: phân biệt not_found với unavailable', async () => {
    await clearGeoCache();

    await expect(geo.geocodeOutcome('địa chỉ không tồn tại xyz')).resolves.toEqual({
      outcome: 'not_found',
    });

    provider.geocode = () => Promise.reject(new Error('HTTP 429'));
    await expect(geo.geocodeOutcome(NEAR_ADDRESS)).resolves.toEqual({ outcome: 'unavailable' });
  });

  /**
   * Ảnh bản đồ tĩnh (ADR 0061 điều 1): mỗi lần vẽ là một lượt tính tiền, còn một trang xe được mở
   * hàng trăm lần. Cache theo điểm + nhãn, và các lượt mở CÙNG LÚC dùng chung một lượt vẽ.
   */
  maybe('bản đồ tĩnh: vẽ MỘT lần cho một điểm, kể cả khi nhiều người mở cùng lúc', async () => {
    const point = { lat: 21.004941, lng: 105.804331 };
    const label = 'Đường Lê Văn Lương, Hà Nội';

    const [a, b] = await Promise.all([geo.staticMap(point, label), geo.staticMap(point, label)]);
    const c = await geo.staticMap(point, label);

    expect(provider.staticMapCalls).toBe(1);
    expect(a).toBe(b);
    expect(c).toBe(a);

    // Chi nhánh dời đi (toạ độ khác) là một ảnh khác.
    await geo.staticMap({ lat: 21.01, lng: 105.81 }, label);
    expect(provider.staticMapCalls).toBe(2);
  });

  /**
   * `/places/map` nhận MÃ từ client. Chỉ mã đã qua `placeDetails` (đã có toạ độ trong cache) mới
   * được vẽ — vẽ cho mọi mã là để ai cũng tiêu tiền bằng những mã bịa, mỗi mã một lượt.
   */
  maybe('bản đồ của địa điểm vừa chọn: chỉ vẽ cho mã đã tra, mã lạ không tốn lượt nào', async () => {
    await clearGeoCache();
    provider.placeDetails = (placeId: string) =>
      Promise.resolve({
        placeId,
        point: NEAR_POINT,
        formattedAddress: '12 Nguyễn Huệ, Phường Sài Gòn, Thành Phố Hồ Chí Minh',
        administrativeArea: 'Thành Phố Hồ Chí Minh',
        locality: null,
      });

    await expect(geo.placeMap('auto:chua-ai-chon')).resolves.toBeNull();
    expect(provider.staticMapCalls).toBe(0);

    await geo.placeDetailsOutcome('auto:near-map');
    await expect(geo.placeMap('auto:near-map')).resolves.toEqual(Buffer.from('png'));
    expect(provider.staticMapCalls).toBe(1);
    // Ảnh chở đúng dòng địa chỉ đã tra — Vietmap không phải tự tra ngược thêm một lượt.
    expect(provider.lastStaticLabel).toBe('12 Nguyễn Huệ, Phường Sài Gòn, Thành Phố Hồ Chí Minh');
  });

  /**
   * Mã `gp1:` cũ mang sẵn toạ độ. Nó được giải tại chỗ nhưng KHÔNG được vào cache — nếu không,
   * `gp1:<toạ độ bịa>` rồi `/places/map` là cách vẽ bản đồ bất kỳ đâu bằng tiền của mình.
   */
  maybe('mã gp1: cũ giải tại chỗ, không hỏi nhà cung cấp, không ghi cache, không có ảnh', async () => {
    await clearGeoCache();
    let detailCalls = 0;
    provider.placeDetails = () => {
      detailCalls += 1;
      return Promise.resolve(null);
    };
    const legacyId = 'gp1:16.0544,108.2022';

    const res = await geo.placeDetailsOutcome(legacyId);

    expect(res.outcome === 'ok' && res.detail.point).toEqual({ lat: 16.0544, lng: 108.2022 });
    expect(detailCalls).toBe(0);
    await expect(
      prisma.geocodeCache.count({ where: { query: `place:${legacyId}` } }),
    ).resolves.toBe(0);
    await expect(geo.placeMap(legacyId)).resolves.toBeNull();
    expect(provider.staticMapCalls).toBe(0);
  });

  /**
   * Lỗi trả `no-store`: không nhớ lỗi thì mỗi lượt mở trang xe lúc nhà cung cấp trục trặc là một
   * lượt tính tiền nữa cho cùng một tấm ảnh trang trí.
   */
  maybe('bản đồ tĩnh: nhà cung cấp lỗi → null, và NHỚ lỗi một lúc rồi mới thử lại', async () => {
    let calls = 0;
    provider.staticMapPng = () => {
      calls += 1;
      return Promise.reject(new Error('Static map trả HTTP 503'));
    };
    const point = { lat: 16.0544, lng: 108.2022 };
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(Date.parse('2026-10-15T03:00:00Z'));
      await expect(geo.staticMap(point, 'Đà Nẵng')).resolves.toBeNull();
      await expect(geo.staticMap(point, 'Đà Nẵng')).resolves.toBeNull();
      expect(calls).toBe(1);

      // Hết thời gian nhớ lỗi → thử lại đúng một lần.
      now.mockReturnValue(Date.parse('2026-10-15T03:11:00Z'));
      await expect(geo.staticMap(point, 'Đà Nẵng')).resolves.toBeNull();
      expect(calls).toBe(2);
    } finally {
      now.mockRestore();
    }
  });

  maybe('bản đồ tĩnh: cache có trần — ảnh lâu không ai xem bị đẩy ra, mở lại thì vẽ lại', async () => {
    const first = { lat: 10.5, lng: 106.5 };
    await geo.staticMap(first, 'Điểm đầu');
    for (let i = 1; i <= 200; i += 1) {
      await geo.staticMap({ lat: 10.5 + i / 1000, lng: 106.5 }, 'Điểm khác');
    }
    expect(provider.staticMapCalls).toBe(201);

    await geo.staticMap(first, 'Điểm đầu');
    expect(provider.staticMapCalls).toBe(202);
  });

  maybe('chưa cấu hình nhà cung cấp → không ném lỗi ra luồng đặt xe', async () => {
    const offline = new GeoService(asService, new GeoNotConfiguredProvider());

    await expect(offline.geocode(NEAR_ADDRESS)).resolves.toBeNull();
    await expect(offline.geocodeOutcome(NEAR_ADDRESS)).resolves.toEqual({
      outcome: 'unavailable',
    });
    await expect(offline.searchPlaces('Nguyễn Huệ')).resolves.toBeNull();
    await expect(offline.staticMap(NEAR_POINT, 'Nguyễn Huệ')).resolves.toBeNull();
    await expect(offline.roadDistance(BRANCH_POINT, NEAR_POINT)).resolves.toEqual({
      outcome: 'unavailable',
    });
    expect(offline.enabled).toBe(false);
  });
});

describe('DeliveryDistanceService — năm trạng thái, không trạng thái nào là lỗi', () => {
  /**
   * Địa chỉ GÕ TAY được tra bằng ĐÚNG chuỗi `AddressService` sẽ tra lúc khách gửi yêu cầu (dòng
   * địa chỉ + tỉnh + "Việt Nam"): hai lượt dùng chung một bản ghi cache, nên lần gửi không tốn thêm
   * giao dịch nào — và "12 Lê Lợi" trơ trọi không khớp nhầm sang tỉnh khác.
   */
  maybe('địa chỉ gõ tay → tra kèm tỉnh của chi nhánh, đúng chuỗi lúc gửi yêu cầu', async () => {
    await clearGeoCache();
    const branch = await prisma.tenantBranch.findFirst({
      where: { tenantId },
      select: { province: { select: { name: true } } },
    });

    await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(provider.lastGeocodeQuery).toBe(
      addressGeocodeQuery({
        addressLine: NEAR_ADDRESS,
        wardName: null,
        provinceName: branch?.province?.name ?? null,
      }),
    );
  });

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

  /**
   * Có key nhưng nhà cung cấp không trả lời được (key bị từ chối, hết hạn mức, lỗi mạng). Bản trước chỉ xét `geo.enabled` nên ca này rơi vào `address_not_found` — báo khách
   * gõ sai địa chỉ về một sự cố của chính hệ thống.
   */
  maybe('nhà cung cấp hỏng khi tra địa chỉ → unavailable, KHÔNG đổ lỗi cho địa chỉ', async () => {
    await clearGeoCache();
    provider.geocode = () => {
      provider.geocodeCalls += 1;
      return Promise.reject(new Error('Geocoding API: REQUEST_DENIED billing'));
    };

    const res = await distance.forListing(vehicleId, NEAR_ADDRESS);

    expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.UNAVAILABLE);
    expect(res.fee).toBeNull();
    // Ca hỏng không được nhớ: lần sau hỏi lại được ngay khi billing được nối lại.
    expect(await prisma.geocodeCache.count({ where: { provider: 'fake' } })).toBe(0);
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
 * Ảnh điểm nhận xe trên trang xe công khai (ADR 0061 điều 1). Endpoint công khai, nên mọi nhánh
 * "không có ảnh" phải trả 404 TRƯỚC khi chạm tới nhà cung cấp tính tiền.
 */
describe('PickupMapService — ảnh điểm nhận xe chỉ cho xe trên chợ, đúng quy tắc toạ độ của trang xe', () => {
  let maps: PickupMapService;
  let originalAddress: string | null;

  beforeEach(async () => {
    if (!dbAvailable) return;
    maps = new PickupMapService(asService, geo);
    const branch = await prisma.tenantBranch.findFirst({ where: { tenantId }, select: { address: true } });
    originalAddress = branch?.address ?? null;
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await prisma.tenantBranch.updateMany({ where: { tenantId }, data: { address: originalAddress } });
  });

  maybe('chi nhánh có địa chỉ + toạ độ → ảnh, nhãn là địa chỉ chi nhánh', async () => {
    await prisma.tenantBranch.updateMany({
      where: { tenantId },
      data: { address: '1 Lê Lợi, Phường Sài Gòn, Thành Phố Hồ Chí Minh' },
    });

    await expect(maps.forListing(vehicleId)).resolves.toEqual(Buffer.from('png'));
    expect(provider.lastStaticLabel).toBe('1 Lê Lợi, Phường Sài Gòn, Thành Phố Hồ Chí Minh');
  });

  maybe('chi nhánh có toạ độ nhưng KHÔNG có địa chỉ → 404, không vẽ (trang xe cũng ẩn toạ độ)', async () => {
    await prisma.tenantBranch.updateMany({ where: { tenantId }, data: { address: null } });

    await expect(maps.forListing(vehicleId)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    expect(provider.staticMapCalls).toBe(0);
  });

  maybe('xe không trên chợ → 404, không vẽ', async () => {
    await prisma.tenantBranch.updateMany({ where: { tenantId }, data: { address: '1 Lê Lợi, Hồ Chí Minh' } });
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { publicStatus: 'draft' } });
    try {
      await expect(maps.forListing(vehicleId)).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
      expect(provider.staticMapCalls).toBe(0);
    } finally {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { publicStatus: 'approved_public' } });
    }
  });
});

/**
 * Toàn chuỗi với NHÀ CUNG CẤP THẬT — trả lời đúng câu 'cắm key vào thì có chạy không'.
 *
 * Khác mọi test ở trên: `VietmapGeoProvider` thật, `GeoService` thật, `PricingService` thật,
 * dữ liệu trên PostgreSQL thật. Thứ DUY NHẤT bị thay là máy chủ của Vietmap — `fetch` trả về
 * đúng hình response mà API của họ trả (hình đó được khoá riêng ở `vietmap-geo-provider.spec.ts`).
 *
 * Nói cách khác: nếu suite này xanh, phần còn thiếu để tính năng chạy thật đúng bằng một chuỗi
 * ký tự trong `.env`.
 */
describe('cắm nhà cung cấp thật vào — chuỗi đầy đủ, chỉ máy chủ Vietmap là giả', () => {
  const FAKE_KEY = 'e2e-test-key';
  const realFetch = global.fetch;
  let fetchCalls = 0;
  const urls: string[] = [];

  const json = (body: unknown): Promise<Response> =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

  /** Trả response theo ĐÚNG hình của Search v4, Place v4 và Route v4 (Vietmap Maps API). */
  function stubVietmap(): void {
    fetchCalls = 0;
    urls.length = 0;
    global.fetch = ((url: string | URL) => {
      fetchCalls += 1;
      const href = String(url);
      urls.push(href);
      if (href.includes('/search/v4')) {
        // Search KHÔNG có toạ độ — chỉ `ref_id` để tra tiếp bằng Place.
        return json([
          {
            ref_id: 'geocode:near',
            name: '12 Nguyễn Huệ',
            address: 'Phường Sài Gòn,Thành Phố Hồ Chí Minh',
            display: '12 Nguyễn Huệ Phường Sài Gòn,Thành Phố Hồ Chí Minh',
            boundaries: [
              { type: 2, name: 'Sài Gòn', full_name: 'Phường Sài Gòn' },
              { type: 0, name: 'Hồ Chí Minh', full_name: 'Thành Phố Hồ Chí Minh' },
            ],
          },
        ]);
      }
      if (href.includes('/place/v4')) {
        return json({
          display: '12 Nguyễn Huệ,Phường Sài Gòn,Thành Phố Hồ Chí Minh',
          city: 'Thành Phố Hồ Chí Minh',
          ward: 'Phường Sài Gòn',
          lat: NEAR_POINT.lat,
          lng: NEAR_POINT.lng,
        });
      }
      // Route v4: 3421 m → 3.42 km → rơi vào bậc >3–5 km = 30.000₫.
      return json({ code: 'OK', paths: [{ distance: 3421, time: 600000 }] });
    }) as typeof fetch;
  }

  afterAll(() => {
    global.fetch = realFetch;
  });

  maybe(
    'địa chỉ khách → toạ độ → km đường bộ → đúng bậc phí, và ghi cả hai bảng cache',
    async () => {
      await clearGeoCache();
      stubVietmap();

      const config = {
        get: (name: string) => (name === 'GEO_DAILY_CALL_BUDGET' ? undefined : FAKE_KEY),
        getOrThrow: () => FAKE_KEY,
      } as unknown as ConfigService;
      const liveGeo = new GeoService(asService, new VietmapGeoProvider(config));
      const liveDistance = new DeliveryDistanceService(asService, pricing, liveGeo);

      const res = await liveDistance.forListing(vehicleId, NEAR_ADDRESS);

      expect(res.status).toBe(DELIVERY_DISTANCE_STATUS.AUTO);
      expect(res.distanceKm).toBe(3.42);
      // 3,42 km nằm trong bậc >3–5 km. Con số này đi ra từ `PricingService.deliveryFeeFor` đọc
      // chính sách THẬT trong DB — không phải một hằng số viết trong test.
      expect(res.fee).toBe('30000');
      expect(res.origin).toEqual(BRANCH_POINT);
      expect(res.destination).toEqual(NEAR_POINT);
      expect(res.formattedAddress).toContain('Phường Sài Gòn');

      // Ba lượt gọi ra ngoài cho một địa chỉ GÕ TAY: search + place (gợi ý của Vietmap không có
      // toạ độ) + route. Khách chọn gợi ý thì báo giá gửi kèm toạ độ và chỉ còn lượt route.
      expect(fetchCalls).toBe(3);
      expect(urls.some((u) => u.includes('/route/v4'))).toBe(true);

      const geocodeRow = await prisma.geocodeCache.findFirst({ where: { provider: 'vietmap' } });
      expect(geocodeRow?.placeId).toBe('geocode:near');
      const routeRow = await prisma.geoRouteCache.findFirst({ where: { provider: 'vietmap' } });
      expect(Number(routeRow?.distanceKm)).toBe(3.42);

      // Lần thứ hai đọc sạch từ cache — KHÔNG một request nào nữa. Mỗi request là tiền, nên điều
      // này phải đúng với provider thật chứ không chỉ provider giả.
      const again = await liveDistance.forListing(vehicleId, NEAR_ADDRESS);
      expect(again.status).toBe(DELIVERY_DISTANCE_STATUS.AUTO);
      expect(again.fee).toBe('30000');
      expect(fetchCalls).toBe(3);

      await prisma.geocodeCache.deleteMany({ where: { provider: 'vietmap' } });
      await prisma.geoRouteCache.deleteMany({ where: { provider: 'vietmap' } });
    },
  );
});
