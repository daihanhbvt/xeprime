import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEE_POLICY_STATUS } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type { FeePolicy } from '@/features/fee-policies/types';

import AdminFeePoliciesPage from './page';

/**
 * Quản trị chính sách phí — ADR 0028 điều 2–5.
 *
 * Hai luật của ADR được khoá ở đây vì chúng là thứ dễ bị "sửa cho tiện" nhất:
 *
 *  1. **Bản đã hiệu lực là BẤT BIẾN.** Sửa một bản `active` là sửa số của những đơn đã tạo theo
 *     nó — nên hàng đó không có nút sửa, không chỉ là API từ chối.
 *  2. **Có blocker thì KHÔNG kích hoạt được.** Blocker là "thuế chưa có tên loại", "bảo hiểm chưa
 *     có đối tác thật" — bật cổng trước khi có căn cứ là đúng thứ ADR 0028 điều 4–5 cấm.
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
  isFetching: false,
  refetch: vi.fn(),
}));

const activate = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
const discard = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));

vi.mock('@/features/fee-policies/hooks/use-fee-policies', () => ({
  useFeePolicies: () => query,
  useActivateFeePolicy: () => activate,
  useDiscardFeePolicyDraft: () => discard,
  useCreateFeePolicyDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFeePolicyDraft: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function policy(over: Partial<FeePolicy> = {}): FeePolicy {
  return {
    id: '01POLICY',
    version: 1,
    status: FEE_POLICY_STATUS.ACTIVE,
    name: 'Pilot — phí dịch vụ 10%',
    note: null,
    serviceFeePercent: 0,
    depositPercent: 15,
    depositMinAmount: '0',
    depositMaxPercent: 30,
    holdMinAmount: '20000',
    holdPaymentWindowMinutes: 1440,
    freeCancelHours: 4,
    taxEnabled: false,
    taxRates: null,
    taxLegalBasis: null,
    taxPercent: null,
    taxLabel: null,
    tripInsuranceEnabled: false,
    tripInsurancePercent: null,
    vehicleProtectionEnabled: false,
    vehicleProtectionPercent: null,
    insurancePartnerName: null,
    customerPlatformFee: { car: '50000', motorbike: '30000' },
    ownerCommissionTiers: [
      { fromDay: 1, percent: 10 },
      { fromDay: 3, percent: 7 },
      { fromDay: 8, percent: 3 },
    ],
    vehicleProtectionDailyAmount: { car: '50000', motorbike: '15000' },
    tripInsuranceDailyAmount: { car: '20000', motorbike: '5000' },
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    effectiveTo: null,
    activatedByName: 'Admin',
    activatedAt: '2026-09-01T00:00:00.000Z',
    createdByName: 'Admin',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    activationBlockers: [],
    ...over,
  } as FeePolicy;
}

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

/** Tham số URL của lần ghi cuối — công tắc sổ đi qua `router.replace` (ADR 0004). */
function lastUrl(): string {
  return nav.replace.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  query.data = [policy()];
  query.isError = false;
  query.isFetching = false;
  query.refetch.mockReset();
  activate.mutate.mockReset();
  discard.mutate.mockReset();
});

afterEach(cleanup);

describe('/manage/admin/fee-policies — bản đang hiệu lực', () => {
  it('hiện tóm tắt luồng tiền v2: phí sàn, nấc hoa hồng, cọc, bảo hiểm, thuế', () => {
    renderPage();

    const row = rowOf('Pilot — phí dịch vụ 10%');
    expect(within(row).getByText('50.000 ₫ / 30.000 ₫')).toBeTruthy();
    expect(within(row).getByText('10% · 7% · 3%')).toBeTruthy();
    expect(within(row).getByText('15%')).toBeTruthy(); // phần giữ chỗ của chủ xe — ADR 0066
    // Bảo hiểm và thuế đều tắt — nói "chưa áp dụng", không nói 0%.
    expect(within(row).getAllByText('Chưa áp dụng')).toHaveLength(2);
  });

  it('bật bảo hiểm thì cột bảo hiểm gọi tên từng loại', () => {
    query.data = [policy({ vehicleProtectionEnabled: true, tripInsuranceEnabled: true })];
    renderPage();

    expect(screen.getByText('Vật chất xe · Tai nạn người')).toBeTruthy();
  });

  it('xem chi tiết mở panel đủ số v2', async () => {
    renderPage();

    fireEvent.click(within(rowOf('Pilot — phí dịch vụ 10%')).getByRole('button', { name: 'Xem chi tiết' }));

    expect(await screen.findByText('Hoa hồng chủ xe lũy tiến (H)')).toBeTruthy();
    expect(screen.getByText('Ngày 1–2')).toBeTruthy();
    expect(screen.getByText('Từ ngày 8')).toBeTruthy();
  });

  it('thuế bật: cột thuế tóm tắt mức tổng theo loại dịch vụ, panel hiện bảng GTGT/TNCN + căn cứ', async () => {
    const rates = {
      self_drive: { vatPercent: 5, pitPercent: 2 },
      long_term: { vatPercent: 5, pitPercent: 2 },
      with_driver: { vatPercent: 3, pitPercent: 1.5 },
    };
    query.data = [
      policy({ taxEnabled: true, taxRates: rates, taxLegalBasis: 'NĐ 117/2025/NĐ-CP' }),
    ];
    renderPage();

    const row = rowOf('Pilot — phí dịch vụ 10%');
    expect(within(row).getByText('7% · 7% · 4,5%')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Chi tiết mức thuế khấu trừ' })).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'Xem chi tiết' }));
    expect(await screen.findByText('NĐ 117/2025/NĐ-CP')).toBeTruthy();
    expect(screen.getByText('Nhóm vận tải')).toBeTruthy();
    expect(screen.getByText('4,5%')).toBeTruthy();
  });

  it('phiên bản cũ một mức (≤ v8) vẫn đọc được: cột thuế nói rõ là mức cũ', () => {
    query.data = [policy({ taxEnabled: true, taxPercent: 10, taxLabel: 'VAT 5% + TNCN 5%' })];
    renderPage();
    expect(screen.getByText('10% (một mức, chính sách cũ)')).toBeTruthy();
  });

  it('KHÔNG có lối sửa — bản đã hiệu lực là bất biến', () => {
    renderPage();

    const row = rowOf('Pilot — phí dịch vụ 10%');
    expect(within(row).queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Kích hoạt' })).toBeNull();
  });
});

describe('/manage/admin/fee-policies — phạm vi hoa hồng chủ xe', () => {
  /*
   * Nấc lũy tiến CHỈ áp cho tuyến hoa hồng; gian hàng có gói được miễn (H = 0 — ADR 0064 điều 3).
   * Thiếu chú thích, admin đọc cột "10% · 7% · 3%" thành phí của MỌI chủ xe.
   */
  it('tiêu đề cột nói rõ "chủ xe cá nhân", có dấu "i" giải thích gian hàng gói được miễn', () => {
    renderPage();

    // DataTable vẽ tiêu đề cột ở cả bảng lẫn nhãn của thẻ — chỉ cần có mặt.
    expect(screen.getAllByText('Hoa hồng chủ xe cá nhân').length).toBeGreaterThan(0);
    expect(screen.queryByText('Hoa hồng chủ xe')).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Giải thích về hoa hồng chủ xe cá nhân' }).length,
    ).toBeGreaterThan(0);
  });

  it('panel chi tiết ghi phạm vi áp dụng ngay đầu mục hoa hồng', async () => {
    renderPage();

    fireEvent.click(within(rowOf('Pilot — phí dịch vụ 10%')).getByRole('button', { name: 'Xem chi tiết' }));

    expect(
      await screen.findByText(
        'Phạm vi áp dụng: Chủ xe cá nhân (Tuyến hoa hồng). Xe gói / Gian hàng: Miễn phí (H = 0).',
      ),
    ).toBeTruthy();
  });
});

describe('/manage/admin/fee-policies — ba sổ: đang áp dụng · nháp · lịch sử', () => {
  const ARCHIVED = [
    policy({ id: 'A6', version: 6, name: 'Bản v6', status: FEE_POLICY_STATUS.ARCHIVED }),
    policy({ id: 'A7', version: 7, name: 'Bản v7', status: FEE_POLICY_STATUS.ARCHIVED }),
  ];
  const ACTIVE = policy({ id: 'V8', version: 8, name: 'Bản v8' });
  const DRAFT = policy({ id: 'D9', version: 9, name: 'Nháp v9', status: FEE_POLICY_STATUS.DRAFT });

  it('mặc định CHỈ hiện bản đang áp dụng — bản lưu trữ và bản nháp không lẫn vào', () => {
    query.data = [...ARCHIVED, ACTIVE, DRAFT];
    renderPage();

    expect(screen.getByText('Bản v8')).toBeTruthy();
    expect(screen.queryByText('Bản v7')).toBeNull();
    expect(screen.queryByText('Nháp v9')).toBeNull();
    // Công tắc nói trước mỗi sổ có gì.
    expect(screen.getByText('Bản nháp (1)')).toBeTruthy();
    expect(screen.getByText('Lịch sử lưu trữ (2)')).toBeTruthy();
  });

  it('có bản nháp chờ thì sổ mặc định nhắc, và nút nhắc mở sổ nháp', () => {
    query.data = [ACTIVE, DRAFT];
    renderPage();

    expect(screen.getByText('Có 1 bản nháp chưa kích hoạt.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản nháp' }));
    expect(lastUrl()).toContain('view=draft');
  });

  it('chuyển sang lịch sử ghi `?view=archived`; về "Đang áp dụng" thì XOÁ tham số', () => {
    query.data = [...ARCHIVED, ACTIVE];
    renderPage();

    fireEvent.click(screen.getByText('Lịch sử lưu trữ (2)'));
    expect(lastUrl()).toContain('view=archived');

    nav.params = new URLSearchParams('view=archived');
    cleanup();
    renderPage();
    fireEvent.click(screen.getByText('Đang áp dụng'));
    expect(lastUrl()).not.toContain('view=');
  });

  it('sổ lịch sử: phiên bản MỚI trước, kèm nhắc đơn mới tính theo bản đang áp dụng', () => {
    nav.params = new URLSearchParams('view=archived');
    query.data = [...ARCHIVED, ACTIVE];
    renderPage();

    const names = screen.getAllByText(/^Bản v[67]$/).map((el) => el.textContent);
    expect(names).toEqual(['Bản v7', 'Bản v6']);
    expect(screen.queryByText('Bản v8')).toBeNull();
    expect(
      screen.getByText(
        'Các phiên bản đã lưu trữ chỉ để đối chiếu đơn cũ — đơn mới tính theo bản đang áp dụng: Bản v8 (phiên bản 8).',
      ),
    ).toBeTruthy();
  });

  it('chưa có bản nào hiệu lực: sổ mặc định nói rõ và mời tạo nháp', () => {
    query.data = [DRAFT];
    renderPage();

    expect(
      screen.getByText('Chưa có chính sách đang áp dụng — tạo hoặc kích hoạt một bản nháp.'),
    ).toBeTruthy();
  });

  it('`?view=` lạ rơi về sổ mặc định', () => {
    nav.params = new URLSearchParams('view=bogus');
    query.data = [...ARCHIVED, ACTIVE];
    renderPage();

    expect(screen.getByText('Bản v8')).toBeTruthy();
    expect(screen.queryByText('Bản v7')).toBeNull();
  });
});

describe('/manage/admin/fee-policies — bản nháp', () => {
  beforeEach(() => {
    nav.params = new URLSearchParams('view=draft');
  });

  it('kích hoạt xong đưa người dùng về sổ "Đang áp dụng"', () => {
    query.data = [policy({ id: '02', status: FEE_POLICY_STATUS.DRAFT, name: 'Nháp v2', version: 2 })];
    activate.mutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    renderPage();

    fireEvent.click(within(rowOf('Nháp v2')).getByRole('button', { name: 'Kích hoạt' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Kích hoạt' }).at(-1)!);

    expect(activate.mutate).toHaveBeenCalledTimes(1);
    expect(lastUrl()).not.toContain('view=');
  });

  it('không có blocker: kích hoạt được', () => {
    query.data = [policy({ id: '02', status: FEE_POLICY_STATUS.DRAFT, name: 'Nháp v2', version: 2 })];
    renderPage();

    const row = rowOf('Nháp v2');
    expect(within(row).getByRole('button', { name: 'Kích hoạt' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('còn blocker: nút kích hoạt bị khoá', () => {
    query.data = [
      policy({
        id: '02',
        status: FEE_POLICY_STATUS.DRAFT,
        name: 'Nháp bảo hiểm',
        version: 2,
        tripInsuranceEnabled: true,
        tripInsurancePercent: 2,
        activationBlockers: ['insurance_requires_partner'],
      }),
    ];
    renderPage();

    const row = rowOf('Nháp bảo hiểm');
    expect(within(row).getByRole('button', { name: 'Kích hoạt' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
