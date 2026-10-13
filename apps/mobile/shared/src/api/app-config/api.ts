import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Cấu hình app Partner do nền tảng bật/tắt từ xa (docs/app-config.md). */
export type PartnerAppConfig = Schemas['PartnerAppConfigDto'];
export type PlanConsultationInput = Schemas['PlanConsultationDto'];
export type PlanConsultationResult = Schemas['PlanConsultationResultDto'];

export const appConfigApi = {
  /** Công khai, `no-store` — đọc lại mỗi lần màn dùng cờ được focus. */
  partner(): Promise<PartnerAppConfig> {
    return getApiClient().get<PartnerAppConfig>('/app-config/partner');
  },

  /** Yêu cầu tư vấn gói — server chặn `PLAN_CONSULTATION_DISABLED` khi `isPlanPromotionEnabled` tắt. */
  planConsultation(body: PlanConsultationInput): Promise<PlanConsultationResult> {
    return getApiClient().post<PlanConsultationResult>('/support/plan-consultation', body);
  },
};
