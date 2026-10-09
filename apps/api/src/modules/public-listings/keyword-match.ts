import { searchTokens } from '@xeprime/domain';
import type { Prisma } from '@xeprime/prisma';
import { STOREFRONT_KIND, TENANT_STATUS } from '@xeprime/types';
import {
  resolveStorefront,
  storefrontTenantSelect,
  type StorefrontTenantRow,
} from '../../common/storefront/storefront-identity';
import type { PrismaService } from '../../prisma/prisma.service';
import { keywordNeedle, publicListingScope } from './listing-filter';

/**
 * Ô từ khoá ở chợ — phân giải MỘT LẦN mỗi request, trước khi dựng điều kiện lọc.
 *
 * ## Luật khớp
 *
 * Mỗi TỪ (đã gấp bằng `searchTokens`) phải là ĐẦU một từ trong tên xe/hãng/model HOẶC trong TÊN
 * CÔNG KHAI của chủ xe. Nhiều từ ⇒ AND: không cần đúng thứ tự, không cần cùng một trường
 * ("mazda tuan" = những chiếc Mazda của anh Tuấn). Mọi cột so là cột GẤP SẴN do trigger ghi
 * (migration `20261009170000_marketplace_keyword_search`), mở đầu bằng một dấu cách — "đầu từ"
 * là `LIKE '% <từ>%'` ở SQL và `doc.includes(' <từ>')` ở đây, cùng một phép.
 *
 * ## Tên công khai — khớp ĐÚNG tên khách đang thấy (ADR 0054)
 *
 * Gian hàng tuyến gói hiện bằng `tenants.name`; chủ xe tuyến hoa hồng hiện bằng họ tên TÀI KHOẢN
 * (tên tài khoản trắng ⇒ rơi về tên gian hàng). Khớp cả hai tên bất kể tuyến sẽ để một chữ
 * "Nguyễn Văn A" lôi ra xe của gian hàng mà người đó đứng tên — nối danh tính cá nhân vào một
 * pháp nhân, đúng điều ADR 0054 cấm.
 *
 * Tuyến được chấm LÚC ĐỌC bằng chính `resolveStorefront(tenant, now)` mà thẻ xe, trang gian hàng
 * và gợi ý dùng để hiện tên — KHÔNG đọc `public_listings.billing_mode`: cột đó là snapshot hiển
 * thị phí, không được đồng bộ khi đổi gói, và giữ `unconfigured` thành `package`. Một bộ lọc
 * chọn tên theo cột đó sẽ khớp họ tên người đứng tên ngay sau khi họ lên gói.
 *
 * ## Vì sao hai bước (tenant trước, xe sau)
 *
 * Tuyến hiệu lực cần `ends_at + graceDays` (trong `limits_json`) — SQL không chấm được mà không
 * chép lại `resolveEffectiveBilling`. Nên bước một lấy ỨNG VIÊN bằng SQL (tên gian hàng HOẶC họ
 * tên chủ khớp một từ — index trigram của `tenants`/`users` phục vụ), rồi chấm tuyến từng ứng
 * viên bằng luật thật. Bước hai lọc xe bằng `search_text LIKE … OR tenant_id IN (…)` — hai vế
 * đều có index, planner gộp được bằng BitmapOr.
 *
 * Ứng viên chỉ là tenant đang có xe hiển thị công khai — tức số chủ xe trên chợ, không phải số
 * xe. Tập đó không cần trần: cắt nó là âm thầm bỏ sót kết quả.
 */

/** Một từ của từ khoá kèm các tenant có TÊN CÔNG KHAI khớp từ đó. */
export interface KeywordToken {
  token: string;
  hostTenantIds: string[];
}

/** Từ khoá đã phân giải — thứ `buildListingWhere`/`buildListingWhereSql` đọc thay cho `q`. */
export interface ResolvedKeyword {
  tokens: KeywordToken[];
}

const keywordHostSelect = (now: Date) => {
  const storefront = storefrontTenantSelect(now);
  return {
    ...storefront,
    id: true,
    searchName: true,
    owner: { select: { ...storefront.owner.select, searchName: true } },
  } satisfies Prisma.TenantSelect;
};

type KeywordHostRow = StorefrontTenantRow & {
  id: string;
  searchName: string;
  owner: StorefrontTenantRow['owner'] & { searchName: string };
};

/**
 * Cột gấp sẵn của TÊN mà khách đang thấy — cùng nhánh với `storefrontIdentity`: mặt tiền gian
 * hàng ⇒ tên gian hàng; mặt tiền cá nhân ⇒ họ tên tài khoản, trừ khi nó TRẮNG (`trim()` rỗng,
 * đúng phép của `storefrontIdentity`) thì tên gian hàng. Một họ tên không có chữ Latin nào
 * ("李明") vẫn là tên đang hiện — nó gấp ra rỗng và không khớp gì, chứ không rơi về tên gian hàng.
 */
function publicNameDocument(host: KeywordHostRow, now: Date): string {
  if (resolveStorefront(host, now).kind === STOREFRONT_KIND.SHOP) return host.searchName;
  return host.owner.displayName.trim() ? host.owner.searchName : host.searchName;
}

/**
 * `q` → các từ đã gấp + tenant khớp tên công khai cho từng từ. `undefined` khi từ khoá không còn
 * từ nào sau khi gấp (rỗng / chỉ dấu câu) — không lọc gì, thay vì lọc ra rỗng.
 */
export async function resolveKeyword(
  prisma: PrismaService,
  q: string | undefined,
  now: Date,
): Promise<ResolvedKeyword | undefined> {
  const tokens = searchTokens(q);
  if (tokens.length === 0) return undefined;

  const candidates: KeywordHostRow[] = await prisma.tenant.findMany({
    where: {
      status: TENANT_STATUS.ACTIVE,
      deletedAt: null,
      publicListings: { some: publicListingScope() },
      OR: tokens.flatMap((token) => [
        { searchName: { contains: keywordNeedle(token) } },
        { owner: { searchName: { contains: keywordNeedle(token) } } },
      ]),
    },
    select: keywordHostSelect(now),
  });

  const documents = candidates.map((host) => ({
    id: host.id,
    doc: publicNameDocument(host, now),
  }));

  return {
    tokens: tokens.map((token) => ({
      token,
      hostTenantIds: documents
        .filter(({ doc }) => doc.includes(keywordNeedle(token)))
        .map(({ id }) => id),
    })),
  };
}

/**
 * Tenant có tên công khai khớp MỌI từ — gợi ý chủ xe (`GET /public/shops?q=`) chỉ xét TÊN, nên
 * mỗi từ phải nằm trong tên chứ không được "bù" bằng tên xe như ở lưới kết quả.
 */
export function hostsMatchingAllTokens(keyword: ResolvedKeyword): string[] {
  const [first, ...rest] = keyword.tokens;
  if (!first) return [];
  const sets = rest.map(({ hostTenantIds }) => new Set(hostTenantIds));
  return first.hostTenantIds.filter((id) => sets.every((set) => set.has(id)));
}
