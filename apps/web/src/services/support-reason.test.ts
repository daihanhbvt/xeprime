import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE, SUPPORT_CAPABILITY, SUPPORT_REASON_HEADER } from '@xeprime/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverSupportReason, registerSupportReasonPrompter } from './support-reason';

const VEHICLE_A = { method: 'POST', path: '/vehicles/A/documents' };
const VEHICLE_A_PRESIGN = { method: 'POST', path: '/vehicles/A/documents/D1/versions/presign' };
const VEHICLE_B = { method: 'POST', path: '/vehicles/B/documents' };

/**
 * Lý do riêng của thao tác mức trung bình/cao trong phiên hỗ trợ (ADR 0050 §13): server đòi (428),
 * lớp HTTP hỏi qua hộp thoại đã đăng ký rồi gửi lại một lần.
 */
function reasonRequired(capabilities: string[], invalid = false) {
  return new ApiClientError({
    status: 428,
    code: API_ERROR_CODE.SUPPORT_REASON_REQUIRED,
    message: 'x',
    details: { capabilities, invalid },
  });
}

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

describe('recoverSupportReason', () => {
  it('lỗi khác mã → không hỏi, không khôi phục', async () => {
    const prompt = vi.fn();
    unregister = registerSupportReasonPrompter(prompt);
    const other = new ApiClientError({
      status: 403,
      code: API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED,
      message: 'x',
    });
    expect(await recoverSupportReason(other, VEHICLE_A)).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('ngoài phiên (không hộp thoại nào đăng ký) → không khôi phục', async () => {
    expect(
      await recoverSupportReason(
        reasonRequired([SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN]),
        VEHICLE_A,
      ),
    ).toBeNull();
  });

  it('hỏi đúng capability server báo, mã hoá lý do vào header', async () => {
    const prompt = vi.fn().mockResolvedValue('Chủ xe nhờ chuyển chi nhánh — ticket #9');
    unregister = registerSupportReasonPrompter(prompt);
    const headers = await recoverSupportReason(
      reasonRequired([SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN]),
      { method: 'PATCH', path: '/vehicles/A' },
    );
    expect(prompt).toHaveBeenCalledWith({
      capabilities: [SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN],
      invalid: false,
    });
    expect(headers).toEqual({
      [SUPPORT_REASON_HEADER]: encodeURIComponent('Chủ xe nhờ chuyển chi nhánh — ticket #9'),
    });
  });

  it('người thao tác huỷ → không gửi lại', async () => {
    unregister = registerSupportReasonPrompter(vi.fn().mockResolvedValue(null));
    expect(
      await recoverSupportReason(reasonRequired([SUPPORT_CAPABILITY.LISTING_REPAIR]), VEHICLE_A),
    ).toBeNull();
  });

  it('tải giấy tờ (nhiều request, CÙNG xe): hỏi MỘT lần; xe khác thì hỏi lại', async () => {
    const prompt = vi.fn().mockResolvedValue('Chủ xe gửi giấy tờ qua Zalo — ticket #77');
    unregister = registerSupportReasonPrompter(prompt);
    const cap = SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE;
    const [a, b] = await Promise.all([
      recoverSupportReason(reasonRequired([cap]), VEHICLE_A),
      recoverSupportReason(reasonRequired([cap]), VEHICLE_A_PRESIGN),
    ]);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    await recoverSupportReason(reasonRequired([cap]), VEHICLE_B);
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('gửi duyệt / thao tác một-request: KHÔNG bao giờ dùng lại lý do', async () => {
    const prompt = vi.fn().mockResolvedValue('Chủ xe nhờ gửi duyệt — ticket #78');
    unregister = registerSupportReasonPrompter(prompt);
    for (const cap of [
      SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW,
      SUPPORT_CAPABILITY.LISTING_REPAIR,
    ]) {
      await recoverSupportReason(reasonRequired([cap]), VEHICLE_A);
      await recoverSupportReason(reasonRequired([cap]), VEHICLE_A);
    }
    expect(prompt).toHaveBeenCalledTimes(4);
  });

  it('lý do bị server coi là chưa đủ cụ thể → không dùng lại, hỏi lại kèm cờ invalid', async () => {
    const prompt = vi.fn().mockResolvedValue('Lý do đủ cụ thể lần hai — ticket #12');
    unregister = registerSupportReasonPrompter(prompt);
    const cap = SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE;
    await recoverSupportReason(reasonRequired([cap]), VEHICLE_A);
    await recoverSupportReason(reasonRequired([cap], true), VEHICLE_A);
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenLastCalledWith({ capabilities: [cap], invalid: true });
  });

  it('rời phiên xoá lý do đã nhớ', async () => {
    const prompt = vi.fn().mockResolvedValue('Chủ xe nhờ khoá lịch bảo dưỡng — ticket #3');
    unregister = registerSupportReasonPrompter(prompt);
    const cap = SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE;
    await recoverSupportReason(reasonRequired([cap]), VEHICLE_A);
    unregister();
    unregister = registerSupportReasonPrompter(prompt);
    await recoverSupportReason(reasonRequired([cap]), VEHICLE_A);
    expect(prompt).toHaveBeenCalledTimes(2);
  });
});
