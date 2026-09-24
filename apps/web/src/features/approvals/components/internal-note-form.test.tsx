import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { carReview } from '../test-utils';
import { InternalNoteForm } from './InternalNoteForm';

/**
 * Ghi chú NỘI BỘ: lưu tường minh, khoá lạc quan theo `updatedAt`, và khi xung đột thì người
 * duyệt CHỌN — không âm thầm xoá chữ của đồng nghiệp.
 */
const saveNote = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/use-vehicle-approvals', () => ({
  useSaveVehicleApprovalNote: () => saveNote,
}));

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    App: Object.assign(actual.App, { useApp: () => ({ message: messages }) }),
  };
});

const SAVED_AT = '2026-06-08T02:15:00.000Z';

function renderNote(note: string | null = 'Đã gọi chủ xe', updatedAt: string | null = SAVED_AT) {
  const detail = carReview({
    internalNote: { note, updatedAt, updatedByName: note ? 'Reviewer A' : null },
  });
  return render(
    <App>
      <InternalNoteForm detail={detail} />
    </App>,
  );
}

const textarea = () =>
  screen.getByRole('textbox', { name: /Ghi chú nội bộ/ }) as HTMLTextAreaElement;
const saveButton = () => screen.getByRole('button', { name: 'Lưu ghi chú' });

beforeEach(() => {
  saveNote.mutate.mockReset();
  messages.error.mockReset();
  messages.success.mockReset();
});

afterEach(cleanup);

describe('Ghi chú nội bộ', () => {
  it('nạp bản đã lưu + người sửa; chưa đổi gì thì nút Lưu khoá', () => {
    renderNote();

    expect(textarea().value).toBe('Đã gọi chủ xe');
    expect(screen.getByText(/Cập nhật lần cuối: .* · Reviewer A/)).toBeTruthy();
    expect(screen.getByText('Chỉ đội vận hành thấy — không gửi cho chủ xe.')).toBeTruthy();
    expect(saveButton()).toHaveProperty('disabled', true);
  });

  it('lưu gửi kèm MỐC đã đọc (khoá lạc quan)', async () => {
    renderNote();

    fireEvent.change(textarea(), { target: { value: 'Biển số khớp ảnh' } });
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(saveNote.mutate).toHaveBeenCalledWith(
        { id: carReview().approvalTaskId, note: 'Biển số khớp ảnh', expectedUpdatedAt: SAVED_AT },
        expect.anything(),
      ),
    );
  });

  it('chưa từng có ghi chú: mốc gửi lên là null', async () => {
    renderNote(null, null);

    fireEvent.change(textarea(), { target: { value: 'Ghi chú đầu tiên' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(saveNote.mutate).toHaveBeenCalledWith(
        { id: carReview().approvalTaskId, note: 'Ghi chú đầu tiên', expectedUpdatedAt: null },
        expect.anything(),
      ),
    );
  });

  it('xung đột: hiện bản đang lưu; "Ghi đè" gửi lại với mốc MỚI, chữ của tôi giữ nguyên', async () => {
    const latest = {
      note: 'Reviewer B: ảnh nội thất mờ',
      updatedAt: '2026-06-08T02:20:00.000Z',
      updatedByName: 'Reviewer B',
    };
    saveNote.mutate.mockImplementationOnce((_vars, options: { onError: (e: unknown) => void }) =>
      options.onError(
        new ApiClientError({
          code: API_ERROR_CODE.APPROVAL_NOTE_CONFLICT,
          message: 'conflict',
          status: 409,
          details: { current: latest },
        }),
      ),
    );
    renderNote();

    fireEvent.change(textarea(), { target: { value: 'Bản của tôi' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText('Ghi chú vừa được người khác sửa')).toBeTruthy());
    expect(screen.getByText('Reviewer B: ảnh nội thất mờ')).toBeTruthy();
    expect(textarea().value).toBe('Bản của tôi');
    expect(messages.error).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ghi đè bằng bản của tôi' }));
    await waitFor(() =>
      expect(saveNote.mutate).toHaveBeenLastCalledWith(
        {
          id: carReview().approvalTaskId,
          note: 'Bản của tôi',
          expectedUpdatedAt: latest.updatedAt,
        },
        expect.anything(),
      ),
    );
  });

  it('xung đột → "Dùng bản mới nhất": ô nhập lấy bản đang lưu, bỏ chữ đang gõ', async () => {
    const latest = {
      note: 'Bản mới nhất',
      updatedAt: '2026-06-08T02:20:00.000Z',
      updatedByName: 'Reviewer B',
    };
    saveNote.mutate.mockImplementationOnce((_vars, options: { onError: (e: unknown) => void }) =>
      options.onError(
        new ApiClientError({
          code: API_ERROR_CODE.APPROVAL_NOTE_CONFLICT,
          message: 'conflict',
          status: 409,
          details: { current: latest },
        }),
      ),
    );
    const { rerender } = renderNote();

    fireEvent.change(textarea(), { target: { value: 'Bản của tôi' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText('Ghi chú vừa được người khác sửa')).toBeTruthy());
    // Như luồng thật: hook đã ghi bản đang lưu vào cache chi tiết trước khi component xử lỗi.
    rerender(
      <App>
        <InternalNoteForm detail={carReview({ internalNote: latest })} />
      </App>,
    );
    // Chữ đang gõ KHÔNG bị ghi đè chỉ vì bản lưu đổi — người duyệt chưa chọn.
    expect(textarea().value).toBe('Bản của tôi');

    fireEvent.click(screen.getByRole('button', { name: 'Dùng bản mới nhất' }));
    await waitFor(() => expect(textarea().value).toBe('Bản mới nhất'));
  });

  it('báo panel khi có chữ CHƯA LƯU, và thôi báo khi chữ trở về bản đã lưu', async () => {
    const onDirtyChange = vi.fn();
    render(
      <App>
        <InternalNoteForm detail={carReview()} onDirtyChange={onDirtyChange} />
      </App>,
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(textarea(), { target: { value: 'Chữ đang gõ dở' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    fireEvent.change(textarea(), { target: { value: carReview().internalNote.note ?? '' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('lỗi khác: báo bằng câu dịch từ mã, không hiện khối xung đột', async () => {
    saveNote.mutate.mockImplementationOnce((_vars, options: { onError: (e: unknown) => void }) =>
      options.onError(
        new ApiClientError({
          code: API_ERROR_CODE.APPROVAL_ALREADY_DECIDED,
          message: 'x',
          status: 409,
        }),
      ),
    );
    renderNote();

    fireEvent.change(textarea(), { target: { value: 'Ghi thêm' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(messages.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Ghi chú vừa được người khác sửa')).toBeNull();
  });
});
