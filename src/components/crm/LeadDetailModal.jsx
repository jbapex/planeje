import React from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import LeadDetailContent from '@/components/crm/LeadDetailContent';

const LeadDetailModal = ({ lead, isOpen, onClose, onEdit, onUpdateLead, members = [], pipelines = [], onTransfer }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {lead && (
          <LeadDetailContent
            lead={lead}
            onClose={onClose}
            onEdit={onEdit}
            onUpdateLead={onUpdateLead}
            members={members}
            pipelines={pipelines}
            onTransfer={onTransfer}
            isOpen={isOpen}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LeadDetailModal;
