import * as yup from 'yup';
import {
  SUPPORT_MODE,
  SUPPORT_MODE_VALUES,
  SUPPORT_REASON_LIMITS,
  isMeaningfulSupportReason,
} from '@xeprime/types';

/**
 * Mở phiên hỗ trợ gian hàng (ADR 0050). Message là MÃ — web dịch qua
 * `TenantSupport.start.validation`. Lớp chặn thật là `OpenSupportContextDto` ở backend.
 */
export const openSupportContextSchema = yup.object({
  mode: yup.string().oneOf(SUPPORT_MODE_VALUES, 'modeInvalid').required('modeInvalid').default(SUPPORT_MODE.VIEW),
  reason: yup
    .string()
    .trim()
    .required('reasonRequired')
    .min(SUPPORT_REASON_LIMITS.min, 'reasonMin')
    .max(SUPPORT_REASON_LIMITS.max, 'reasonMax')
    // Cùng luật với server: "hỗ trợ", "admin sửa", "theo yêu cầu" chưa nói VÌ SAO.
    .test('meaningful', 'reasonGeneric', (value) => !value || isMeaningfulSupportReason(value))
    .default(''),
});

/**
 * Lý do RIÊNG của một thao tác mức trung bình/cao trong phiên (ADR 0050 §13) — cùng luật với lý do
 * mở phiên; server kiểm lại (`SUPPORT_REASON_REQUIRED`).
 */
export const supportActionReasonSchema = yup.object({
  reason: yup
    .string()
    .trim()
    .required('reasonRequired')
    .max(SUPPORT_REASON_LIMITS.max, 'reasonMax')
    .test('meaningful', 'reasonGeneric', (value) => !value || isMeaningfulSupportReason(value))
    .default(''),
});

export type SupportActionReasonValues = yup.InferType<typeof supportActionReasonSchema>;

export type OpenSupportContextValues = yup.InferType<typeof openSupportContextSchema>;

/**
 * Gửi xe duyệt THAY chủ xe (ADR 0050 §13): ngoài lý do, người thao tác phải xác nhận lần hai rằng
 * chính chủ xe đã yêu cầu — phiếu vào hàng đợi của đội duyệt dưới tên nhân sự nền tảng.
 */
export const supportSubmitReviewReasonSchema = supportActionReasonSchema.shape({
  ownerRequested: yup.boolean().oneOf([true], 'ownerRequestRequired').required('ownerRequestRequired').default(false),
});

export type SupportSubmitReviewReasonValues = yup.InferType<typeof supportSubmitReviewReasonSchema>;
