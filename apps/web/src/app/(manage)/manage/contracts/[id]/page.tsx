'use client';

import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { Button, Result, Spin } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { ContractDocument } from '@/features/contracts/components/ContractDocument';
import { useContract } from '@/features/contracts/hooks/use-contract';
import { getErrorMessage } from '@/services/api-client';
import styles from './contract-page.module.css';

export default function ContractPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useContract(id);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
          Quay lại
        </Button>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          disabled={!data}
          onClick={() => window.print()}
        >
          In hợp đồng
        </Button>
      </div>

      {isLoading ? (
        <div className={styles.center}>
          <Spin size="large" />
        </div>
      ) : isError || !data ? (
        <Result
          status="error"
          title="Không tải được hợp đồng"
          subTitle={error ? getErrorMessage(error) : undefined}
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : (
        <ContractDocument contract={data} />
      )}
    </div>
  );
}
