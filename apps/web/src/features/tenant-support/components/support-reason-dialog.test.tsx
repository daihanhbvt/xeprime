import { ApiClientError } from '@xeprime/api-client';
import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { API_ERROR_CODE, SUPPORT_CAPABILITY, SUPPORT_REASON_HEADER } from '@xeprime/types';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import { recoverSupportReason } from '@/services/support-reason';
import { SupportReasonDialog } from './SupportReasonDialog';

/**
 * Hộp thoại lý do riêng (ADR 0050 §13): nói đúng hậu quả của thao tác, đòi lý do đủ cụ thể, và gửi
 * duyệt thay chủ xe cần xác nhận lần hai.
 */
function required(capabilities: string[]) {
  return new ApiClientError({
    status: 428,
    code: API_ERROR_CODE.SUPPORT_REASON_REQUIRED,
    message: 'x',
    details: { capabilities, invalid: false },
  });
}

const TARGET = { method: 'POST', path: '/vehicles/A' };

function mount() {
  return renderWithIntl(
    <App>
      <SupportReasonDialog />
    </App>,
  );
}

afterEach(() => cleanup());

describe('SupportReasonDialog', () => {
  it('chuyển chi nhánh: nói rõ vị trí công khai đổi; lý do chung chung bị từ chối; lý do cụ thể đi tiếp', async () => {
    mount();
    const pending = recoverSupportReason(
      required([SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN]),
      TARGET,
    );
    await screen.findByText('Chuyển xe sang chi nhánh khác');
    screen.getByText(/Vị trí công khai của xe trên chợ sẽ đổi/);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hỗ trợ theo yêu cầu' } });
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận và thực hiện/ }));
    await screen.findByText(/Lý do chưa đủ cụ thể/);

    fireEvent.change(input, {
      target: { value: 'Chủ xe gọi hotline nhờ chuyển xe — ticket #5521' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận và thực hiện/ }));
    await expect(pending).resolves.toEqual({
      [SUPPORT_REASON_HEADER]: encodeURIComponent(
        'Chủ xe gọi hotline nhờ chuyển xe — ticket #5521',
      ),
    });
  });

  it('gửi duyệt thay chủ xe: phải tick xác nhận chủ xe đã yêu cầu', async () => {
    mount();
    const pending = recoverSupportReason(
      required([SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW]),
      TARGET,
    );
    await screen.findByText('Gửi xe đi duyệt thay chủ xe');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Chủ xe nhờ gửi duyệt xe Vios — ticket #88' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận và thực hiện/ }));
    await screen.findByText('Cần xác nhận chủ xe đã yêu cầu');

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận và thực hiện/ }));
    await expect(pending).resolves.not.toBeNull();
  });

  it('huỷ → request không được gửi lại', async () => {
    mount();
    const pending = recoverSupportReason(
      required([SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE]),
      TARGET,
    );
    await screen.findByText('Khoá lịch xe');
    fireEvent.click(screen.getByRole('button', { name: /Huỷ|Hủy|Cancel/ }));
    await waitFor(() => expect(pending).resolves.toBeNull());
  });
});
