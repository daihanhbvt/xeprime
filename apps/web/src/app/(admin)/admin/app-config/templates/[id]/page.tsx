'use client';

import { useParams } from 'next/navigation';
import { PlanGuideTemplateEditor } from '@/features/app-config/components/PlanGuideTemplateEditor';

/** Sửa một mẫu email hướng dẫn gói. */
export default function EditPlanGuideTemplatePage() {
  const { id } = useParams<{ id: string }>();
  return <PlanGuideTemplateEditor key={id} templateId={id} />;
}
