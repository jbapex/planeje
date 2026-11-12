import React from 'react';

export default function AtendimentoEmptyChat() {
  return (
    <div className="wa-empty-chat">
      <div className="wa-empty-art" aria-hidden>
        <span />
        <span />
      </div>
      <h2>Selecione uma conversa</h2>
      <p>Escolha um chat à esquerda para ler e responder.</p>
    </div>
  );
}
