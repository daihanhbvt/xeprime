/**
 * Shape và bộ tra nhãn danh mục sống ở `@xeprime/api-client` (`features/catalog`) — app native
 * cũng cần nhãn hãng/nhiên liệu cho thẻ xe, và hai bản `groupCatalog` sẽ lệch ngay lần đầu
 * backend thêm một chiều mới.
 */
export type { CatalogItem, CatalogMap } from '@xeprime/api-client';
export { EMPTY_CATALOG, catalogLabel, groupCatalog } from '@xeprime/api-client';

import type { components } from '@xeprime/types';

/** Bản quản trị chỉ web dùng (màn danh mục hệ thống) — không cần ở app native. */
export type CatalogItemAdmin = components['schemas']['CatalogItemAdminDto'];
