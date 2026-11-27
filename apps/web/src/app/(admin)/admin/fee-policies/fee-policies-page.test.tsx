import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEE_POLICY_STATUS } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import { feePolicyFixture as policy } from '@/features/fee-policies/test-fixtures';
import type { FeePolicy } from '@/features/fee-policies/types';

import AdminFeePoliciesPage from './page';

/**
 * Quản trị chính sách phí — ADR 0028 điều 2–5.
 *
 * Ba luật được khoá ở đây:
 *
 *  1. **Bản đã hiệu lực là BẤT BIẾN.** "Sửa chính sách" không PATCH bản đang chạy: nó mở form soạn
 *     một BẢN NHÁP từ bản đó (giữ tên), hoặc mở tiếp bản nháp đang có — không đẻ bản nháp thứ hai.
 *  2. **Có blocker thì KHÔNG áp dụng được.** Blocker là "thuế chưa có căn cứ", "bảo hiểm chưa có đối
 *     tác thật" — bật cổng trước khi có căn cứ là đúng thứ ADR 0028 điều 4–5 cấm.
 *  3. **Ba sổ không lẫn nhau.** Sổ mặc định trình bày đúng MỘT bản đang chạy; nháp và lịch sử ở sổ
 *     riêng, sống ở `?view=`.
 */

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/manage/admin/fee-policies',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as FeePolicy[] | undefined,
  isError: false,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
}));

const activate = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  variables: undefined,
}));
const discard = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));

vi.mock('@/features/fee-policies/hooks/use-fee-policies', () => ({
  useFeePolicies: () => query,
  useActivateFeePolicy: () => activate,
  useDiscardFeePolicyDraft: () => discard,
  useCreateFeePolicyDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateFeePolicyDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function renderPage() {
  return renderWithIntl(
    <App>
      <AdminFeePoliciesPage />
    </App>,
  );
}

function rowOf(text: string): HTMLElement {
  return screen.getByText(text).closest('tr') as HTMLElement;
}

function cardOf(title: string): HTMLElement {
  return screen.getByRole('region', { name: title });
}

/** Tham số URL của lần ghi cuối — công tắc sổ đi qua `router.replace` (ADR 0004). */
function lastUrl(): string {
  return nav.replace.mock.calls.at(-1)?.[0] as string;
}

const RATES = {
  self_drive: { vatPercent: 5, pitPercent: 2 },
  long_term: { vatPercent: 5, pitPercent: 2 },
  with_driver: { vatPercent: 3, pitPercent: 1.5 },
};

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  query.data = [policy()];
  query.isError = false;
  query.isLoading = false;
  query.isFetching = false;
  query.refetch.mockReset();
  activate.mutate.mockReset();
  discard.mutate.mockReset();
});

afterEach(cleanup);

describe('/admin/fee-policies - sổ "Đang áp dụng" trình bày bản đang chạy', () => {
  it('đầu trang: tên, phiên bản, ngày áp dụng, người áp dụng', () => {
    renderPage();

    const hero = screen.getByRole('region', { name: 'Chính sách đang áp dụng' });
    expect(within(hero).getByText('Pilot - phí dịch vụ 10%')).toBeTruthy();
    expect(within(hero).getByText(/Phiên bản 1 · áp dụng từ .* · bởi Admin/)).toBeTruthy();
  });

  it('các thẻ đủ số luồng tiền v2: phí sàn, nấc hoa hồng, giữ chỗ, giới hạn, thuế', () => {
    renderPage();

    expect(within(cardOf('Phí sàn phía khách (S)')).getByText('50.000 ₫/chuyến')).toBeTruthy();
    const commission = cardOf('Hoa hồng chủ xe lũy tiến (H)');
    expect(within(commission).getByText('Ngày 1-2')).toBeTruthy();
    expect(within(commission).getByText('Ngày 8-30')).toBeTruthy();
    expect(within(commission).getByText('Từ ngày 31')).toBeTruthy();
    expect(within(cardOf('Tiền giữ chỗ')).getByText('30%')).toBeTruthy();
    // Hai trần cùng 30 ngày (ADR 0091 điều 4): đặt trước tối đa + chuyến tự lái dài tối đa.
    const limits = cardOf('Giới hạn đặt xe');
    expect(within(limits).getByText('Đặt trước tối đa (tự lái, có tài xế)')).toBeTruthy();
    expect(within(limits).getByText('Chuyến tự lái dài tối đa')).toBeTruthy();
    expect(within(limits).getAllByText('30 ngày')).toHaveLength(2);
    // Thuế tắt — nói "chưa áp dụng", không nói 0%.
    expect(within(cardOf('Thuế khấu trừ')).getByText('Chưa áp dụng')).toBeTruthy();
    // Bảo hiểm KHÔNG còn là số của chính sách phí — quản lý ở Admin › Bảo hiểm (ADR 0098).
    expect(screen.queryByRole('region', { name: 'Bảo hiểm' })).toBeNull();
  });

  it('phí sàn theo ngày hiện rõ cách tính từng loại xe (ADR 0098)', () => {
    query.data = [policy({ customerPlatformFeeBasis: { car: 'per_day', motorbike: 'per_trip' } })];
    renderPage();
    const card = cardOf('Phí sàn phía khách (S)');
    expect(within(card).getByText('50.000 ₫/ngày')).toBeTruthy();
    expect(within(card).getByText('30.000 ₫/chuyến')).toBeTruthy();
  });

  it('thẻ hoa hồng nói phạm vi ngay đầu: gian hàng gói được miễn', () => {
    renderPage();
    expect(
      within(cardOf('Hoa hồng chủ xe lũy tiến (H)')).getByText(
        'Phạm vi áp dụng: Chủ xe cá nhân (Tuyến hoa hồng). Xe gói / Gian hàng: Miễn phí (H = 0).',
      ),
    ).toBeTruthy();
  });

  it('thuế bật: thẻ thuế hiện căn cứ và bảng GTGT/TNCN', () => {
    query.data = [
      policy({ taxEnabled: true, taxRates: RATES, taxLegalBasis: 'NĐ 117/2025/NĐ-CP' }),
    ];
    renderPage();

    const tax = cardOf('Thuế khấu trừ');
    expect(within(tax).getByText('NĐ 117/2025/NĐ-CP')).toBeTruthy();
    expect(within(tax).getByText('Nhóm vận tải')).toBeTruthy();
    expect(within(tax).getByText('4,5%')).toBeTruthy();
  });
});

describe('/admin/fee-policies - sửa chính sách', () => {
  it('"Sửa chính sách" soạn bản nháp TỪ bản đang chạy, giữ nguyên tên', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Sửa chính sách' }));
    expect(await screen.findByText('Sửa chính sách phí (đang áp dụng: phiên bản 1)')).toBeTruthy();
    expect((screen.getByLabelText('Tên chính sách') as HTMLInputElement).value).toBe(
      'Pilot - phí dịch vụ 10%',
    );
  });

  it('nút "Sửa" của một thẻ mở form ở đúng tab', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Sửa Thuế khấu trừ' }));
    await screen.findByText('Sửa chính sách phí (đang áp dụng: phiên bản 1)');
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Thuế');
  });

  it('đã có bản nháp: nút chính mở TIẾP bản nháp đó, sổ mặc định nhắc nó', async () => {
    query.data = [
      policy(),
      policy({ id: 'D2', version: 2, status: FEE_POLICY_STATUS.DRAFT, name: 'Nháp v2' }),
    ];
    renderPage();

    expect(screen.getByText('Bản nháp phiên bản 2 chưa áp dụng')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục sửa bản nháp' }));
    expect(await screen.findByText('Sửa bản nháp - phiên bản 2')).toBeTruthy();
  });

  it('bản nháp còn blocker: nhắc lý do, nút áp dụng bị khoá', () => {
    query.data = [
      policy(),
      policy({
        id: 'D2',
        version: 2,
        status: FEE_POLICY_STATUS.DRAFT,
        activationBlockers: ['insurance_requires_partner'],
      }),
    ];
    renderPage();

    expect(screen.getByText(/^Chưa áp dụng được: /)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Áp dụng/ }).hasAttribute('disabled')).toBe(true);
  });

  it('nhiều bản nháp: nhắc số lượng và mở sổ nháp', () => {
    query.data = [
      policy(),
      policy({ id: 'D2', version: 2, status: FEE_POLICY_STATUS.DRAFT }),
      policy({ id: 'D3', version: 3, status: FEE_POLICY_STATUS.DRAFT }),
    ];
    renderPage();

    expect(screen.getByText('Có 2 bản nháp chưa áp dụng')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem các bản nháp' }));
    expect(lastUrl()).toContain('view=draft');
  });

  it('chưa có bản nào hiệu lực: nói rõ và mời tạo', () => {
    query.data = [];
    renderPage();

    expect(screen.getByText('Chưa có chính sách phí đang áp dụng.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Tạo chính sách phí' }).length).toBeGreaterThan(0);
  });
});

describe('/admin/fee-policies - ba sổ: đang áp dụng · nháp · lịch sử', () => {
  const ARCHIVED = [
    policy({ id: 'A6', version: 6, name: 'Bản v6', status: FEE_POLICY_STATUS.ARCHIVED }),
    policy({ id: 'A7', version: 7, name: 'Bản v7', status: FEE_POLICY_STATUS.ARCHIVED }),
  ];
  const ACTIVE = policy({ id: 'V8', version: 8, name: 'Bản v8' });
  const DRAFT = policy({ id: 'D9', version: 9, name: 'Nháp v9', status: FEE_POLICY_STATUS.DRAFT });

  it('mặc định CHỈ trình bày bản đang áp dụng - bản lưu trữ và bản nháp không lẫn vào', () => {
    query.data = [...ARCHIVED, ACTIVE, DRAFT];
    renderPage();

    expect(screen.getByText('Bản v8')).toBeTruthy();
    expect(screen.queryByText('Bản v7')).toBeNull();
    expect(screen.queryByText('Nháp v9')).toBeNull();
    // Công tắc nói trước mỗi sổ có gì.
    expect(screen.getByText('Bản nháp (1)')).toBeTruthy();
    expect(screen.getByText('Lịch sử (2)')).toBeTruthy();
  });

  it('chuyển sang lịch sử ghi `?view=archived`; về "Đang áp dụng" thì XOÁ tham số', () => {
    query.data = [...ARCHIVED, ACTIVE];
    renderPage();

    fireEvent.click(screen.getByText('Lịch sử (2)'));
    expect(lastUrl()).toContain('view=archived');

    nav.params = new URLSearchParams('view=archived');
    cleanup();
    renderPage();
    fireEvent.click(screen.getByText('Đang áp dụng'));
    expect(lastUrl()).not.toContain('view=');
  });

  it('sổ lịch sử: phiên bản MỚI trước, chỉ xem / dùng lại - không sửa, không áp dụng', () => {
    nav.params = new URLSearchParams('view=archived');
    query.data = [...ARCHIVED, ACTIVE];
    renderPage();

    const names = screen.getAllByText(/^Bản v[67]$/).map((el) => el.textContent);
    expect(names).toEqual(['Bản v7', 'Bản v6']);
    expect(screen.queryByText('Bản v8')).toBeNull();
    expect(
      screen.getByText(
        'Các phiên bản đã lưu trữ chỉ để đối chiếu đơn cũ - đơn mới tính theo bản đang áp dụng: Bản v8 (phiên bản 8).',
      ),
    ).toBeTruthy();
    const row = rowOf('Bản v7');
    expect(within(row).queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Áp dụng' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Dùng lại làm bản nháp' })).toBeTruthy();
  });

  it('bảng tóm tắt: phí sàn, nấc hoa hồng, thuế theo loại dịch vụ, thuế một mức đời cũ', () => {
    nav.params = new URLSearchParams('view=archived');
    query.data = [
      ACTIVE,
      policy({
        id: 'A6',
        version: 6,
        name: 'Bản v6',
        status: FEE_POLICY_STATUS.ARCHIVED,
        taxEnabled: true,
        taxRates: RATES,
        vehicleProtectionEnabled: true,
        tripInsuranceEnabled: true,
      }),
      policy({
        id: 'A5',
        version: 5,
        name: 'Bản v5',
        status: FEE_POLICY_STATUS.ARCHIVED,
        taxEnabled: true,
        taxPercent: 10,
        taxLabel: 'VAT 5% + TNCN 5%',
      }),
    ];
    renderPage();

    const row = rowOf('Bản v6');
    expect(within(row).getByText('50.000 ₫/chuyến')).toBeTruthy();
    expect(within(row).getByText('30.000 ₫/chuyến')).toBeTruthy();
    expect(within(row).getByText('10% · 7% · 5% · 3%')).toBeTruthy();
    expect(within(row).getByText('7% · 7% · 4,5%')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Chi tiết mức thuế khấu trừ' })).toBeTruthy();
    expect(within(rowOf('Bản v5')).getByText('10% (một mức, chính sách cũ)')).toBeTruthy();
    // Tiêu đề cột nói rõ "chủ xe cá nhân", có dấu "i" giải thích gian hàng gói được miễn.
    expect(screen.getAllByText('Hoa hồng chủ xe cá nhân').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Giải thích về hoa hồng chủ xe cá nhân' }).length,
    ).toBeGreaterThan(0);
  });

  it('xem chi tiết một bản cũ mở panel đủ số v2', async () => {
    nav.params = new URLSearchParams('view=archived');
    query.data = [...ARCHIVED, ACTIVE];
    renderPage();

    fireEvent.click(within(rowOf('Bản v7')).getByRole('button', { name: 'Xem chi tiết' }));
    expect(await screen.findByText('Bản v7 - phiên bản 7')).toBeTruthy();
    expect(screen.getAllByText('Ngày 1-2').length).toBeGreaterThan(0);
  });

  it('`?view=` lạ rơi về sổ mặc định', () => {
    nav.params = new URLSearchParams('view=bogus');
    query.data = [...ARCHIVED, ACTIVE];
    renderPage();

    expect(screen.getByText('Bản v8')).toBeTruthy();
    expect(screen.queryByText('Bản v7')).toBeNull();
  });
});

describe('/admin/fee-policies - sổ bản nháp', () => {
  beforeEach(() => {
    nav.params = new URLSearchParams('view=draft');
  });

  it('áp dụng xong đưa người dùng về sổ "Đang áp dụng"', () => {
    query.data = [
      policy({ id: '02', status: FEE_POLICY_STATUS.DRAFT, name: 'Nháp v2', version: 2 }),
    ];
    activate.mutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) =>
      opts.onSuccess(),
    );
    renderPage();

    fireEvent.click(within(rowOf('Nháp v2')).getByRole('button', { name: 'Áp dụng' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Áp dụng' }).at(-1)!);

    expect(activate.mutate).toHaveBeenCalledTimes(1);
    expect(lastUrl()).not.toContain('view=');
  });

  it('không có blocker: áp dụng được; còn blocker: nút bị khoá', () => {
    query.data = [
      policy({ id: '02', status: FEE_POLICY_STATUS.DRAFT, name: 'Nháp v2', version: 2 }),
      policy({
        id: '03',
        status: FEE_POLICY_STATUS.DRAFT,
        name: 'Nháp bảo hiểm',
        version: 3,
        tripInsuranceEnabled: true,
        activationBlockers: ['insurance_requires_partner'],
      }),
    ];
    renderPage();

    expect(
      within(rowOf('Nháp v2')).getByRole('button', { name: 'Áp dụng' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(
      within(rowOf('Nháp bảo hiểm'))
        .getByRole('button', { name: 'Áp dụng' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('có nút tạo bản nháp trống', () => {
    query.data = [];
    renderPage();
    expect(screen.getByRole('button', { name: 'Tạo bản nháp trống' })).toBeTruthy();
  });
});
