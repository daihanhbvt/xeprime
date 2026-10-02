import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { PUBLISH_REQUIREMENT, VEHICLE_TYPE } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { missingPublishRequirementsForForm } from '../publication';
import { usePublicationLabels } from './use-publication-labels';

const wrapper = ({ children }: { children: ReactNode }) => withIntl(children);

describe('missingPublishRequirementsForForm', () => {
  it('chọn mẫu trong danh mục là đã có dòng xe; bỏ qua vị trí chi nhánh', () => {
    const missing = missingPublishRequirementsForForm({
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: ['self_drive'],
      brand: 'toyota',
      model: '',
      vehicleCatalogModelId: 'm1',
      manufactureYear: 2021,
      seatCount: 5,
    });
    expect(missing).not.toContain(PUBLISH_REQUIREMENT.IDENTITY);
    expect(missing).not.toContain(PUBLISH_REQUIREMENT.BRANCH_LOCATION);
    expect(missing).toContain(PUBLISH_REQUIREMENT.MAIN_IMAGE);
  });
});

describe('usePublicationLabels.formGaps', () => {
  it('nêu từng Ô còn thiếu của điều kiện danh tính', async () => {
    const { result } = await renderHook(() => usePublicationLabels(), { wrapper });
    const text = result.current.formGaps([PUBLISH_REQUIREMENT.IDENTITY], {
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      brand: 'honda',
      vehicleCatalogModelId: 'm1',
      manufactureYear: 2022,
      motorbikeCategory: null,
    });
    // Chỉ phân khúc còn thiếu — không phải cả nhóm "hãng, mẫu, năm…".
    expect(text.split(', ')).toHaveLength(1);
    expect(text).not.toBe('');
  });
});
