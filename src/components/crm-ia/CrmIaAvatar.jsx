import React from 'react';
import avatar from '@/assets/crm-ia/crm-ia-avatar-v1.png';

export default function CrmIaAvatar({ className = 'gia-agent-avatar' }) {
  return <img className={`rounded-full object-cover ${className}`} src={avatar} alt="" width={36} height={36} />;
}
