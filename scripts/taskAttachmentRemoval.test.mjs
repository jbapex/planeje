import assert from 'node:assert/strict';
import test from 'node:test';
import { describeAttachmentDeleteError } from '../src/lib/taskAttachments.js';

test('maps the locked delivery-proof foreign key to a usable message', () => {
  assert.equal(
    describeAttachmentDeleteError({
      message: 'update or delete on table "task_attachments" violates foreign key constraint "tarefas_production_delivery_attachment_id_fkey" on table "tarefas"',
    }),
    'Este link ainda está marcado como comprovante da entrega. Adicione o link correto e tente remover este de novo.'
  );
});

test('keeps an unknown database error readable', () => {
  assert.equal(describeAttachmentDeleteError({ message: 'permission denied' }), 'permission denied');
});
