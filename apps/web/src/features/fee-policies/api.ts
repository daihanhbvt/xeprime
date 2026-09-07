import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/api-client';
import type { FeePolicy, UpsertFeePolicyInput } from './types';

export const fetchFeePolicies = (): Promise<FeePolicy[]> => apiGet<FeePolicy[]>('/platform/fee-policies');

export const createFeePolicyDraft = (body: UpsertFeePolicyInput): Promise<FeePolicy> =>
  apiPost<FeePolicy>('/platform/fee-policies', body);

export const updateFeePolicyDraft = (id: string, body: UpsertFeePolicyInput): Promise<FeePolicy> =>
  apiPatch<FeePolicy>(`/platform/fee-policies/${id}`, body);

export const activateFeePolicy = (id: string): Promise<FeePolicy> =>
  apiPost<FeePolicy>(`/platform/fee-policies/${id}/activate`);

export const discardFeePolicyDraft = (id: string): Promise<void> =>
  apiDelete<void>(`/platform/fee-policies/${id}`);
