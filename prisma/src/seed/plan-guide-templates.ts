/**
 * Seed năm BỘ MẪU email hướng dẫn gói (`SEED_MODE=system`), mỗi bộ ĐỦ bốn nội dung
 * (PLAN_GUIDE_VARIANT). Nội dung ở `plan-guide-templates.data.ts` (thuần — không DB).
 *
 * Idempotent: id từ `seedId('plan_guide_template:<code>')`. Bộ chưa có ⇒ tạo cùng bốn nội dung
 * trong MỘT transaction. Bộ ĐÃ CÓ chỉ được làm mới nội dung khi còn là bản seed NGUYÊN VẸN: đúng
 * id seed, chưa xoá, `createdBy` trống và `version = 1` (mỗi lần admin sửa nội dung đều tăng
 * `version`; bật bộ chỉ ghi `updatedBy`). Bộ admin đã sửa, hay bộ admin tự tạo cùng mã, không bao
 * giờ bị ghi đè. Cờ `isActive` không đổi ở lượt cập nhật; bộ đầu tiên chỉ được BẬT lúc tạo khi
 * chưa có bộ nào đang dùng.
 */
import { PLAN_GUIDE_VARIANT_VALUES } from '@xeprime/types';
import { prisma, seedId, log } from './context';
import { PLAN_GUIDE_TEMPLATE_SEEDS, type PlanGuideTemplateSeed } from './plan-guide-templates.data';

function variantRows(t: PlanGuideTemplateSeed) {
  return PLAN_GUIDE_VARIANT_VALUES.map((variant) => ({
    variant,
    subjectVi: t.variants[variant].vi.subject,
    subjectEn: t.variants[variant].en.subject,
    bodyVi: t.variants[variant].vi.body,
    bodyEn: t.variants[variant].en.body,
  }));
}

export async function seedPlanGuideTemplates(): Promise<number> {
  const hasActive = await prisma.planGuideEmailTemplate.findFirst({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
  });
  let created = 0;
  let refreshed = 0;
  for (const [index, t] of PLAN_GUIDE_TEMPLATE_SEEDS.entries()) {
    const id = seedId(`plan_guide_template:${t.code}`);
    const rows = variantRows(t);
    const existing = await prisma.planGuideEmailTemplate.findFirst({
      where: { OR: [{ id }, { code: t.code, deletedAt: null }] },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        createdBy: true,
        version: true,
        variants: {
          select: { variant: true, subjectVi: true, subjectEn: true, bodyVi: true, bodyEn: true },
        },
      },
    });
    if (!existing) {
      await prisma.planGuideEmailTemplate.create({
        data: {
          id,
          code: t.code,
          name: t.name,
          isActive: index === 0 && !hasActive,
          variants: { create: rows },
        },
      });
      created += 1;
      continue;
    }
    const untouchedSeed =
      existing.id === id &&
      existing.deletedAt === null &&
      existing.createdBy === null &&
      existing.version === 1;
    if (!untouchedSeed) continue; // admin đã sửa/tự tạo — không ghi đè
    const same =
      existing.name === t.name &&
      rows.every((r) => {
        const cur = existing.variants.find((v) => v.variant === r.variant);
        return (
          !!cur &&
          cur.subjectVi === r.subjectVi &&
          cur.subjectEn === r.subjectEn &&
          cur.bodyVi === r.bodyVi &&
          cur.bodyEn === r.bodyEn
        );
      });
    if (same) continue;
    await prisma.$transaction(async (tx) => {
      // Kèm lại điều kiện nguyên vẹn — admin sửa xen giữa thì lượt này không chạm.
      const r = await tx.planGuideEmailTemplate.updateMany({
        where: { id, deletedAt: null, createdBy: null, version: 1 },
        data: { name: t.name },
      });
      if (r.count === 0) return;
      for (const row of rows) {
        const { variant, ...content } = row;
        await tx.planGuideEmailTemplateVariant.upsert({
          where: { templateId_variant: { templateId: id, variant } },
          create: { templateId: id, ...row },
          update: content,
        });
      }
      refreshed += 1;
    });
  }
  log(
    `Bộ mẫu email hướng dẫn gói: tạo mới ${created}, cập nhật bản seed ${refreshed}/${PLAN_GUIDE_TEMPLATE_SEEDS.length}`,
  );
  return created;
}
