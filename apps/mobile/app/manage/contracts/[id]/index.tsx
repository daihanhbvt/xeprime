import { useLocalSearchParams } from 'expo-router';
import { ContractScreen } from '@/features/contracts/ContractScreen';

export default function ContractRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <ContractScreen contractId={id} />;
}
