import { readAppVersion } from './AppVersion';

type Config = Parameters<typeof readAppVersion>[0];
const config = (c: object) => c as Config;

describe('readAppVersion', () => {
  it('ghép version với buildNumber trên iOS', () => {
    expect(readAppVersion(config({ version: '1.2.0', ios: { buildNumber: '7' } }), 'ios')).toEqual({
      version: '1.2.0',
      build: '7',
    });
  });

  it('ghép version với versionCode trên Android', () => {
    expect(
      readAppVersion(config({ version: '1.2.0', android: { versionCode: 12 } }), 'android'),
    ).toEqual({ version: '1.2.0', build: '12' });
  });

  it('thiếu số build thì chỉ còn version', () => {
    expect(readAppVersion(config({ version: '1.2.0' }), 'ios')).toEqual({
      version: '1.2.0',
      build: null,
    });
  });

  it('không có version thì không hiện gì', () => {
    expect(readAppVersion(config({}), 'android')).toBeNull();
    expect(readAppVersion(null, 'android')).toBeNull();
  });
});
