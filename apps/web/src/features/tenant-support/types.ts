import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Phiên hỗ trợ đang dùng được — sinh từ OpenAPI (ADR 0007), không viết tay. */
export type SupportContext = Schemas['SupportContextDto'];
export type OpenSupportContextInput = Schemas['OpenSupportContextDto'];
