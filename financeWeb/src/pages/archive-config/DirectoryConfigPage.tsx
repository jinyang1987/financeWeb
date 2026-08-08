import React from 'react';
import DirectoryConfigPanel from '../../components/DirectoryConfigPanel';

const DirectoryConfigPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200">
      <DirectoryConfigPanel />
    </div>
  );
};

export default DirectoryConfigPage;
