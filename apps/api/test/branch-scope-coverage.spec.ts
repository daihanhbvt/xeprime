import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * MỌI route theo id ở khu gian hàng phải TRẢ LỜI câu "tài nguyên này thuộc chi nhánh nào" (ADR 0052).
 *
 * Phạm vi chi nhánh ở route theo id là một decorator (`@BranchScoped`) chứ không phải một phép kiểm
 * rải trong ~80 service — và cái giá của decorator là: route mới QUÊN nó thì không có gì báo. Lỗ
 * hổng gốc chính là thế: danh sách đã lọc, route theo id thì không, và không ai thấy cho tới lượt
 * review. Spec này biến "quên" thành một test đỏ.
 *
 * Một route có tham số đường dẫn trong controller `@TenantScoped()` phải:
 *  - có `@BranchScoped` (ở handler, hoặc ở class trước `@Controller`), HOẶC
 *  - nằm trong `TENANT_LEVEL` dưới đây, kèm LÝ DO vì sao nó là tài nguyên cấp gian hàng.
 *
 * Thêm một dòng vào `TENANT_LEVEL` là một quyết định sản phẩm, không phải cách cho test xanh.
 */
const TENANT_LEVEL: Record<string, string> = {
  'customers/customers.controller.ts':
    'Khách là quan hệ của GIAN HÀNG: một người thuê ở nhiều chi nhánh, và cờ rủi ro/danh sách đen ' +
    'phải hiện với MỌI chi nhánh — giấu theo chi nhánh là để nhân viên B cho một khách đã bị A ' +
    'đánh dấu rủi ro thuê xe.',
  'customers/customer-documents.controller.ts':
    'CCCD/GPLX thuộc về khách (xem dòng trên), xác minh một lần dùng cho mọi chi nhánh.',
  'drivers/drivers.controller.ts':
    'Tài xế là nhân sự chung của gian hàng, điều động sang chi nhánh nào tuỳ chuyến.',
  'finance/finance-categories.controller.ts': 'Danh mục thu chi là cấu hình của gian hàng.',
  'members/members.controller.ts':
    'Có trần riêng chặt hơn: `assertWithinActorScope` (không sửa/gỡ người rộng hơn mình).',
  'members/invites.controller.ts': 'Có trần riêng: `assertWithinActorScope` lúc mời và lúc huỷ.',
  'members/invite-answers.controller.ts':
    'Phía NGƯỜI ĐƯỢC MỜI, khoá bằng token — chưa là thành viên nên không có phạm vi.',
  'bank-accounts/shop-bank-accounts.controller.ts':
    'Tiền của gian hàng — `@ShopOwnerOnly()`, chỉ chủ shop (luôn `all`) chạm được.',
  'wallet/wallet.controller.ts': 'Ví thuộc tenant, `@ShopOwnerOnly()` (ADR 0038).',
  'support/support.controller.ts': 'Ticket giữa gian hàng và nền tảng, không gắn chi nhánh.',
  'customer-trips/customer-trips.controller.ts':
    'Màn của chính KHÁCH (chuyến của tôi) — khoá theo người thuê, không theo nhân sự gian hàng.',
};

/**
 * Route theo id mà tài nguyên KHÔNG thuộc về một chi nhánh duy nhất, nên phạm vi được áp TRONG
 * service thay vì bằng guard — mỗi mục phải trỏ tới test chứng minh điều đó.
 */
const SERVICE_SCOPED: Record<string, string> = {
  'DELETE /calendar/bulk-day/blocks/:batchId':
    'Một lô khoá phủ NHIỀU chi nhánh; `releaseBatch` chỉ gỡ phần xe trong phạm vi đang xem + được ' +
    'giao — branch-filter.spec "Khoá hàng loạt trên Lịch".',
};

const MODULES = join(__dirname, '..', 'src', 'modules');

function controllers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return controllers(full);
    return e.name.endsWith('.controller.ts') ? [full] : [];
  });
}

interface Gap {
  file: string;
  route: string;
}

function unscopedIdRoutes(): { gaps: Gap[]; tenantLevelSeen: Set<string> } {
  const gaps: Gap[] = [];
  const tenantLevelSeen = new Set<string>();
  for (const full of controllers(MODULES)) {
    const src = readFileSync(full, 'utf8');
    if (!src.includes('@TenantScoped()')) continue;
    const file = relative(MODULES, full).split(sep).join('/');
    const base = /@Controller\(\s*'([^']*)'/.exec(src)?.[1] ?? '';
    const classScoped = /@BranchScoped\([^)]*\)\s*\n(?:@[^\n]*\n)*?@Controller\(/.test(src);
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const m = /^\s*@(Get|Post|Patch|Put|Delete)\((?:'([^']*)')?\)/.exec(line);
      if (!m) return;
      const path = [base, m[2] ?? ''].filter(Boolean).join('/');
      if (!/:\w+/.test(path)) return;
      if (classScoped) return;
      // Decorator của handler nằm ngay trên — 8 dòng là dư cho ApiOperation/Throttle/Require…
      if (lines.slice(Math.max(0, i - 8), i).some((l) => l.includes('@BranchScoped('))) return;
      const route = `${m[1]!.toUpperCase()} /${path}`;
      if (route in SERVICE_SCOPED) return;
      if (file in TENANT_LEVEL) {
        tenantLevelSeen.add(file);
        return;
      }
      gaps.push({ file, route });
    });
  }
  return { gaps, tenantLevelSeen };
}

describe('Phạm vi chi nhánh phủ MỌI route theo id ở khu gian hàng (ADR 0052)', () => {
  const { gaps, tenantLevelSeen } = unscopedIdRoutes();

  it('không route theo id nào thiếu @BranchScoped mà không có lý do', () => {
    // In ra để người thêm route biết ngay phải làm gì, thay vì một con số trần.
    expect(gaps).toEqual([]);
  });

  it('danh sách cấp-gian-hàng không mục nát — mỗi mục vẫn còn route để miễn', () => {
    // Một file bị đổi tên/xoá mà dòng miễn vẫn nằm đây là một lời miễn không còn ai kiểm.
    expect(Object.keys(TENANT_LEVEL).filter((f) => !tenantLevelSeen.has(f))).toEqual([]);
  });
});
