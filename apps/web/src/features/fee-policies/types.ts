import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type FeePolicy = Schemas['FeePolicyDto'];
export type UpsertFeePolicyInput = Schemas['UpsertFeePolicyDto'];
