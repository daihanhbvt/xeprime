import { ALL_FILTER, DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiDelete, apiGet, apiPatch, apiPost, fetchPage, type Paged } from '@/services/api-client';
import type {
  AssignSubscriptionInput,
  CreatePlanInput,
  Plan,
  Subscription,
  UpdatePlanInput,
} from './types';

export const SUBSCRIPTIONS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export const fetchPlans = (status: 'active' | typeof ALL_FILTER = ALL_FILTER): Promise<Plan[]> =>
  apiGet<Plan[]>(`/platform/plans?status=${status}`);

export const createPlan = (body: CreatePlanInput): Promise<Plan> =>
  apiPost<Plan>('/platform/plans', body);

export const updatePlan = (id: string, body: UpdatePlanInput): Promise<Plan> =>
  apiPatch<Plan>(`/platform/plans/${id}`, body);

export const archivePlan = (id: string): Promise<Plan> =>
  apiPost<Plan>(`/platform/plans/${id}/archive`);

export const activatePlan = (id: string): Promise<Plan> =>
  apiPost<Plan>(`/platform/plans/${id}/activate`);

/** Xoá HẲN — chỉ gói chưa từng được dùng (`Plan.deletable`); đã dùng thì server trả PLAN_IN_USE. */
export const deletePlan = (id: string): Promise<void> => apiDelete<void>(`/platform/plans/${id}`);

export type SubscriptionListResult = Paged<Subscription>;

export const fetchTenantSubscriptions = (
  tenantId: string,
  page = 1,
): Promise<SubscriptionListResult> =>
  fetchPage<Subscription>(
    `/platform/tenants/${tenantId}/subscriptions`,
    { page, limit: SUBSCRIPTIONS_DEFAULT_LIMIT },
    SUBSCRIPTIONS_DEFAULT_LIMIT,
  );

/** Trần an toàn của chuỗi kỳ còn hạn — thực tế 1–3 dòng; bằng trần `limit` của API. */
const SUBSCRIPTIONS_LIVE_LIMIT = 100;

/**
 * Chuỗi kỳ CÒN HẠN (đang chạy + đã xếp lịch), sớm nhất trước — nguồn của thẻ "Đang hiệu lực" /
 * "Kỳ kế tiếp", của phần xem trước gia hạn và của luật huỷ. Không suy từ trang đầu của lịch sử:
 * lịch sử sắp theo ngày tạo, vài vòng xếp lịch/huỷ đủ đẩy kỳ đang chạy khỏi trang 1.
 */
export const fetchLiveSubscriptions = (tenantId: string): Promise<Subscription[]> =>
  fetchPage<Subscription>(
    `/platform/tenants/${tenantId}/subscriptions`,
    { state: 'live', page: 1, limit: SUBSCRIPTIONS_LIVE_LIMIT },
    SUBSCRIPTIONS_LIVE_LIMIT,
  ).then((page) => page.items);


export const assignSubscription = (
  tenantId: string,
  body: AssignSubscriptionInput,
): Promise<Subscription> =>
  apiPost<Subscription>(`/platform/tenants/${tenantId}/subscriptions`, body);

export const cancelSubscription = (tenantId: string, id: string): Promise<Subscription> =>
  apiPost<Subscription>(`/platform/tenants/${tenantId}/subscriptions/${id}/cancel`);
