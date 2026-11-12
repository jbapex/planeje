import React from 'react';
import avatar from '@/assets/gestor-ia/gestor-ia-avatar.jpg';

export default function GestorIaAvatar({ className = 'gia-agent-avatar' }) {
  return <img className={`rounded-full object-cover ${className}`} src={avatar} alt="" width={36} height={36} />;
}
