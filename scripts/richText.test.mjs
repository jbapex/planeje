import assert from 'node:assert/strict';
import { plainTextToRichHtml, richTextHasContent, richTextToPlainText, richTextValueToHtml, sanitizeRichTextHtml } from '../src/lib/richText.js';

assert.equal(richTextValueToHtml('Título\n\nLinha'), '<p>Título</p><p><br></p><p>Linha</p>');
assert.equal(richTextValueToHtml('<texto> & conteúdo'), '<p>&lt;texto&gt; &amp; conteúdo</p>');
assert.equal(richTextToPlainText('<h2>Plano</h2><p>Vídeo <strong>principal</strong></p><ul><li>Instagram</li></ul>'), 'Plano\nVídeo principal\n• Instagram');
assert.equal(richTextHasContent('<p><br></p><p>&nbsp;</p>'), false);
assert.equal(richTextHasContent('<p><img src="https://example.com/image.jpg"></p>'), true);
assert.equal(sanitizeRichTextHtml('<p onclick="x()">Seguro</p><script>alert(1)</script>'), '<p>Seguro</p>');
assert.equal(richTextToPlainText('<p>Planejar&nbsp;<em>campanha</em></p>'), 'Planejar campanha');
assert.equal(
  plainTextToRichHtml('# Plano\n\n**Objetivos**\n- Criar arte\n- Gravar vídeo'),
  '<h1>Plano</h1><p><br></p><p><strong>Objetivos</strong></p><ul><li>Criar arte</li><li>Gravar vídeo</li></ul>',
);
assert.equal(
  plainTextToRichHtml('1. Primeiro\n2. Segundo'),
  '<ol><li>Primeiro</li><li>Segundo</li></ol>',
);
assert.equal(
  richTextToPlainText('<table><tbody><tr><th>Canal</th><th>Formato</th></tr><tr><td>Instagram</td><td>Reels</td></tr></tbody></table>'),
  'Canal\tFormato\nInstagram\tReels',
);

console.log('PASS rich text helpers');
