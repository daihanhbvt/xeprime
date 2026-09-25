import * as yup from 'yup';
import { SUPPORT_MODE, SUPPORT_MODE_VALUES, SUPPORT_REASON_LIMITS } from '@xeprime/types';

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
    .default(''),
});

export type OpenSupportContextValues = yup.InferType<typeof openSupportContextSchema>;
