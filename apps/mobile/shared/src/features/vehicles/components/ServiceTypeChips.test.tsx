import { fireEvent, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { SERVICE_TYPE, VEHICLE_TYPE, isVehicleServiceTypeAllowed } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { withIntl } from '@/i18n/test-utils';
import { BasicStep } from './VehicleFormSteps';

let latest: string[] = [];

function Harness({ vehicleType }: { vehicleType: string }) {
  const { control } = useForm<VehicleFormValues>({
    defaultValues: { vehicleType, serviceTypes: [SERVICE_TYPE.SELF_DRIVE] } as VehicleFormValues,
  });
  const services = useWatch({ control, name: 'serviceTypes' });
  useEffect(() => {
    latest = services ?? [];
  }, [services]);
  return <BasicStep control={control} branchOptions={[]} branchLoading={false} />;
}

describe('chip dịch vụ — khoá dịch vụ loại xe không phục vụ (như ServiceTypeChips web)', () => {
  const blocked = Object.values(SERVICE_TYPE).find(
    (s) => !isVehicleServiceTypeAllowed(VEHICLE_TYPE.MOTORBIKE, s),
  );

  (blocked ? it : it.skip)('bấm chip bị khoá không đổi giá trị', async () => {
    const screen = await render(withIntl(<Harness vehicleType={VEHICLE_TYPE.MOTORBIKE} />));
    const before = [...latest];
    const { MESSAGES } = jest.requireActual('@/i18n/messages');
    const text = MESSAGES.vi.Domain.serviceType[blocked!];
    await fireEvent.press(screen.getByText(text));
    expect(latest).toEqual(before);
    expect(latest).not.toContain(blocked);
  });

  it('chip được phép vẫn bật được', async () => {
    const screen = await render(withIntl(<Harness vehicleType={VEHICLE_TYPE.CAR} />));
    const { MESSAGES } = jest.requireActual('@/i18n/messages');
    const allowed = Object.values(SERVICE_TYPE).find(
      (s) => s !== SERVICE_TYPE.SELF_DRIVE && isVehicleServiceTypeAllowed(VEHICLE_TYPE.CAR, s),
    )!;
    await fireEvent.press(screen.getByText(MESSAGES.vi.Domain.serviceType[allowed]));
    expect(latest).toContain(allowed);
  });
});
