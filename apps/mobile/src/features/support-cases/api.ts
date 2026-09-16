// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  supportCasesApi,
  supportCasesToParams,
  SUPPORT_CASES_PAGE_SIZE,
  SUPPORT_SURFACE,
} from '@/api/support-cases/api';
export type {
  OpenSupportCaseInput,
  PostSupportEventInput,
  SupportCase,
  SupportCaseDetail,
  SupportCaseEvent,
  SupportCaseFilters,
  SupportCasePage,
  SupportSurface,
  TransitionSupportCaseInput,
} from '@/api/support-cases/api';
