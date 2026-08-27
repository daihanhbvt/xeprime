import { ALL_FILTER, DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPatch, apiPost, fetchPage, type Paged } from '@/services/api-client';
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

export const assignSubscription = (
  tenantId: string,
  body: AssignSubscriptionInput,
): Promise<Subscription> =>
  apiPost<Subscription>(`/platform/tenants/${tenantId}/subscriptions`, body);

export const cancelSubscription = (tenantId: string, id: string): Promise<Subscription> =>
  apiPost<Subscription>(`/platform/tenants/${tenantId}/subscriptions/${id}/cancel`);
