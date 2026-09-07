import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SELLER_PROFILE_STATUS } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type { SellerProfile } from '../types';

import { SellerProfileWorkspace } from './SellerProfileWorkspace';

/**
 * Hồ sơ người bán — ADR 0028 release gate 1.
 *
 * Hai điều được khoá ở đây, và cả hai đều là quy tắc của SERVER mà màn hình chỉ được PHẢN ÁNH,
 * không được tự suy:
 *
 *  1. **`missingFields` đến từ API.** Nó phụ thuộc `entityType` (cá nhân cần CCCD, doanh nghiệp
 *     cần MST) và điều kiện đó sống ở `SellerProfileService.missingFields`. Client tự đoán lại là
 *     hẹn ngày hai bên lệch nhau — người dùng thấy nút sáng rồi bị server từ chối.
 *  2. **`editable` quyết định khoá form**, không phải trạng thái. Hồ sơ đang chờ xác minh thì
 *     không sửa được; sửa tiếp rồi tưởng đã lưu là cách mất một lần duyệt.
 */

const query = vi.hoisted(() => ({
  data: undefined as SellerProfile | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

const save = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const submit = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-seller-profile', () => ({
  useSellerProfile: () => query,
  useSaveSellerProfile: () => save,
  useSubmitSellerProfile: () => submit,
}));

function profile(over: Partial<SellerProfile> = {}): SellerProfile {
  return {
    id: '01SELLER',
    entityType: 'individual',
    legalName: 'Nguyen Van A',
    taxId: null,
    idNumber: '079123456789',
    idIssuedAt: null,
    idIssuedBy: null,
    bankCode: 'VCB',
    bankAccountNumber: '0123456789',
    bankAccountName: 'NGUYEN VAN A',
    status: SELLER_PROFILE_STATUS.DRAFT,
    submittedAt: null,
    verifiedAt: null,
    reviewNote: null,
    editable: true,
    missingFields: [],
    ...over,
  } as SellerProfile;
}

function renderPage() {
  return renderWithIntl(
    <App>
      <SellerProfileWorkspace />
    </App>,
  );
}

beforeEach(() => {
  query.data = undefined;
  query.isLoading = false;
  query.isError = false;
  query.refetch.mockReset();
  save.mutate.mockReset();
  save.isPending = false;
  submit.mutate.mockReset();
  submit.isPending = false;
});

afterEach(cleanup);

describe('SellerProfileWorkspace — gửi xác minh', () => {
  it('đủ trường: nút gửi xác minh bấm được', () => {
    query.data = profile();
    renderPage();

    const button = screen.getByRole('button', { name: /Gửi xác minh/ });
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('còn trường thiếu: khoá nút gửi và liệt kê ĐÚNG các trường server báo', () => {
    query.data = profile({ missingFields: ['bankCode', 'idNumber'] });
    renderPage();

    expect(screen.getByRole('button', { name: /Gửi xác minh/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Mã ngân hàng · Số CCCD/hộ chiếu')).toBeTruthy();
  });

  it('mã lạ từ server hiện lại chính nó, không nổ giữa màn', () => {
    query.data = profile({ missingFields: ['somethingNew'] });
    renderPage();

    expect(screen.getByText('somethingNew')).toBeTruthy();
  });
});

describe('SellerProfileWorkspace — chỉ xem', () => {
  it('đang chờ xác minh: không có nút lưu lẫn nút gửi', () => {
    query.data = profile({ status: SELLER_PROFILE_STATUS.SUBMITTED, editable: false });
    renderPage();

    expect(screen.queryByRole('button', { name: /Gửi xác minh/ })).toBeNull();
    expect(screen.getByText('Hồ sơ đang chờ xác minh — không sửa được lúc này.')).toBeTruthy();
  });

  it('bị yêu cầu bổ sung: hiện đúng ghi chú của người duyệt', () => {
    query.data = profile({
      status: SELLER_PROFILE_STATUS.CHANGES_REQUESTED,
      reviewNote: 'Ảnh CCCD mờ, gửi lại giúp mình',
    });
    renderPage();

    expect(screen.getByText('Ảnh CCCD mờ, gửi lại giúp mình')).toBeTruthy();
  });
});
