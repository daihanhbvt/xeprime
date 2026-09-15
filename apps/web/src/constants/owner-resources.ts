/**
 * Thư viện PDF của chủ xe — **re-export shim**.
 *
 * Manifest thật sống ở `@xeprime/domain` (`src/owner-resources.ts`) vì app native trưng CÙNG bộ
 * tài liệu và mở CHÍNH các file web phục vụ. Giữ file này để mọi `@/constants/owner-resources`
 * đang có vẫn đúng, y như các shim ở `apps/web/src/lib/*`.
 */
export {
  OWNER_RESOURCES,
  OWNER_RESOURCE_BASE,
  ownerResourcesOfKind,
  type OwnerResource,
  type OwnerResourceKey,
} from '@xeprime/domain';

import { ownerResourcePath, type OwnerResource } from '@xeprime/domain';

/**
 * URL công khai của một tài liệu. Web phục vụ tĩnh từ `public/`, nên đường dẫn tương đối của
 * domain đã là URL đầy đủ — app native mới phải ghép thêm `resolveWebBaseUrl()`.
 */
export function ownerResourceHref(resource: OwnerResource): string {
  return ownerResourcePath(resource);
}
