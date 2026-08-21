﻿﻿﻿﻿﻿﻿﻿import React from 'react';
import { ArchiveRecord } from '../types';
import { MenuId } from '../stores/appStore';

// Page imports (already extracted)
import { FanzongManager } from './FanzongManager';
import ReportConfigPage from '../pages/archive-config/ReportConfigPage';
import InspectionConfigPage from '../pages/archive-config/InspectionConfigPage';
import DirectoryConfigPage from '../pages/archive-config/DirectoryConfigPage';

import UnitManagePage from '../pages/system/UnitManagePage';
import OrgManagePage from '../pages/system/OrgManagePage';
import PersonnelManagePage from '../pages/system/PersonnelManagePage';
import RoleManagePage from '../pages/system/RoleManagePage';
import StorageConfigPage from '../pages/system/StorageConfigPage';

// Direct component imports
import ApiReceivePage from '../pages/archive-rcv/ApiReceivePage';
import { DigitalWarehousePanel } from './DigitalWarehousePanel';
import { AuditLogsPanel } from './AuditLogsPanel';

interface PageRouterProps {
  activeMainMenu: MenuId;
  records: ArchiveRecord[];
  triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

const PageRouter: React.FC<PageRouterProps> = (props) => {
  const { activeMainMenu } = props;

  switch (activeMainMenu) {
    // === Already extracted pages ===
    case 'config-fanzong':
      return <FanzongManager />;
    case 'report-config':
      return <ReportConfigPage />;
    case 'inspection-config':
      return <InspectionConfigPage />;
    case 'directory-config':
      return <DirectoryConfigPage />;
    case 'sys-unit':
      return <UnitManagePage />;
    case 'sys-org':
      return <OrgManagePage />;
    case 'sys-personnel':
      return <PersonnelManagePage />;
    case 'sys-role':
      return <RoleManagePage />;

    case 'sys-storage':
      return <StorageConfigPage triggerToast={props.triggerToast} />;

    case 'sys-log':
      return (
        <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
          <AuditLogsPanel records={props.records} triggerToast={props.triggerToast} />
        </div>
      );

    case 'archive-rcv':
      return (
        <div className="flex-1 overflow-auto animate-in fade-in duration-200">
          <ApiReceivePage />
        </div>
      );

    case 'digital-warehouse':
      return (
        <div className="flex-1 overflow-auto animate-in fade-in duration-200">
          <DigitalWarehousePanel triggerToast={props.triggerToast} />
        </div>
      );

    default:
      return null;
  }
};

export default PageRouter;

