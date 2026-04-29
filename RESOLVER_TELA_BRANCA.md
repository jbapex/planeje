# 🔧 Resolver Tela em Branco na VPS

## 🚨 Problema: Tela em Branco na VPS

Se a aplicação funciona localmente mas mostra tela em branco na VPS, siga estes passos:

### Checagem imediata: modo dev no ar em vez do build

Se o Nginx aponta para a pasta do projeto (ou `index.html` na raiz) em vez de `dist/`, o navegador recebe o HTML do **Vite dev** com scripts `/@vite/client` e `/src/main.jsx`. Em produção isso **não existe** no disco → tela branca.

Na sua máquina ou na VPS:

```bash
curl -sS https://planeje.jbapex.com.br/ | head -20
```

- **Errado:** aparece `/@vite/client` ou `/src/main.jsx` → corrija o `root` do Nginx para `.../dist` e rode `npm run build` nesse mesmo caminho.
- **Certo:** aparece `/assets/index.` e um `.js` com hash → build estático servido corretamente.

---

## ✅ Passo 1: Executar Diagnóstico

Na VPS, execute:

```bash
cd /var/www/planeje  # ou onde você clonou
chmod +x diagnostico-vps.sh
./diagnostico-vps.sh
```

O script vai verificar:
- ✅ Se o build foi feito
- ✅ Se o nginx está configurado corretamente
- ✅ Se as permissões estão corretas
- ✅ Se o servidor está respondendo

---

## ✅ Passo 2: Verificar Console do Navegador

**IMPORTANTE:** Abra o DevTools (F12) no navegador e verifique:

1. **Aba Console:**
   - Procure por erros em vermelho
   - Anote qualquer erro que aparecer

2. **Aba Network:**
   - Recarregue a página (F5)
   - Verifique quais arquivos estão falhando (status 404, 500, etc.)
   - Verifique se `/assets/` está carregando

3. **Aba Elements:**
   - Verifique se existe `<div id="root"></div>` no HTML
   - Verifique se há conteúdo dentro do root

---

## ✅ Passo 3: Verificar Build

```bash
cd /var/www/planeje

# Limpar build anterior
rm -rf dist node_modules/.vite

# Fazer build limpo
npm run build

# Verificar se dist foi criado
ls -la dist/
ls -la dist/assets/
```

**Deve conter:**
- `dist/index.html`
- `dist/assets/` (com arquivos JS e CSS)

---

## ✅ Passo 4: Verificar Nginx

```bash
# Verificar configuração
sudo cat /etc/nginx/sites-available/planeje
```

**Deve ter:**
```nginx
root /var/www/planeje/dist;  # IMPORTANTE: apontar para dist/
index index.html;

location / {
    try_files $uri $uri/ /index.html;  # IMPORTANTE para SPA
}
```

**Se estiver errado, corrija:**
```bash
sudo nano /etc/nginx/sites-available/planeje
# Edite root para apontar para /var/www/planeje/dist
sudo nginx -t
sudo systemctl reload nginx
```

---

## ✅ Passo 5: Verificar Permissões

```bash
# Ajustar proprietário
sudo chown -R www-data:www-data /var/www/planeje/dist

# Ajustar permissões
sudo chmod -R 755 /var/www/planeje/dist
```

---

## ✅ Passo 6: Verificar Logs

```bash
# Ver erros do nginx em tempo real
sudo tail -f /var/log/nginx/error.log

# Em outro terminal, acesse a aplicação no navegador
# Veja se aparecem erros no log
```

---

## 🐛 Problemas Comuns e Soluções

### Problema 1: "Failed to fetch" ou CORS

**Solução:** Verifique se a URL do Supabase está correta em `src/lib/customSupabaseClient.js`

### Problema 2: Assets não carregam (404)

**Solução:**
```bash
# Verificar se assets existem
ls -la dist/assets/

# Se não existir, refazer build
npm run build
```

### Problema 3: Erro de JavaScript no console

**Solução:** 
- Verifique o erro específico no console
- Pode ser problema de import ou variável não definida
- Verifique se todas as dependências foram instaladas: `npm install`

### Problema 4: HashRouter não funciona

**Solução:** O código já usa HashRouter, que funciona sem configuração especial. Se ainda não funcionar, verifique se o nginx tem `try_files`.

### Problema 5: Service Worker causando problemas

**Solução:** O service worker não é crítico. Se estiver causando problemas, você pode desabilitá-lo temporariamente comentando a parte no `src/main.jsx`.

---

## 🔍 Debug Avançado

### Adicionar logs no código

Edite `src/main.jsx` e adicione no início:

```javascript
console.log('🚀 Aplicação iniciando...');
console.log('Root element:', document.getElementById('root'));
console.log('Location:', window.location.href);
```

### Verificar se React está carregando

No console do navegador, digite:
```javascript
window.React
```

Se retornar `undefined`, o React não está carregando.

### Verificar se o bundle está carregando

No console do navegador, verifique se há erros de:
- `Failed to load resource`
- `net::ERR_*`

---

## 📋 Checklist Final

- [ ] ✅ Build executado (`npm run build`)
- [ ] ✅ Pasta `dist/` existe e tem arquivos
- [ ] ✅ Nginx aponta para `/var/www/planeje/dist`
- [ ] ✅ Nginx tem `try_files $uri $uri/ /index.html;`
- [ ] ✅ Permissões corretas (`www-data:www-data`)
- [ ] ✅ Nginx está rodando (`sudo systemctl status nginx`)
- [ ] ✅ Teste local funciona (`curl http://localhost/`)
- [ ] ✅ Console do navegador não mostra erros críticos
- [ ] ✅ Network tab mostra assets carregando (200 OK)

---

## 🆘 Se Nada Funcionar

1. **Cole aqui os erros do console do navegador (F12)**
2. **Cole os erros do log do nginx:**
   ```bash
   sudo tail -50 /var/log/nginx/error.log
   ```
3. **Verifique o HTML retornado:**
   ```bash
   curl http://localhost/ | head -50
   ```

Com essas informações, podemos identificar o problema específico!

