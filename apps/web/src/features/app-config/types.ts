import type { components } from '@xeprime/types';

/**
 * CẤU HÌNH ỨNG DỤNG + MẪU EMAIL HƯỚNG DẪN GÓI — shape đi trên dây, lấy từ OpenAPI (ADR 0007).
 */
export type PartnerAppConfigAdmin = components['schemas']['PartnerAppConfigAdminDto'];
export type UpdatePartnerAppConfigInput = components['schemas']['UpdatePartnerAppConfigDto'];

export type PlanGuideTemplateSummary = components['schemas']['PlanGuideTemplateSummaryDto'];
export type PlanGuideTemplate = components['schemas']['PlanGuideTemplateDto'];
export type CreatePlanGuideTemplateInput = components['schemas']['CreatePlanGuideTemplateDto'];
export type UpdatePlanGuideTemplateInput = components['schemas']['UpdatePlanGuideTemplateDto'];
export type DuplicatePlanGuideTemplateInput = components['schemas']['DuplicatePlanGuideTemplateDto'];
export type PreviewPlanGuideTemplateInput = Partial<components['schemas']['PreviewPlanGuideTemplateDto']>;
export type PlanGuideTemplatePreview = components['schemas']['PlanGuideTemplatePreviewDto'];
export type SendTestPlanGuideTemplateInput = Partial<components['schemas']['SendTestPlanGuideTemplateDto']>;
export type SendTestPlanGuideTemplateResult = components['schemas']['SendTestResultDto'];

/** Bộ lọc danh sách mẫu — trên URL (ADR 0004). */
export interface PlanGuideTemplateFilters {
  q?: string;
  page: number;
}

/** Ngôn ngữ của MỘT phiên bản thư — mã trên dây, không dịch. */
export type PlanGuideLocale = 'vi' | 'en';

/** Một nội dung (biến thể) của bộ mẫu — shape trên dây. */
export type PlanGuideVariantContent = components['schemas']['PlanGuideTemplateVariantDto'];
