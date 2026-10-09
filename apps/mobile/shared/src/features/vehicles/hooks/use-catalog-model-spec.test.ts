import { FUEL_TYPE, TRANSMISSION_TYPE_EXT, VEHICLE_TYPE } from '@xeprime/types';
import { catalogTransmissionRule, valueForSpecRule } from './use-catalog-model-spec';

describe('catalogTransmissionRule', () => {
  const camry = {
    vehicleType: VEHICLE_TYPE.CAR,
    transmissions: [TRANSMISSION_TYPE_EXT.AUTOMATIC, TRANSMISSION_TYPE_EXT.CVT, TRANSMISSION_TYPE_EXT.E_CVT],
  };

  it('is free without a model or a fuel type', () => {
    expect(catalogTransmissionRule(null, FUEL_TYPE.GASOLINE)).toEqual({ kind: 'free' });
    expect(catalogTransmissionRule(camry, null)).toEqual({ kind: 'free' });
  });

  it('narrows the model transmissions to those valid for the fuel', () => {
    expect(catalogTransmissionRule({ ...camry, transmissions: [TRANSMISSION_TYPE_EXT.CVT, TRANSMISSION_TYPE_EXT.E_CVT] }, FUEL_TYPE.HYBRID)).toEqual({ kind: 'fixed', value: TRANSMISSION_TYPE_EXT.E_CVT });
    expect(catalogTransmissionRule(camry, FUEL_TYPE.GASOLINE).kind).toBe('choice');
  });
});

describe('valueForSpecRule', () => {
  it('uses the single model value', () => {
    expect(valueForSpecRule({ kind: 'fixed', value: 5 }, 7)).toBe(5);
  });
  it('keeps a current value that is one of the choices, else clears it', () => {
    expect(valueForSpecRule({ kind: 'choice', values: [6, 7] }, 7)).toBe(7);
    expect(valueForSpecRule({ kind: 'choice', values: [6, 7] }, 4)).toBeNull();
  });
  it('keeps the current value when free', () => {
    expect(valueForSpecRule({ kind: 'free' }, 4)).toBe(4);
    expect(valueForSpecRule<number>({ kind: 'free' }, undefined)).toBeNull();
  });
});
