import { appWallClockToIso, toAppTz } from '@/lib/datetime';
import { describe, expect, it } from 'vitest';
import { ROUTE_TYPE, SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { MarketplaceFilters } from '../types';
import {
  buildSearchHref,
  draftFromFilters,
  draftToFilterPatch,
  searchContextSignature,
  serviceUsesRentalRange,
  type SearchDraft,
} from './search-draft';

/**
 * Đây là nơi DUY NHẤT quyết định "dịch vụ nào phát tham số nào". Test khoá đúng hợp đồng đó —
 * đặc biệt là ranh giới của thuê dài hạn (ADR 0011): tab dài hạn chỉ tìm XE, mọi thứ thuộc về
 * lịch và gói thuê đều nằm ở luồng gửi yêu cầu của từng xe.
 */

/**
 * `toAppTz`, không phải `dayjs` trần: bản nháp mang GIỜ VIỆT NAM ở mọi máy (CLAUDE.md §9), và
 * `draftFromFilters` cũng mặc định `nowInAppTz()`. Dựng mốc bằng `dayjs` thô ở đây là dựng một
 * mặt đồng hồ theo giờ MÁY, và cả file chỉ đúng khi `TZ` được ghim.
 */
const NOW = toAppTz('2026-08-18T09:00:00.000+07:00');

function makeDraft(patch: Partial<SearchDraft> = {}): SearchDraft {
  return {
    ...draftFromFilters({}, NOW),
    ...patch,
  };
}

/** Query string mà một bản nháp sinh ra — đúng thứ trình duyệt sẽ thấy trên URL. */
function queryOf(draft: SearchDraft): URLSearchParams {
  return new URLSearchParams(buildSearchHref(draft).split('?')[1] ?? '');
}

describe('draftFromFilters — URL → bản nháp', () => {
  it('URL rỗng cho mặc định dùng được ngay: ô tô, tự lái, toàn quốc, khoảng thuê mai → 3 ngày', () => {
    const draft = draftFromFilters({}, NOW);

    expect(draft.vehicleType).toBe(VEHICLE_TYPE.CAR);
    expect(draft.serviceType).toBe(SERVICE_TYPE.SELF_DRIVE);
    expect(draft.provinceCode).toBe('');
    expect(draft.rental.mode).toBe('daily');
    expect(draft.rental.pickupAt?.format('DD/MM HH:mm')).toBe('19/08 10:00');
    expect(draft.rental.returnAt?.format('DD/MM HH:mm')).toBe('22/08 10:00');
  });

  it('nạp lại đủ ngữ cảnh từ link chia sẻ (F5/back-forward đọc lại đúng URL đó)', () => {
    const filters: MarketplaceFilters = {
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: ROUTE_TYPE.INTER_CITY_ONE_WAY,
      provinceCode: '48',
      pickupAt: '2026-09-01T03:00:00.000Z',
      returnAt: '2026-09-04T03:00:00.000Z',
      hourly: true,
    };
    const draft = draftFromFilters(filters, NOW);

    expect(draft.vehicleType).toBe(VEHICLE_TYPE.CAR);
    expect(draft.serviceType).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(draft.routeType).toBe(ROUTE_TYPE.INTER_CITY_ONE_WAY);
    expect(draft.provinceCode).toBe('48');
    expect(draft.rental.mode).toBe('hourly');
    expect(draft.rental.pickupAt?.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('xe máy KHÔNG có dịch vụ có tài xế — link như vậy rơi về tự lái, không mở tab không tồn tại', () => {
    const draft = draftFromFilters(
      { vehicleType: VEHICLE_TYPE.MOTORBIKE, serviceType: SERVICE_TYPE.WITH_DRIVER },
      NOW,
    );

    expect(draft.vehicleType).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(draft.serviceType).toBe(SERVICE_TYPE.SELF_DRIVE);
  });

  it('xe máy VẪN có thuê dài hạn — chỉ đúng một dịch vụ bị loại', () => {
    const draft = draftFromFilters(
      { vehicleType: VEHICLE_TYPE.MOTORBIKE, serviceType: SERVICE_TYPE.LONG_TERM },
      NOW,
    );
    expect(draft.serviceType).toBe(SERVICE_TYPE.LONG_TERM);
  });

  it('giá trị lạ (link sửa tay, dịch vụ đã khai tử) rơi về mặc định thay vì làm hỏng form', () => {
    const draft = draftFromFilters(
      { vehicleType: 'spaceship', serviceType: 'both', routeType: 'teleport' },
      NOW,
    );

    expect(draft.vehicleType).toBe(VEHICLE_TYPE.CAR);
    expect(draft.serviceType).toBe(SERVICE_TYPE.SELF_DRIVE);
    expect(draft.routeType).toBe(ROUTE_TYPE.IN_CITY);
  });
});

describe('draftToFilterPatch — tự lái và có tài xế', () => {
  it('tự lái phát địa điểm + khoảng thuê, KHÔNG phát lộ trình', () => {
    const draft = makeDraft({ provinceCode: '48' });
    const query = queryOf(draft);

    expect(query.get('vehicleType')).toBe(VEHICLE_TYPE.CAR);
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.SELF_DRIVE);
    expect(query.get('provinceCode')).toBe('48');
    expect(query.get('pickupAt')).toBe(appWallClockToIso(draft.rental.pickupAt!));
    expect(query.get('returnAt')).toBe(appWallClockToIso(draft.rental.returnAt!));
    expect(query.has('routeType')).toBe(false);
  });

  it('xe máy chỉ đổi `vehicleType` — địa điểm và khoảng thuê đi nguyên vẹn theo', () => {
    const base = makeDraft({ provinceCode: '79' });
    const query = queryOf({ ...base, vehicleType: VEHICLE_TYPE.MOTORBIKE });

    expect(query.get('vehicleType')).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(query.get('provinceCode')).toBe('79');
    expect(query.get('pickupAt')).toBe(appWallClockToIso(base.rental.pickupAt!));
  });

  it('chế độ thuê theo giờ đi vào filter `hourly` sẵn có, không đẻ tham số mới', () => {
    const draft = makeDraft({ rental: { ...makeDraft().rental, mode: 'hourly' } });
    expect(queryOf(draft).get('hourly')).toBe('1');
  });

  it('có tài xế phát lộ trình — nhưng chỉ những lộ trình đang tồn tại trong hợp đồng', () => {
    const query = queryOf(
      makeDraft({ serviceType: SERVICE_TYPE.WITH_DRIVER, routeType: ROUTE_TYPE.INTER_CITY }),
    );

    expect(query.get('serviceType')).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(query.get('routeType')).toBe(ROUTE_TYPE.INTER_CITY);
    expect(query.has('pickupAt')).toBe(true);
  });

  it('toàn quốc = KHÔNG có tham số địa điểm, không phải `provinceCode=` rỗng', () => {
    expect(queryOf(makeDraft({ provinceCode: '' })).has('provinceCode')).toBe(false);
  });
});

describe('draftToFilterPatch — thuê dài hạn (ADR 0011)', () => {
  const longTermQuery = queryOf(
    makeDraft({
      serviceType: SERVICE_TYPE.LONG_TERM,
      provinceCode: '48',
      // Nháp vẫn GIỮ lộ trình và khoảng thuê trong bộ nhớ để quay lại tự lái là có ngay…
      routeType: ROUTE_TYPE.INTER_CITY,
    }),
  );

  it('chỉ mang ngữ cảnh tìm xe: loại xe · dịch vụ · địa điểm', () => {
    expect(longTermQuery.get('vehicleType')).toBe(VEHICLE_TYPE.CAR);
    expect(longTermQuery.get('serviceType')).toBe(SERVICE_TYPE.LONG_TERM);
    expect(longTermQuery.get('provinceCode')).toBe('48');
  });

  it('… nhưng KHÔNG phát lịch: không pickupAt/returnAt/hourly/routeType', () => {
    expect(longTermQuery.has('pickupAt')).toBe(false);
    expect(longTermQuery.has('returnAt')).toBe(false);
    expect(longTermQuery.has('hourly')).toBe(false);
    expect(longTermQuery.has('routeType')).toBe(false);
  });

  it('gói thuê và nguyện vọng ngày nhận KHÔNG phải bộ lọc marketplace', () => {
    for (const key of [
      'packageMonths',
      'longTermPackageMonths',
      'pickupPreference',
      'requestedPickupDate',
    ]) {
      expect(longTermQuery.has(key)).toBe(false);
    }
  });

  it('dịch vụ dài hạn không hỏi khoảng thuê ở bước tìm; hai dịch vụ còn lại thì có', () => {
    expect(serviceUsesRentalRange(SERVICE_TYPE.LONG_TERM)).toBe(false);
    expect(serviceUsesRentalRange(SERVICE_TYPE.SELF_DRIVE)).toBe(true);
    expect(serviceUsesRentalRange(SERVICE_TYPE.WITH_DRIVER)).toBe(true);
  });
});

describe('đổi dịch vụ — patch XOÁ đúng những tham số hết nghĩa', () => {
  it('tự lái → dài hạn: khoá lịch bị đánh dấu xoá khỏi URL, không nằm lại như tham số ma', () => {
    const patch = draftToFilterPatch(makeDraft({ serviceType: SERVICE_TYPE.LONG_TERM }));

    // `undefined` là tín hiệu XOÁ của `applyFilterPatch` — khác hẳn "không nhắc tới key".
    expect('pickupAt' in patch).toBe(true);
    expect(patch.pickupAt).toBeUndefined();
    expect(patch.returnAt).toBeUndefined();
    expect(patch.hourly).toBeUndefined();
    expect(patch.routeType).toBeUndefined();
  });

  it('dài hạn → tự lái lấy lại đúng khoảng thuê còn trong nháp, không suy ra từ gói thuê', () => {
    const draft = makeDraft({
      serviceType: SERVICE_TYPE.LONG_TERM,
      rental: {
        pickupAt: toAppTz('2026-10-05T03:00:00.000Z'),
        returnAt: toAppTz('2026-10-09T03:00:00.000Z'),
        mode: 'daily',
      },
    });

    expect(queryOf(draft).has('pickupAt')).toBe(false);

    const back = queryOf({ ...draft, serviceType: SERVICE_TYPE.SELF_DRIVE });
    expect(back.get('pickupAt')).toBe('2026-10-05T03:00:00.000Z');
    expect(back.get('returnAt')).toBe('2026-10-09T03:00:00.000Z');
  });
});

describe('searchContextSignature — so URL với nháp mà không so từng trường', () => {
  it('URL và nháp cùng ngữ cảnh cho cùng chữ ký, bất kể thứ tự tham số', () => {
    const draft = makeDraft({ serviceType: SERVICE_TYPE.LONG_TERM, provinceCode: '48' });
    const fromUrl = Object.fromEntries(queryOf(draft)) as MarketplaceFilters;

    expect(searchContextSignature(fromUrl)).toBe(searchContextSignature(draftToFilterPatch(draft)));
  });

  it('bỏ qua các key KHÔNG thuộc thẻ tìm kiếm — đổi facet không làm nháp bị nạp lại', () => {
    const base: MarketplaceFilters = { vehicleType: VEHICLE_TYPE.CAR };
    expect(searchContextSignature({ ...base, sort: 'price_asc', page: 3 })).toBe(
      searchContextSignature(base),
    );
  });
});
