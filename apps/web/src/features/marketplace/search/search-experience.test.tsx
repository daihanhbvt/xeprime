import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_TYPE_LABEL, SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { PublicDestination } from '../types';

/**
 * Trải nghiệm tìm kiếm trang chủ — thứ cần khoá ở đây là **hợp đồng**, không phải pixel:
 *
 *   1. Phân tầng: loại xe → dịch vụ → form của riêng dịch vụ đó.
 *   2. Mỗi dịch vụ phát ĐÚNG bộ tham số của nó; dài hạn không bao giờ mang lịch (ADR 0011).
 *   3. Hero và thanh thu gọn là MỘT trạng thái — sửa ở đâu cũng vào cùng một chỗ.
 *   4. Đổi tab không dọn form: quay lại tự lái là có lại đúng khoảng thuê cũ.
 */

const DESTINATIONS: PublicDestination[] = [
  { provinceCode: '48', provinceName: 'Đà Nẵng', vehicleCount: 42 },
  { provinceCode: '79', provinceName: 'TP. Hồ Chí Minh', vehicleCount: 120 },
  { provinceCode: '01', provinceName: 'Hà Nội', vehicleCount: 88 },
];

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/',
  useSearchParams: () => nav.searchParams,
}));

vi.mock('../hooks/use-destinations', () => ({
  useDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
}));

// Desktop: Popover thay vì Drawer. Test mobile riêng ở phần cuối.
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false }));

/** Các instance IntersectionObserver đang sống — dùng để giả lập hero rời khỏi viewport. */
const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

class TestIntersectionObserver {
  constructor(private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

/* `vitest.setup.ts` cài một stub rỗng không `configurable` → phải GÁN đè, không `stubGlobal`. */
const realIntersectionObserver = window.IntersectionObserver;

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
  nav.searchParams = new URLSearchParams();
  observers.length = 0;
  window.history.replaceState(null, '', '/');
  window.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  window.IntersectionObserver = realIntersectionObserver;
});

async function renderExperience() {
  const { SearchExperience } = await import('./SearchExperience');
  const view = render(<SearchExperience />);

  /**
   * Giả lập MỘT KHỐI KHÁC trên trang chủ đổi URL (bấm "Địa điểm nổi bật" →
   * `setFilters({ provinceCode })`). Đổi searchParams rồi render lại — đúng thứ Next làm.
   */
  return {
    changeUrlExternally(search: string) {
      nav.searchParams = new URLSearchParams(search);
      window.history.replaceState(null, '', search ? `/?${search}` : '/');
      view.rerender(<SearchExperience />);
    },
  };
}

/** Hero: vùng form có `role="tabpanel"`. Thanh thu gọn: landmark `search` riêng của nó. */
function hero(): HTMLElement {
  return screen.getByRole('tabpanel');
}

function sticky(): HTMLElement {
  return screen.getByRole('search', { name: 'Tìm kiếm nhanh' });
}

/** Đẩy hero ra khỏi viewport → thanh thu gọn hiện (chờ hết hai khung hình hoạt cảnh vào). */
async function scrollHeroOutOfView() {
  await act(async () => {
    for (const notify of observers) notify([{ isIntersecting: false }]);
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

/** Query string của lần bấm "Tìm xe" gần nhất. */
function submittedQuery(): URLSearchParams {
  const href = nav.push.mock.calls.at(-1)?.[0] as string;
  expect(href.startsWith('/search')).toBe(true);
  return new URLSearchParams(href.split('?')[1] ?? '');
}

/** Query string mà thẻ tìm kiếm đã đồng bộ (shallow) lên URL trang chủ. */
function homeUrlQuery(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function clickTab(scope: HTMLElement, name: string) {
  fireEvent.click(within(scope).getByRole('tab', { name }));
}

/** Mở panel địa điểm của một bề mặt rồi chọn một tỉnh. */
function pickProvince(scope: HTMLElement, trigger: RegExp, provinceName: string) {
  fireEvent.click(within(scope).getByRole('button', { name: trigger }));
  const panel = screen.getByRole('dialog', { name: 'Bạn muốn thuê xe ở đâu?' });
  // Viên "Địa điểm phổ biến" mang ĐÚNG tên tỉnh; dòng trong danh sách đầy đủ còn kèm số xe.
  fireEvent.click(within(panel).getByRole('button', { name: provinceName }));
}

describe('phân tầng: loại xe → dịch vụ → form', () => {
  it('hai nhóm chọn đứng TRƯỚC hàng ô nhập, không trộn vào cùng một hàng với địa điểm/ngày', async () => {
    await renderExperience();

    const vehicleGroup = screen.getByRole('tablist', { name: 'Loại xe' });
    const serviceGroup = screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });

    expect(within(vehicleGroup).getAllByRole('tab')).toHaveLength(2);
    expect(within(serviceGroup).getAllByRole('tab')).toHaveLength(3);
    // Ô địa điểm nằm trong vùng form, KHÔNG nằm trong nhóm chọn loại xe.
    expect(within(vehicleGroup).queryByRole('button', { name: /Địa điểm nhận xe/ })).toBeNull();
    expect(within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ })).toBeTruthy();
  });

  it('mỗi nhóm là MỘT điểm dừng Tab, đi trong nhóm bằng mũi tên (roving tabindex)', async () => {
    await renderExperience();
    const serviceGroup = screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });
    const tabs = within(serviceGroup).getAllByRole('tab');

    expect(tabs.filter((tab) => tab.getAttribute('tabindex') === '0')).toHaveLength(1);

    fireEvent.keyDown(serviceGroup, { key: 'ArrowRight' });
    expect(within(serviceGroup).getByRole('tab', { name: 'Xe có tài xế' })).toHaveProperty(
      'ariaSelected',
      'true',
    );
  });
});

describe('tự lái', () => {
  it('Ô tô → Tự lái → Đà Nẵng → Tìm xe: đủ loại xe, dịch vụ, địa điểm và khoảng thuê', async () => {
    await renderExperience();
    pickProvince(hero(), /Địa điểm nhận xe/, 'Đà Nẵng');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));

    const query = submittedQuery();
    expect(query.get('vehicleType')).toBe(VEHICLE_TYPE.CAR);
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.SELF_DRIVE);
    expect(query.get('provinceCode')).toBe('48');
    expect(query.get('pickupAt')).toBeTruthy();
    expect(query.get('returnAt')).toBeTruthy();
    expect(query.has('routeType')).toBe(false);
  });

  it('đổi sang Xe máy GIỮ NGUYÊN địa điểm và khoảng thuê đã chọn', async () => {
    await renderExperience();
    pickProvince(hero(), /Địa điểm nhận xe/, 'TP. Hồ Chí Minh');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const before = submittedQuery();

    clickTab(screen.getByRole('tablist', { name: 'Loại xe' }), 'Xe máy');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const after = submittedQuery();

    expect(after.get('vehicleType')).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(after.get('provinceCode')).toBe('79');
    expect(after.get('pickupAt')).toBe(before.get('pickupAt'));
    expect(after.get('returnAt')).toBe(before.get('returnAt'));
  });
});

describe('xe máy không có dịch vụ CÓ TÀI XẾ', () => {
  it('chọn Xe máy thì tab "Xe có tài xế" biến mất, hai tab còn lại giữ nguyên', async () => {
    await renderExperience();
    const services = () => screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });
    expect(within(services()).getAllByRole('tab')).toHaveLength(3);

    clickTab(screen.getByRole('tablist', { name: 'Loại xe' }), 'Xe máy');

    expect(within(services()).queryByRole('tab', { name: 'Xe có tài xế' })).toBeNull();
    expect(within(services()).getByRole('tab', { name: 'Xe tự lái' })).toBeTruthy();
    expect(within(services()).getByRole('tab', { name: 'Thuê xe dài hạn' })).toBeTruthy();
  });

  it('đang ở tab Có tài xế mà đổi sang Xe máy thì rơi về Tự lái, không để lại tab chết', async () => {
    await renderExperience();
    clickTab(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }), 'Xe có tài xế');
    clickTab(screen.getByRole('tablist', { name: 'Loại xe' }), 'Xe máy');

    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const query = submittedQuery();
    expect(query.get('vehicleType')).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.SELF_DRIVE);
    // Lộ trình là ngữ cảnh của dịch vụ vừa rời — không được nằm lại trên URL.
    expect(query.has('routeType')).toBe(false);
  });
});

describe('có tài xế', () => {
  it('chỉ phát lộ trình ĐANG được hợp đồng hỗ trợ, không đẻ trường mới', async () => {
    await renderExperience();
    clickTab(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }), 'Xe có tài xế');

    fireEvent.click(within(hero()).getByRole('radio', { name: ROUTE_TYPE_LABEL.inter_city }));
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));

    const query = submittedQuery();
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(query.get('routeType')).toBe('inter_city');
    // Điểm đón/điểm đến thuộc luồng gửi yêu cầu thuê — không phải bộ lọc marketplace.
    expect(query.has('pickupAddress')).toBe(false);
    expect(query.has('destination')).toBe(false);
  });
});

describe('thuê dài hạn — chỉ tìm XE (ADR 0011)', () => {
  async function openLongTerm() {
    await renderExperience();
    clickTab(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }), 'Thuê xe dài hạn');
  }

  it('không có ô thời gian thuê, không có ngày trả, không có bộ chọn gói', async () => {
    await openLongTerm();

    expect(within(hero()).queryByRole('button', { name: /Thời gian thuê/ })).toBeNull();
    expect(screen.queryByText(/Thời gian thuê/)).toBeNull();
    expect(screen.queryByText(/ngày trả/i)).toBeNull();
    expect(screen.queryByLabelText(/gói thuê/i)).toBeNull();
  });

  it('không có chữ "tối thiểu 7 ngày", không có badge giảm giá suy từ giá ngày', async () => {
    await openLongTerm();

    expect(screen.queryByText(/tối thiểu/i)).toBeNull();
    expect(screen.queryByText(/7 ngày/)).toBeNull();
    expect(screen.queryByText('-38%')).toBeNull();
    expect(screen.queryByText(/tự chọn thời gian thuê/i)).toBeNull();
  });

  it('nói rõ gói thuê chọn ở BƯỚC SAU khi đã có xe', async () => {
    await openLongTerm();
    expect(
      within(hero()).getByText(/Chọn xe trước, sau đó chọn gói thuê và nguyện vọng ngày nhận/),
    ).toBeTruthy();
  });

  it('URL tìm kiếm mang địa điểm nhưng KHÔNG mang lịch, gói hay nguyện vọng', async () => {
    await openLongTerm();
    pickProvince(hero(), /Địa điểm nhận xe/, 'Đà Nẵng');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));

    const query = submittedQuery();
    expect(query.get('vehicleType')).toBe(VEHICLE_TYPE.CAR);
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.LONG_TERM);
    expect(query.get('provinceCode')).toBe('48');
    for (const key of [
      'pickupAt',
      'returnAt',
      'hourly',
      'routeType',
      'packageMonths',
      'longTermPackageMonths',
      'pickupPreference',
      'requestedPickupDate',
    ]) {
      expect(query.has(key)).toBe(false);
    }
  });

  it('URL trang chủ cũng sạch lịch — khối "Xe khả dụng" bên dưới không đọc phải ngày cũ', async () => {
    await openLongTerm();

    const query = homeUrlQuery();
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.LONG_TERM);
    expect(query.has('pickupAt')).toBe(false);
    expect(query.has('returnAt')).toBe(false);
  });
});

describe('đổi dịch vụ giữ ngữ cảnh tương thích', () => {
  it('tự lái → dài hạn giữ loại xe và địa điểm; quay lại tự lái có ngay khoảng thuê cũ', async () => {
    await renderExperience();
    clickTab(screen.getByRole('tablist', { name: 'Loại xe' }), 'Xe máy');
    pickProvince(hero(), /Địa điểm nhận xe/, 'Hà Nội');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const selfDrive = submittedQuery();

    const services = screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });
    clickTab(services, 'Thuê xe dài hạn');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const longTerm = submittedQuery();

    expect(longTerm.get('vehicleType')).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(longTerm.get('provinceCode')).toBe('01');
    expect(longTerm.has('pickupAt')).toBe(false);

    clickTab(services, 'Xe tự lái');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const back = submittedQuery();

    // Khoảng thuê quay lại ĐÚNG giá trị cũ — không suy ra từ gói thuê dài hạn nào cả.
    expect(back.get('pickupAt')).toBe(selfDrive.get('pickupAt'));
    expect(back.get('returnAt')).toBe(selfDrive.get('returnAt'));
    expect(back.get('provinceCode')).toBe('01');
  });
});

describe('hero ↔ thanh thu gọn — một trạng thái, hai trình bày', () => {
  it('hero còn thấy thì thanh thu gọn không tồn tại; hero khuất thì nó hiện ra', async () => {
    await renderExperience();
    expect(screen.queryByRole('search', { name: 'Tìm kiếm nhanh' })).toBeNull();

    await scrollHeroOutOfView();
    expect(screen.getByRole('search', { name: 'Tìm kiếm nhanh' })).toBeTruthy();
  });

  it('đổi loại xe và dịch vụ ở thanh thu gọn thì hero đổi theo — không có nguồn thứ hai', async () => {
    await renderExperience();
    await scrollHeroOutOfView();

    fireEvent.click(within(sticky()).getByRole('button', { name: /Loại xe và dịch vụ/ }));
    const panel = screen.getByRole('dialog', { name: 'Loại xe và dịch vụ' });
    clickTab(within(panel).getByRole('tablist', { name: 'Loại xe' }), 'Xe máy');
    clickTab(
      within(panel).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }),
      'Thuê xe dài hạn',
    );

    // Hero (đang ngoài màn hình) phản ánh ngay: nhóm chọn của nó cũng đổi theo.
    const heroVehicle = screen.getAllByRole('tablist', { name: 'Loại xe' })[0]!;
    expect(within(heroVehicle).getByRole('tab', { name: 'Xe máy' })).toHaveProperty(
      'ariaSelected',
      'true',
    );
    expect(within(hero()).getByText(/Chọn xe trước, sau đó chọn gói thuê/)).toBeTruthy();
  });

  it('đổi địa điểm ở thanh thu gọn cập nhật cả hero lẫn URL tìm kiếm', async () => {
    await renderExperience();
    await scrollHeroOutOfView();
    pickProvince(sticky(), /Địa điểm nhận xe/, 'Đà Nẵng');

    expect(within(hero()).getByRole('button', { name: 'Địa điểm nhận xe: Đà Nẵng' })).toBeTruthy();

    fireEvent.click(within(sticky()).getByRole('button', { name: 'Tìm xe' }));
    expect(submittedQuery().get('provinceCode')).toBe('48');
  });

  it('đổi chế độ thuê theo giờ ở thanh thu gọn đi vào cùng một khoảng thuê của hero', async () => {
    await renderExperience();
    await scrollHeroOutOfView();

    fireEvent.click(within(sticky()).getByRole('button', { name: /Thời gian thuê/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Thuê theo giờ' }));

    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    expect(submittedQuery().get('hourly')).toBe('1');
  });

  it('thanh thu gọn của dài hạn không hiện ô thời gian', async () => {
    await renderExperience();
    clickTab(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }), 'Thuê xe dài hạn');
    await scrollHeroOutOfView();

    expect(within(sticky()).queryByRole('button', { name: /Thời gian thuê/ })).toBeNull();
    expect(within(sticky()).getByRole('button', { name: /Địa điểm nhận xe/ })).toBeTruthy();
    expect(within(sticky()).getByRole('button', { name: 'Tìm xe' })).toBeTruthy();
  });
});

describe('panel chỉnh sửa', () => {
  it('mở panel ở thanh thu gọn thì panel neo ở ĐÓ, không phải ở hero', async () => {
    await renderExperience();
    await scrollHeroOutOfView();

    const trigger = within(sticky()).getByRole('button', { name: /Địa điểm nhận xe/ });
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(hero())
        .getByRole('button', { name: /Địa điểm nhận xe/ })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('Esc đóng panel và trả focus về đúng nút đã mở nó', async () => {
    await renderExperience();
    const trigger = within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Bạn muốn thuê xe ở đâu?' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('tìm tỉnh không dấu vẫn ra kết quả; gõ bậy thì có trạng thái rỗng tử tế', async () => {
    await renderExperience();
    fireEvent.click(within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ }));
    const panel = screen.getByRole('dialog', { name: 'Bạn muốn thuê xe ở đâu?' });
    const input = within(panel).getByRole('textbox', { name: 'Tìm tỉnh hoặc thành phố' });

    fireEvent.change(input, { target: { value: 'da nang' } });
    expect(within(panel).getByRole('button', { name: /Đà Nẵng/ })).toBeTruthy();

    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(within(panel).getByText(/Không có tỉnh\/thành nào khớp/)).toBeTruthy();
  });
});

describe('URL bị KHỐI KHÁC trên trang chủ đổi', () => {
  it('thẻ tìm kiếm đi theo — không để hero và "Địa điểm nổi bật" nói hai địa điểm khác nhau', async () => {
    const { changeUrlExternally } = await renderExperience();
    expect(within(hero()).getByRole('button', { name: /Toàn quốc/ })).toBeTruthy();

    changeUrlExternally('provinceCode=48');

    expect(within(hero()).getByRole('button', { name: 'Địa điểm nhận xe: Đà Nẵng' })).toBeTruthy();
  });

  it('KHÔNG đóng dấu khoảng thuê mặc định lên URL của khách chưa hề chạm vào thẻ', async () => {
    const { changeUrlExternally } = await renderExperience();

    changeUrlExternally('provinceCode=48');

    // "Xe khả dụng" đọc chính URL này — thêm pickupAt/returnAt là âm thầm lọc theo một khoảng
    // ngày khách không chọn, và khách không nhìn thấy nó ở đâu cả.
    const query = homeUrlQuery();
    expect(query.get('provinceCode')).toBe('48');
    expect(query.has('pickupAt')).toBe(false);
    expect(query.has('returnAt')).toBe(false);
    expect(query.has('serviceType')).toBe(false);
  });

  it('nhưng khi khách ĐÃ chọn dịch vụ rồi thì ngữ cảnh mới được ghi lên URL', async () => {
    await renderExperience();
    clickTab(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }), 'Xe có tài xế');

    const query = homeUrlQuery();
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(query.get('routeType')).toBeTruthy();
  });

  it('đổi URL từ bên ngoài KHÔNG làm mất khoảng thuê đang có trong nháp', async () => {
    const { changeUrlExternally } = await renderExperience();
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const before = submittedQuery();

    changeUrlExternally('provinceCode=48');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));

    const after = submittedQuery();
    expect(after.get('provinceCode')).toBe('48');
    expect(after.get('pickupAt')).toBe(before.get('pickupAt'));
    expect(after.get('returnAt')).toBe(before.get('returnAt'));
  });
});

describe('nạp lại ngữ cảnh từ URL', () => {
  it('mở link chia sẻ dài hạn: đúng tab, đúng tỉnh, và không dựng ô lịch nào', async () => {
    nav.searchParams = new URLSearchParams(
      `serviceType=${SERVICE_TYPE.LONG_TERM}&vehicleType=${VEHICLE_TYPE.MOTORBIKE}&provinceCode=48`,
    );
    await renderExperience();

    expect(
      within(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' })).getByRole('tab', {
        name: 'Thuê xe dài hạn',
      }),
    ).toHaveProperty('ariaSelected', 'true');
    expect(within(hero()).getByRole('button', { name: 'Địa điểm nhận xe: Đà Nẵng' })).toBeTruthy();
    expect(within(hero()).queryByRole('button', { name: /Thời gian thuê/ })).toBeNull();
  });
});
