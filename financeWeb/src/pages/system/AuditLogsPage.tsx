import React from 'react';
import { AuditLogsPanel } from '../../components/AuditLogsPanel';
import { ArchiveRecord } from '../../types';

interface AuditLogsPageProps {
  records: ArchiveRecord[];
  triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

const AuditLogsPage: React.FC<AuditLogsPageProps> = ({ records, triggerToast }) => {
  return <AuditLogsPanel records={records} triggerToast={triggerToast} />;
};

export default AuditLogsPage;
