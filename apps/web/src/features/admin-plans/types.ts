import type { components } from '@xeprime/types';

/** Type gói dịch vụ / thuê bao (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type Plan = Schemas['PlanDto'];
export type CreatePlanInput = Schemas['CreatePlanDto'];
export type UpdatePlanInput = Schemas['UpdatePlanDto'];
export type Subscription = Schemas['SubscriptionDto'];
export type AssignSubscriptionInput = Schemas['AssignSubscriptionDto'];
export type CurrentPlan = Schemas['CurrentPlanDto'];
