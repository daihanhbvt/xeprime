import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import type { Plan } from '@/features/admin-plans/types';

import AdminPlansPage from './page';

/**
 * Đặc tả `/manage/admin/plans` — danh mục gói dịch vụ.
 *
 * Danh mục **không phân trang** (API trả cả danh sách) nhưng bộ lọc nằm trên **URL** (ADR 0004):
 * `q` / `kind` / `status`. Bật/tắt bán đi qua **công tắc có xác nhận** ở cả hai chiều.
 */

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/manage/admin/plans',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as Plan[] | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastStatus: undefined as unknown,
}));

vi.mock('@/features/admin-plans/hooks/use-plans', () => ({
  usePlans: (status: unknown) => {
    query.lastStatus = status;
    return query;
  },
}));

const setStatus = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as { id: string; status: string } | undefined,
}));

vi.mock('@/features/admin-plans/hooks/use-plan-mutations', () => ({
  useSetPlanStatus: () => setStatus,
}));

const modal = vi.hoisted(() => ({
  open: false,
  plan: null as Plan | null,
  template: null as Plan | null,
  allowCommission: undefined as boolean | undefined,
}));

vi.mock('@/features/admin-plans/components/PlanFormModal', () => ({
  PlanFormModal: (props: {
    open: boolean;
    plan: Plan | null;
    template: Plan | null;
    allowCommission: boolean;
  }) => {
    Object.assign(modal, props);
    if (!props.open) return null;
    const label = props.plan
      ? `edit:${props.plan.id}`
      : props.template
        ? `duplicate:${props.template.id}`
        : 'new';
    return <div data-testid="plan-form">{label}</div>;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function plan(over: Partial<Plan> = {}, limits: Partial<Plan['limits']> = {}): Plan {
  return {
    id: 'p1',
    code: 'shop-basic',
    name: 'Gói cơ bản',
    description: 'Cho shop nhỏ',
    billingMode: 'package',
    commissionPercent: null,
    limits: {
      maxVehicles: 10,
      maxBranches: null,
      maxMembers: null,
      termPrices: [
        { months: 1, price: '100000' },
        { months: 12, price: '800000' },
      ],
      salesOnly: false,
      recommended: false,
      graceDays: 7,
      features: [],
      ...limits,
    },
    currency: 'VND',
    subscriptionCount: 3,
    deletable: false,
    status: 'active',
    sortOrder: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Plan;
}

const COMMISSION = plan({
  id: 'p0',
  code: 'free',
  name: 'Tuyến hoa hồng mặc định',
  billingMode: 'commission',
  commissionPercent: 10,
});

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function renderPage() {
  return renderWithIntl(
    <App>
      <AdminPlansPage />
    </App>,
  );
}

function renderPageWith(plans: Plan[]) {
  setQuery({ data: plans });
  return renderPage();
}

function table() {
  return within(screen.getByRole('table'));
}

function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

/** Tham số URL mới nhất mà trang ghi qua `router.replace`. */
function lastUrlParams(): URLSearchParams {
  const url = nav.replace.mock.calls.at(-1)?.[0] as string;
  return new URLSearchParams(url.split('?')[1] ?? '');
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  query.refetch.mockReset();
  setStatus.mutate.mockReset();
  setStatus.isPending = false;
  setStatus.variables = undefined;
  Object.assign(modal, { open: false, plan: null, template: null, allowCommission: undefined });
  setQuery();
});

afterEach(cleanup);

describe('/manage/admin/plans — nạp dữ liệu', () => {
  it('luôn lấy TẤT CẢ gói từ API; lọc là việc phía client', () => {
    renderPageWith([plan()]);
    expect(query.lastStatus).toBe('all');
  });

  it('đang tải lần đầu: KHÔNG hiện câu "chưa có gói"', () => {
    setQuery({ isFetching: true });
    renderPage();
    expect(screen.queryByText('Chưa có gói nào')).toBeNull();
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại, KHÔNG hiện thẻ số liệu toàn số 0', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách gói')).toBeTruthy();
    expect(screen.queryByText('Tổng gói dịch vụ')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng', () => {
    setQuery({ isError: true, data: [plan()] });
    renderPage();

    expect(table().getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.queryByText('Không tải được danh sách gói')).toBeNull();
  });
});

describe('/manage/admin/plans — thẻ số liệu', () => {
  it('đếm trên TOÀN danh mục và cộng lượt đăng ký', () => {
    renderPageWith([
      COMMISSION,
      plan({ id: 'a', subscriptionCount: 5 }),
      plan({ id: 'b', status: 'archived', subscriptionCount: 2 }),
    ]);

    const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(within(card('Tổng gói dịch vụ')).getByText('3')).toBeTruthy();
    // 5 + 2 — 3 lượt của tuyến hoa hồng là gán tự động, không phải mua gói.
    expect(within(card('Tổng lượt đăng ký')).getByText('7')).toBeTruthy();
  });
});

describe('/manage/admin/plans — bảng', () => {
  it('KHÔNG dựng thanh phân trang — API trả cả danh sách', () => {
    const { container } = renderPageWith([plan(), plan({ id: 'p2', name: 'Gói pro' })]);
    expect(container.querySelector('.ant-pagination')).toBeNull();
    expect(screen.getByText('Hiển thị 2 / 2 gói dịch vụ')).toBeTruthy();
  });

  it('hiện STT, tên, mô tả và mã gói', () => {
    renderPageWith([plan()]);

    expect(table().getByText('1')).toBeTruthy();
    expect(table().getByText('Gói cơ bản')).toBeTruthy();
    expect(table().getByText('Cho shop nhỏ')).toBeTruthy();
    expect(table().getByText('Mã: shop-basic')).toBeTruthy();
  });

  it('giá đầu bảng là giá THÁNG, bảng giá đủ kỳ nằm sau dấu "i"', () => {
    renderPageWith([plan()]);

    expect(table().getByText('100.000 ₫')).toBeTruthy();
    expect(table().getByText('/ tháng')).toBeTruthy();
    expect(table().getByRole('button', { name: 'Bảng giá đầy đủ của Gói cơ bản' })).toBeTruthy();
    // Bản chỉ-dành-cho-trình-đọc của tooltip mang đủ các kỳ.
    expect(table().getByText('12 tháng · 800.000 ₫')).toBeTruthy();
  });

  it('không bán kỳ 1 tháng thì giá đầu bảng nói rõ số tháng', () => {
    renderPageWith([plan({}, { termPrices: [{ months: 6, price: '450000' }] })]);
    expect(table().getByText('/ 6 tháng')).toBeTruthy();
  });

  it('tuyến hoa hồng: % / chuyến và trần Owner Lite — KHÔNG "Không giới hạn"', () => {
    renderPageWith([
      plan(
        { billingMode: 'commission', commissionPercent: 10 },
        { maxVehicles: null, maxBranches: null, termPrices: [] },
      ),
    ]);

    expect(table().getByText('Hoa hồng theo chuyến')).toBeTruthy();
    expect(table().getByText('10%')).toBeTruthy();
    expect(table().getByText('/ chuyến')).toBeTruthy();
    expect(table().getByText('Tối đa 3 xe')).toBeTruthy();
    expect(table().getByText('Tối đa 1 chi nhánh')).toBeTruthy();
    expect(table().queryByText(/Không giới hạn/)).toBeNull();
  });

  it('trần rỗng của một BẬC GÓI nghĩa là không giới hạn', () => {
    renderPageWith([plan({}, { maxVehicles: null, maxBranches: null })]);

    expect(table().getByText('Không giới hạn số xe')).toBeTruthy();
    expect(table().getByText('Không giới hạn chi nhánh')).toBeTruthy();
  });

  it('bậc bán qua tư vấn: loại "Liên hệ báo giá", không có giá niêm yết', () => {
    renderPageWith([plan({}, { salesOnly: true, termPrices: [] })]);

    expect(table().getByText('Liên hệ báo giá')).toBeTruthy();
    expect(table().getByText('Liên hệ để được tư vấn')).toBeTruthy();
  });
});

describe('/manage/admin/plans — bộ lọc trên URL', () => {
  const plans = [
    plan({ id: 'a', name: 'Gói A', status: 'active' }),
    plan({ id: 'b', name: 'Gói B', status: 'archived' }),
    COMMISSION,
  ];

  it('mặc định hiện hết', () => {
    renderPageWith(plans);
    expect(bodyRows()).toHaveLength(3);
  });

  it('đọc bộ lọc từ URL: ?status=archived chỉ giữ gói đã tắt', () => {
    nav.params = new URLSearchParams('status=archived');
    renderPageWith(plans);

    expect(table().getByText('Gói B')).toBeTruthy();
    expect(table().queryByText('Gói A')).toBeNull();
    expect(screen.getByText('Hiển thị 1 / 3 gói dịch vụ')).toBeTruthy();
  });

  it('tìm KHÔNG DẤU theo tên', () => {
    nav.params = new URLSearchParams('q=tuyen hoa hong');
    renderPageWith(plans);

    expect(bodyRows()).toHaveLength(1);
    expect(table().getByText('Tuyến hoa hồng mặc định')).toBeTruthy();
  });

  it('lọc theo loại gói', () => {
    nav.params = new URLSearchParams('kind=commission');
    renderPageWith(plans);

    expect(bodyRows()).toHaveLength(1);
  });

  it('không có kết quả: câu riêng + nút xoá bộ lọc ghi lại URL sạch', () => {
    nav.params = new URLSearchParams('q=khong-ton-tai');
    renderPageWith(plans);

    expect(screen.getByText('Không có gói nào khớp bộ lọc')).toBeTruthy();
    const clearButtons = screen.getAllByRole('button', { name: 'Xoá bộ lọc' });
    fireEvent.click(clearButtons[clearButtons.length - 1]!);
    expect(lastUrlParams().toString()).toBe('');
  });
});

describe('/manage/admin/plans — tạo, sửa, nhân bản', () => {
  it('rỗng: mở lối tạo gói đầu tiên', () => {
    setQuery({ data: [] });
    renderPage();

    expect(screen.getByText('Chưa có gói nào')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Tạo gói dịch vụ/ })[0]!);
    expect(screen.getByTestId('plan-form').textContent).toBe('new');
  });

  it('"Tạo gói dịch vụ" mở form rỗng; đã có tuyến hoa hồng thì KHÔNG cho chọn hoa hồng', () => {
    renderPageWith([COMMISSION, plan()]);

    fireEvent.click(screen.getByRole('button', { name: /Tạo gói dịch vụ/ }));
    expect(screen.getByTestId('plan-form').textContent).toBe('new');
    expect(modal.allowCommission).toBe(false);
  });

  it('danh mục CHƯA có tuyến hoa hồng thì cho chọn', () => {
    renderPageWith([plan()]);
    expect(modal.allowCommission).toBe(true);
  });

  it('"Chỉnh sửa" mở form với đúng gói', () => {
    renderPageWith([plan({ id: 'p-42' })]);

    fireEvent.click(table().getByRole('button', { name: 'Chỉnh sửa' }));
    expect(screen.getByTestId('plan-form').textContent).toBe('edit:p-42');
  });

  it('"Nhân bản" mở form TẠO MỚI điền sẵn từ gói đó', () => {
    renderPageWith([plan({ id: 'p-7' })]);

    fireEvent.click(table().getByRole('button', { name: 'Nhân bản' }));
    expect(screen.getByTestId('plan-form').textContent).toBe('duplicate:p-7');
  });

  it('tuyến hoa hồng KHÔNG nhân bản được — bậc thứ hai bị server từ chối', () => {
    renderPageWith([COMMISSION]);

    expect(table().getByRole('button', { name: 'Chỉnh sửa' })).toBeTruthy();
    expect(table().queryByRole('button', { name: 'Nhân bản' })).toBeNull();
  });
});

describe('/manage/admin/plans — công tắc bật/tắt gói', () => {
  it('tắt gói: hỏi lại, nói rõ thuê bao KHÔNG bị huỷ, rồi mới gọi archive', async () => {
    renderPageWith([plan({ id: 'p-7', name: 'Gói nâng cao', status: 'active' })]);

    const toggle = table().getByRole('switch', { name: 'Bật hoặc tắt gói Gói nâng cao' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(setStatus.mutate).not.toHaveBeenCalled();

    expect(await screen.findAllByText('Ngừng hoạt động gói “Gói nâng cao”?')).not.toHaveLength(0);
    expect(screen.getByText(/không mua mới được gói này/)).toBeTruthy();
    // Công tắc KHÔNG tự lật trước khi server xác nhận.
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Ngừng hoạt động' }));
    await waitFor(() => expect(setStatus.mutate).toHaveBeenCalledTimes(1));
    expect(setStatus.mutate.mock.calls[0]![0]).toEqual({ id: 'p-7', status: 'archived' });
  });

  it('gói đã tắt MỞ LẠI được — cũng qua hộp xác nhận', async () => {
    renderPageWith([plan({ id: 'p-8', name: 'Gói cũ', status: 'archived' })]);

    const toggle = table().getByRole('switch', { name: 'Bật hoặc tắt gói Gói cũ' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);

    expect(await screen.findAllByText('Mở lại gói “Gói cũ”?')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mở lại gói' }));
    await waitFor(() => expect(setStatus.mutate).toHaveBeenCalledTimes(1));
    expect(setStatus.mutate.mock.calls[0]![0]).toEqual({ id: 'p-8', status: 'active' });
  });

  it('thành công thì báo; lỗi thì báo theo MÃ', async () => {
    renderPageWith([plan({ id: 'p-9', name: 'Gói X', status: 'archived' })]);

    fireEvent.click(table().getByRole('switch', { name: 'Bật hoặc tắt gói Gói X' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở lại gói' }));
    await waitFor(() => expect(setStatus.mutate).toHaveBeenCalled());
    setStatus.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Đã mở lại gói “Gói X”')).toBeTruthy();
  });

  it('đang gửi thì công tắc của ĐÚNG hàng đó quay', () => {
    setStatus.isPending = true;
    setStatus.variables = { id: 'b', status: 'archived' };
    renderPageWith([plan({ id: 'a', name: 'A' }), plan({ id: 'b', name: 'B' })]);

    const loading = (name: string) =>
      table()
        .getByRole('switch', { name: `Bật hoặc tắt gói ${name}` })
        .className.includes('ant-switch-loading');
    expect(loading('B')).toBe(true);
    expect(loading('A')).toBe(false);
  });

  /*
   * Tuyến hoa hồng là cửa vào của cả sàn — backend chặn archive bằng `DEFAULT_PLAN_PROTECTED`, và
   * một công tắc chỉ để báo lỗi là một công tắc sai.
   */
  it('tuyến hoa hồng: nhãn "Tuyến mặc định", luôn hoạt động, KHÔNG có công tắc', () => {
    renderPageWith([COMMISSION]);

    expect(table().getByText('Tuyến mặc định')).toBeTruthy();
    expect(table().getByText('Đang hoạt động')).toBeTruthy();
    expect(table().queryByRole('switch')).toBeNull();
    expect(table().getByRole('button', { name: 'Giải thích về tuyến mặc định' })).toBeTruthy();
  });

  it('đầu trang giải thích hai loại gói bằng dấu "i", không bằng một băng chữ', () => {
    renderPageWith([plan()]);

    expect(screen.getByRole('button', { name: 'Giải thích về các loại gói' })).toBeTruthy();
    expect(screen.getByText(/chỉ chặn việc mua MỚI/)).toBeTruthy();
  });
});
