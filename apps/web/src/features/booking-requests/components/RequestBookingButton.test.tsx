import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hasBookingDraft, saveBookingDraft } from '../booking-draft';
import { PICKUP_METHOD } from '../schema';
import { RequestBookingButton } from './RequestBookingButton';

/**
 * CTA vào luồng thuê ở trang chi tiết xe (Wave 11.1).
 *
 * Điều được khoá là RANH GIỚI THUẬT NGỮ, thứ rất dễ bị "thống nhất" nhầm bằng một lần
 * find-and-replace: nút mở luồng nói `Chọn thuê` (khách mới đang chọn xe), còn tên nghiệp vụ
 * `Yêu cầu thuê` vẫn sống ở tiêu đề modal và nút gửi cuối cùng — nơi khách thật sự gửi đi.
 *
 * Và (ADR 0060) lối QUAY VỀ sau đăng nhập Google/Facebook: có bản nháp của chính xe này + đã có
 * phiên thì hộp tự mở lại; khách tự đóng hộp thì bản nháp bị bỏ.
 */
/**
 * `updatedAt` là `dataUpdatedAt` của `/auth/me`: bỏ trống ⇒ "vừa nạp" (mới hơn mọi bản nháp);
 * đặt một mốc cũ ⇒ cache còn giữ người dùng của một phiên đã chết.
 */
const session = vi.hoisted(() => ({
  user: undefined as { id: string } | undefined,
  updatedAt: undefined as number | undefined,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: session.user,
    dataUpdatedAt: session.updatedAt ?? (session.user ? Number.MAX_SAFE_INTEGER : 0),
  }),
}));

vi.mock('./RequestBookingModal', () => ({
  RequestBookingModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Yêu cầu thuê xe">
        <button type="button">Gửi yêu cầu thuê xe</button>
        <button type="button" onClick={onClose}>
          Huỷ
        </button>
      </div>
    ) : null,
}));

beforeEach(() => {
  session.user = undefined;
  session.updatedAt = undefined;
  window.sessionStorage.clear();
});
afterEach(cleanup);

function renderCta(vehicleId = 'V1') {
  return render(<RequestBookingButton vehicleId={vehicleId} vehicleName="Toyota Camry 2024" />);
}

function seedDraft(vehicleId: string) {
  saveBookingDraft(vehicleId, {
    values: {
      serviceType: 'self_drive',
      routeType: 'in_city',
      pickupMethod: PICKUP_METHOD.SELF,
      pickupAt: null,
      returnAt: null,
      requestedPickupDate: null,
    } as never,
    rentalMode: 'daily',
    promoCode: null,
  });
}

describe('RequestBookingButton', () => {
  it('nhãn CTA là `Chọn thuê`, không phải tên nghiệp vụ', () => {
    renderCta();
    expect(screen.getByRole('button', { name: 'Chọn thuê' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yêu cầu thuê' })).toBeNull();
  });

  it('bấm vào mở đúng modal cũ, không phải một luồng thứ hai', () => {
    renderCta();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn thuê' }));

    const dialog = screen.getByRole('dialog');
    // Tiêu đề nghiệp vụ giữ nguyên: đây vẫn là luồng gửi YÊU CẦU thuê.
    expect(dialog.getAttribute('aria-label')).toBe('Yêu cầu thuê xe');
  });

  it('nút gửi cuối cùng vẫn nói rõ là GỬI YÊU CẦU', () => {
    renderCta();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thuê' }));
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
  });
});

describe('RequestBookingButton — quay về sau đăng nhập (ADR 0060)', () => {
  it('có bản nháp của xe này + đã có phiên ⇒ hộp tự mở lại', () => {
    seedDraft('V1');
    session.user = { id: 'U1' };
    renderCta('V1');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('chưa đăng nhập thì KHÔNG tự mở — khách tự bấm "Chọn thuê"', () => {
    seedDraft('V1');
    renderCta('V1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * Bản nháp ghi lúc phiên vừa chết (401 khi gửi) rồi khách đi lùi/tới trong app: cache vẫn còn
   * người dùng CŨ. Người đó KHÔNG phải "vừa đăng nhập" — tự mở là đi tiếp sau lưng hộp đăng nhập
   * bằng một phiên không còn.
   */
  it('cache còn người dùng của phiên CŨ (nạp trước bản nháp) ⇒ KHÔNG tự mở', () => {
    session.user = { id: 'U1' };
    session.updatedAt = 1;
    seedDraft('V1');
    renderCta('V1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bản nháp của xe KHÁC không mở hộp của xe này', () => {
    seedDraft('V2');
    session.user = { id: 'U1' };
    renderCta('V1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('khách tự đóng hộp ⇒ bỏ bản nháp, lần ghé sau không bật lại', () => {
    seedDraft('V1');
    session.user = { id: 'U1' };
    renderCta('V1');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hasBookingDraft('V1')).toBe(false);
  });
});
