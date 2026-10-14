import { apiDelete, apiGet, apiPatch, apiPost, fetchPage, type Paged } from '@/services/api-client';
import type {
  CreatePlanGuideTemplateInput,
  DuplicatePlanGuideTemplateInput,
  PartnerAppConfigAdmin,
  PlanGuideTemplate,
  PlanGuideTemplateFilters,
  PlanGuideTemplatePreview,
  PlanGuideTemplateSummary,
  PreviewPlanGuideTemplateInput,
  SendTestPlanGuideTemplateInput,
  SendTestPlanGuideTemplateResult,
  UpdatePartnerAppConfigInput,
  UpdatePlanGuideTemplateInput,
} from './types';

/** Số mẫu mỗi trang của màn quản trị. */
export const PLAN_GUIDE_TEMPLATES_PAGE_SIZE = 10;

// ── Cấu hình app Partner ───────────────────────────────────────────────────

export const fetchPlatformPartnerAppConfig = (): Promise<PartnerAppConfigAdmin> =>
  apiGet<PartnerAppConfigAdmin>('/platform/app-config/partner');

export const updatePlatformPartnerAppConfig = (
  body: UpdatePartnerAppConfigInput,
): Promise<PartnerAppConfigAdmin> =>
  apiPatch<PartnerAppConfigAdmin>('/platform/app-config/partner', body);

// ── Mẫu email hướng dẫn gói ─────────────────────────────────────────────────

const TEMPLATES = '/platform/plan-guide-email-templates';
const templatePath = (id: string) => `${TEMPLATES}/${encodeURIComponent(id)}`;

export const fetchPlanGuideTemplates = (
  filters: PlanGuideTemplateFilters,
): Promise<Paged<PlanGuideTemplateSummary>> =>
  fetchPage<PlanGuideTemplateSummary>(
    TEMPLATES,
    { q: filters.q?.trim() || null, page: filters.page, limit: PLAN_GUIDE_TEMPLATES_PAGE_SIZE },
    PLAN_GUIDE_TEMPLATES_PAGE_SIZE,
  );

export const fetchPlanGuideTemplate = (id: string): Promise<PlanGuideTemplate> =>
  apiGet<PlanGuideTemplate>(templatePath(id));

export const createPlanGuideTemplate = (
  body: CreatePlanGuideTemplateInput,
): Promise<PlanGuideTemplate> => apiPost<PlanGuideTemplate>(TEMPLATES, body);

export const updatePlanGuideTemplate = (
  id: string,
  body: UpdatePlanGuideTemplateInput,
): Promise<PlanGuideTemplate> => apiPatch<PlanGuideTemplate>(templatePath(id), body);

export const duplicatePlanGuideTemplate = (
  id: string,
  body: DuplicatePlanGuideTemplateInput,
): Promise<PlanGuideTemplate> => apiPost<PlanGuideTemplate>(`${templatePath(id)}/duplicate`, body);

export const activatePlanGuideTemplate = (id: string): Promise<PlanGuideTemplate> =>
  apiPost<PlanGuideTemplate>(`${templatePath(id)}/activate`);

export const deletePlanGuideTemplate = (id: string): Promise<void> =>
  apiDelete<void>(templatePath(id));

/** Xem trước — `subject`/`body` là bản NHÁP chưa lưu (server không ghi gì). */
export const previewPlanGuideTemplate = (
  id: string,
  body: PreviewPlanGuideTemplateInput,
): Promise<PlanGuideTemplatePreview> =>
  apiPost<PlanGuideTemplatePreview>(`${templatePath(id)}/preview`, body);

export const sendTestPlanGuideTemplate = (
  id: string,
  body: SendTestPlanGuideTemplateInput,
): Promise<SendTestPlanGuideTemplateResult> =>
  apiPost<SendTestPlanGuideTemplateResult>(`${templatePath(id)}/send-test`, body);
