import React from 'react';
import { SourceConnector } from '../../types/vendor.js';
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { Badge } from './Badge.js';
import { Database, ShieldAlert, Clock, Layers } from 'lucide-react';

interface ConnectorModalProps {
  connector: SourceConnector | null;
  onClose: () => void;
}

export const ConnectorModal: React.FC<ConnectorModalProps> = ({
  connector,
  onClose,
}) => {
  if (!connector) return null;

  return (
    <Modal
      isOpen={Boolean(connector)}
      onClose={onClose}
      title={connector.name}
      description={`Category: ${connector.category} · System Connector Details`}
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 text-xs text-[#5F6572]">
        <div className="flex items-center justify-between p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
          <span className="font-semibold text-[#1C1F26]">Operating Status:</span>
          <Badge
            tone={
              connector.status === 'HEALTHY'
                ? 'verified'
                : connector.status === 'CONFIGURED' || connector.status === 'DEGRADED'
                ? 'caution'
                : 'neutral'
            }
          >
            {connector.status}
          </Badge>
        </div>

        <div className="space-y-1">
          <strong className="text-[#1C1F26]">Registry Coverage:</strong>
          <p className="leading-relaxed">{connector.coverageNote}</p>
        </div>

        <div className="p-3 bg-[#FCFBF9] border border-[#EAE6DF] rounded space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span>Server-side Key Configured:</span>
            <strong className="text-[#1C1F26]">
              {connector.isConfigured ? 'Yes (Detected in server environment)' : 'No (Requires Environment Secret)'}
            </strong>
          </div>
          <div className="flex justify-between">
            <span>Last Health Probe:</span>
            <span className="font-mono text-[#1C1F26]">
              {connector.lastChecked ? new Date(connector.lastChecked).toLocaleString() : 'No live probe recorded'}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-[#8A91A0]">
          * All external API calls occur via server-side provider proxies to protect credentials and maintain deterministic audit trails.
        </div>
      </div>
    </Modal>
  );
};
