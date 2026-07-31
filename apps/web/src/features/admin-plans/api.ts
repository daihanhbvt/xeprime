import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPatch, apiPost, apiRequest } from '@/services/api-client';
import type {
  AssignSubscriptionInput,
  CreatePlanInput,
  Plan,
  Subscription,
  UpdatePlanInput,
} from './types';

export const SUBSCRIPTIONS_DEFAULT_LIMIT = 20;

export const fetchPlans = (status: 'active' | 'all' = 'all'): Promise<Plan[]> =>
  apiGet<Plan[]>(`/platform/plans?status=${status}`);

export const createPlan = (body: CreatePlanInput): Promise<Plan> =>
  apiPost<Plan>('/platform/plans', body);

export const updatePlan = (id: string, body: UpdatePlanInput): Promise<Plan> =>
  apiPatch<Plan>(`/platform/plans/${id}`, body);

export const archivePlan = (id: string): Promise<Plan> =>
  apiPost<Plan>(`/platform/plans/${id}/archive`);

export interface SubscriptionListResult {
  items: Subscription[];
  meta: PaginationMeta;
}

export async function fetchTenantSubscriptions(
  tenantId: string,
  page = 1,
): Promise<SubscriptionListResult> {
  const res = await apiRequest<Subscription[]>(`/platform/tenants/${tenantId}/subscriptions`, {
    query: { page, limit: SUBSCRIPTIONS_DEFAULT_LIMIT },
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: SUBSCRIPTIONS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const assignSubscription = (
  tenantId: string,
  body: AssignSubscriptionInput,
): Promise<Subscription> =>
  apiPost<Subscription>(`/platform/tenants/${tenantId}/subscriptions`, body);

export const cancelSubscription = (tenantId: string, id: string): Promise<Subscription> =>
  apiPost<Subscription>(`/platform/tenants/${tenantId}/subscriptions/${id}/cancel`);
