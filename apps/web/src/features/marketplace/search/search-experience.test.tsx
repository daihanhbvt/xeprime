import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_TYPE_LABEL, SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { PublicDestination } from '../types';

/**
 * Trải nghiệm tìm kiếm trang chủ — thứ cần khoá ở đây là **hợp đồng**, không phải pixel:
 *
 *   1. Phân tầng: loại xe → dịch vụ → form của riêng dịch vụ đó.
 *   2. Mỗi dịch vụ phát ĐÚNG bộ tham số của nó; dài hạn không bao giờ mang lịch (ADR 0011).
 *   3. Trang chủ CHỈ có thẻ hero — cuộn qua nó không mọc thêm thanh tìm kiếm thu gọn.
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
  useAllDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
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
  /*
   * Thẻ tìm kiếm GHI lựa chọn của người dùng vào `localStorage`/`sessionStorage` (khoảng thuê ở
   * `rental-range-memory`, tỉnh ở `province-memory`) và ĐỌC lại chúng khi URL không nói gì. Hai
   * kho đó sống xuyên suốt cả file test, nên không dọn ở đây thì một ca chọn Đà Nẵng sẽ làm ca
   * sau mở ra đã có sẵn Đà Nẵng — và một test đọc "Toàn quốc" hỏng vì một hành vi đúng của sản
   * phẩm. Hành vi ghi nhớ được kiểm TƯỜNG MINH ở ca riêng phía dưới.
   */
  window.localStorage.clear();
  window.sessionStorage.clear();
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

/**
 * Landmark của THẺ HERO. Mọi truy vấn nhóm chọn phải neo vào đây.
 *
 * `screen.getByRole('tablist', …)` quét cả `document.body`, mà panel chỉnh sửa (dialog) cũng
 * chứa tablist TRÙNG TÊN — dialog lại đóng có hoạt cảnh nên đôi lúc còn trong DOM ở câu lệnh
 * kế tiếp. Đó là nguồn `getMultipleElementsFoundError` không tái lập đều được. Neo phạm vi làm
 * truy vấn tất định dù dialog hay thanh thu gọn đang hiện; KHÔNG đổi `role` của sản phẩm.
 */
function heroCard(): HTMLElement {
  return screen.getByRole('search', { name: 'Tìm xe cho thuê' });
}

/** Hero: vùng form có `role="tabpanel"`. */
function hero(): HTMLElement {
  return screen.getByRole('tabpanel');
}

/** Đẩy hero ra khỏi viewport (chờ hết hai khung hình hoạt cảnh nếu có gì định hiện ra). */
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

/**
 * Bấm một lựa chọn trong nhóm — `tab` (nhóm dịch vụ, thanh thu gọn) hoặc `radio` (Ô tô · Xe máy
 * trong hàng ô nhập của thẻ hero: một lựa chọn trong form, không phải tab điều khiển form).
 */
function clickTab(scope: HTMLElement, name: string) {
  const option =
    within(scope).queryByRole('tab', { name }) ?? within(scope).getByRole('radio', { name });
  fireEvent.click(option);
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

    const vehicleGroup = within(heroCard()).getByRole('radiogroup', { name: 'Loại xe' });
    const serviceGroup = within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });

    expect(within(vehicleGroup).getAllByRole('radio')).toHaveLength(2);
    expect(within(serviceGroup).getAllByRole('tab')).toHaveLength(3);
    // Ô địa điểm nằm trong vùng form, KHÔNG nằm trong nhóm chọn loại xe.
    expect(within(vehicleGroup).queryByRole('button', { name: /Địa điểm nhận xe/ })).toBeNull();
    expect(within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ })).toBeTruthy();
  });

  it('mỗi nhóm là MỘT điểm dừng Tab, đi trong nhóm bằng mũi tên (roving tabindex)', async () => {
    await renderExperience();
    const serviceGroup = within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });
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
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));

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
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));
    const before = submittedQuery();

    clickTab(within(heroCard()).getByRole('radiogroup', { name: 'Loại xe' }), 'Xe máy');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));
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
    const services = () =>
      within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });
    expect(within(services()).getAllByRole('tab')).toHaveLength(3);

    clickTab(within(heroCard()).getByRole('radiogroup', { name: 'Loại xe' }), 'Xe máy');

    expect(within(services()).queryByRole('tab', { name: 'Xe có tài xế' })).toBeNull();
    expect(within(services()).getByRole('tab', { name: 'Xe tự lái' })).toBeTruthy();
    expect(within(services()).getByRole('tab', { name: 'Thuê xe dài hạn' })).toBeTruthy();
  });

  /**
   * Chiều ngược lại của luật trên: đang tìm "Xe có tài xế" thì lựa chọn "Xe máy" biến mất — chỉ còn
   * "Ô tô" — thay vì để khách chọn một tổ hợp không tồn tại rồi lặng lẽ đổi dịch vụ của họ.
   */
  it('chọn Xe có tài xế thì loại xe chỉ còn Ô tô; quay lại Tự lái thì Xe máy trở lại', async () => {
    await renderExperience();
    const vehicles = () => within(heroCard()).getByRole('radiogroup', { name: 'Loại xe' });
    clickTab(
      within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }),
      'Xe có tài xế',
    );
    expect(
      within(vehicles())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Ô tô']);

    clickTab(
      within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }),
      'Xe tự lái',
    );
    expect(within(vehicles()).getByRole('radio', { name: 'Xe máy' })).toBeTruthy();
  });
});

describe('có tài xế', () => {
  it('chỉ phát lộ trình ĐANG được hợp đồng hỗ trợ, không đẻ trường mới', async () => {
    await renderExperience();
    clickTab(
      within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }),
      'Xe có tài xế',
    );

    fireEvent.click(within(hero()).getByRole('radio', { name: ROUTE_TYPE_LABEL.inter_city }));
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));

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
    clickTab(
      within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }),
      'Thuê xe dài hạn',
    );
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
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));

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

  it('URL trang chủ cũng sạch lịch — khối "Xe phù hợp với bạn" bên dưới không đọc phải ngày cũ', async () => {
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
    clickTab(within(heroCard()).getByRole('radiogroup', { name: 'Loại xe' }), 'Xe máy');
    pickProvince(hero(), /Địa điểm nhận xe/, 'Hà Nội');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));
    const selfDrive = submittedQuery();

    const services = within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });
    clickTab(services, 'Thuê xe dài hạn');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));
    const longTerm = submittedQuery();

    expect(longTerm.get('vehicleType')).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(longTerm.get('provinceCode')).toBe('01');
    expect(longTerm.has('pickupAt')).toBe(false);

    clickTab(services, 'Xe tự lái');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));
    const back = submittedQuery();

    // Khoảng thuê quay lại ĐÚNG giá trị cũ — không suy ra từ gói thuê dài hạn nào cả.
    expect(back.get('pickupAt')).toBe(selfDrive.get('pickupAt'));
    expect(back.get('returnAt')).toBe(selfDrive.get('returnAt'));
    expect(back.get('provinceCode')).toBe('01');
  });
});

describe('trang chủ không có thanh tìm kiếm thu gọn', () => {
  it('cuộn cho hero khuất khỏi màn hình cũng không mọc thêm thanh tìm kiếm nào', async () => {
    await renderExperience();
    await scrollHeroOutOfView();

    expect(screen.queryByRole('search', { name: 'Tìm kiếm nhanh' })).toBeNull();
    expect(screen.getAllByRole('search')).toHaveLength(1);
  });
});

describe('panel chỉnh sửa', () => {
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

  /**
   * Tỉnh đã chọn phải sống qua F5.
   *
   * Đây là thứ khách nhìn thấy đầu tiên mỗi lần quay lại, và trước đây nó luôn mở ra "Toàn quốc"
   * dù họ vừa xem xe ở Bắc Ninh mười phút trước. Bộ nhớ nằm ở `localStorage` nên nó cũng là thứ
   * điền sẵn cho các form địa chỉ ở màn khác — một câu trả lời, mọi bề mặt.
   */
  it('tỉnh đã chọn được nhớ lại ở lần mở sau, kể cả khi URL không mang gì', async () => {
    await renderExperience();
    pickProvince(hero(), /Địa điểm nhận xe/, 'Đà Nẵng');
    expect(within(hero()).getByRole('button', { name: 'Địa điểm nhận xe: Đà Nẵng' })).toBeTruthy();

    // Mở lại từ đầu với URL TRẮNG — đúng thứ F5 trên trang chủ tạo ra.
    cleanup();
    window.history.replaceState(null, '', '/');
    await renderExperience();

    expect(within(hero()).getByRole('button', { name: 'Địa điểm nhận xe: Đà Nẵng' })).toBeTruthy();
  });

  /**
   * "Toàn quốc" là một LỰA CHỌN, không phải một khoảng trống: chọn nó phải XOÁ tỉnh đã nhớ, nếu
   * không lần mở sau lại điền đúng cái tỉnh mà khách vừa chủ động bỏ.
   */
  it('chọn Toàn quốc xoá tỉnh đã nhớ', async () => {
    await renderExperience();
    pickProvince(hero(), /Địa điểm nhận xe/, 'Đà Nẵng');

    fireEvent.click(within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Bạn muốn thuê xe ở đâu?' })).getByRole('button', {
        name: /^Toàn quốc/,
      }),
    );

    cleanup();
    window.history.replaceState(null, '', '/');
    await renderExperience();

    expect(within(hero()).getByRole('button', { name: /Toàn quốc/ })).toBeTruthy();
  });

  /**
   * HỒI QUY: bộ nhớ tỉnh có HAI người ghi, chọn từ HAI danh mục khác nhau.
   *
   * Bộ chọn ở đây ghi mã lấy từ `/public/destinations` (chỉ tỉnh ĐANG CÓ XE); ô địa chỉ trong các
   * form ghi mã lấy từ `/provinces` (MỌI tỉnh đang mở). Người đọc thì chỉ hiển thị được mã có
   * trong `destinations` — nên một người vừa khai địa chỉ gian hàng ở một tỉnh chưa có xe nào
   * quay lại trang chủ và thấy "Địa điểm không còn khả dụng", nói về một lựa chọn họ chưa hề làm
   * ở đây. Cùng chuyện đó xảy ra khi một tỉnh từng có xe rồi hết xe.
   *
   * Bộ nhớ là một GỢI Ý: tra không ra tên thì để nguyên "Toàn quốc", và KHÔNG xoá bộ nhớ — mã đó
   * vẫn đúng và vẫn hữu ích cho các form địa chỉ.
   */
  it('tỉnh đã nhớ KHÔNG có trong danh mục điểm đến → giữ "Toàn quốc", không báo lỗi', async () => {
    // `'24'` (Bắc Ninh) là mã hợp lệ của danh mục hành chính nhưng KHÔNG nằm trong `DESTINATIONS`
    // của test — đúng hình dạng của một tỉnh chưa có xe nào trên chợ.
    window.localStorage.setItem(
      'xp.provinceCode',
      JSON.stringify({ provinceCode: '24', savedAt: new Date().toISOString() }),
    );

    await renderExperience();

    expect(within(hero()).getByRole('button', { name: /Toàn quốc/ })).toBeTruthy();
    expect(within(hero()).queryByRole('button', { name: /không còn khả dụng/i })).toBeNull();
    // Bộ nhớ còn nguyên: màn địa chỉ ở nơi khác vẫn điền sẵn được tỉnh này.
    expect(window.localStorage.getItem('xp.provinceCode')).toContain('24');
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

    // "Xe phù hợp với bạn" đọc chính URL này — thêm pickupAt/returnAt là âm thầm lọc theo một khoảng
    // ngày khách không chọn, và khách không nhìn thấy nó ở đâu cả.
    const query = homeUrlQuery();
    expect(query.get('provinceCode')).toBe('48');
    expect(query.has('pickupAt')).toBe(false);
    expect(query.has('returnAt')).toBe(false);
    expect(query.has('serviceType')).toBe(false);
  });

  it('nhưng khi khách ĐÃ chọn dịch vụ rồi thì ngữ cảnh mới được ghi lên URL', async () => {
    await renderExperience();
    clickTab(
      within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' }),
      'Xe có tài xế',
    );

    const query = homeUrlQuery();
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(query.get('routeType')).toBeTruthy();
  });

  it('đổi URL từ bên ngoài KHÔNG làm mất khoảng thuê đang có trong nháp', async () => {
    const { changeUrlExternally } = await renderExperience();
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));
    const before = submittedQuery();

    changeUrlExternally('provinceCode=48');
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));

    const after = submittedQuery();
    expect(after.get('provinceCode')).toBe('48');
    expect(after.get('pickupAt')).toBe(before.get('pickupAt'));
    expect(after.get('returnAt')).toBe(before.get('returnAt'));
  });
});

describe('nạp lại ngữ cảnh từ URL', () => {
  it('mở link chia sẻ dài hạn: đúng tab, đúng tỉnh, và không dựng ô lịch nào', async () => {
    const shared = `serviceType=${SERVICE_TYPE.LONG_TERM}&vehicleType=${VEHICLE_TYPE.MOTORBIKE}&provinceCode=48`;
    // Mở link = thanh địa chỉ VÀ router cùng mang query đó (hook bộ lọc đọc `window.location`).
    nav.searchParams = new URLSearchParams(shared);
    window.history.replaceState(null, '', `/?${shared}`);
    await renderExperience();

    expect(
      within(within(heroCard()).getByRole('tablist', { name: 'Loại dịch vụ thuê xe' })).getByRole(
        'tab',
        {
          name: 'Thuê xe dài hạn',
        },
      ),
    ).toHaveProperty('ariaSelected', 'true');
    expect(within(hero()).getByRole('button', { name: 'Địa điểm nhận xe: Đà Nẵng' })).toBeTruthy();
    expect(within(hero()).queryByRole('button', { name: /Thời gian thuê/ })).toBeNull();
  });
});
