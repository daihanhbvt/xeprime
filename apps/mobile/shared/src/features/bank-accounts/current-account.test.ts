import type { BankAccount } from '@/api/bank-accounts/api';
import {
  bankAccountSaveOutcome,
  bankAccountSummary,
  bankAccountTitle,
  currentBankAccount,
} from './current-account';

const account = {
  id: 'a1',
  bankCode: 'VCB',
  label: '',
  accountNumberMasked: '****1234',
  accountName: 'NGUYEN VAN A',
} as unknown as BankAccount;

describe('currentBankAccount', () => {
  it('trả null khi chưa tải hoặc rỗng', () => {
    expect(currentBankAccount(undefined)).toBeNull();
    expect(currentBankAccount([])).toBeNull();
  });
  it('trả phần tử đầu', () => {
    expect(currentBankAccount([account])).toBe(account);
  });
});

describe('bankAccountTitle / summary', () => {
  it('ưu tiên tên gợi nhớ', () => {
    expect(bankAccountTitle({ label: 'Lương', bankCode: 'VCB' })).toBe('Lương');
  });
  it('rơi về tên ngân hàng', () => {
    expect(bankAccountTitle({ label: '', bankCode: 'VCB' })).not.toBe('');
    expect(bankAccountSummary(account)).toContain('****1234');
  });
});

describe('bankAccountSaveOutcome', () => {
  it('phân biệt thêm / đổi / không đổi', () => {
    expect(bankAccountSaveOutcome(null, { id: 'x' })).toBe('created');
    expect(bankAccountSaveOutcome({ id: 'a1' }, { id: 'x' })).toBe('changed');
    expect(bankAccountSaveOutcome({ id: 'a1' }, { id: 'a1' })).toBe('unchanged');
  });
});
