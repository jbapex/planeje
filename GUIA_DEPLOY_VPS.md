# 🚀 Guia Completo de Deploy na VPS

## 🔍 Diagnóstico: Tela em Branco na VPS

O problema de tela em branco geralmente ocorre por:
1. ❌ Build não executado ou incorreto
2. ❌ Nginx não configurado para SPA
3. ❌ Arquivos estáticos não sendo servidos corretamente
4. ❌ Problemas com paths relativos/absolutos
5. ❌ Variáveis de ambiente não configuradas

---

## ✅ Solução Passo a Passo

### 1️⃣ Conectar na VPS

```bash
ssh usuario@seu-ip-vps
cd /var/www/planeje  # ou onde você clonou o projeto
```

### 2️⃣ Instalar Dependências e Fazer Build

```bash
# Garantir que está na versão correta do Node
node --version  # Deve ser 18+ ou 20+

# Se não tiver Node instalado:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar dependências
npm install

# Fazer build de produção
npm run build
```

**⚠️ IMPORTANTE:** O build deve gerar a pasta `dist/` com os arquivos estáticos.

### 3️⃣ Verificar se o Build Funcionou

```bash
# Verificar se a pasta dist foi criada
ls -la dist/

# Deve conter:
# - index.html
# - assets/ (com JS, CSS, etc.)
```

### 4️⃣ Configurar Nginx

#### Opção A: Usar o arquivo de configuração do projeto

```bash
# Copiar configuração do nginx
sudo cp deploy/nginx-site.conf /etc/nginx/sites-available/planeje

# Editar o arquivo para ajustar o domínio/IP
sudo nano /etc/nginx/sites-available/planeje
```

**Edite a linha 3:**
```nginx
server_name seu-dominio.com;  # ou seu IP
```

**Edite a linha 4:**
```nginx
root /var/www/planeje/dist;  # Caminho completo para a pasta dist
```

#### Opção B: Configuração Manual

```bash
sudo nano /etc/nginx/sites-available/planeje
```

Cole esta configuração:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # ou IP da VPS
    
    # IMPORTANTE: Apontar para a pasta dist do build
    root /var/www/planeje/dist;
    index index.html;

    # Logs
    access_log /var/log/nginx/planeje-access.log;
    error_log /var/log/nginx/planeje-error.log;

    # Configuração para SPA (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache para assets estáticos
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;
}
```

### 5️⃣ Ativar Site no Nginx

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/planeje /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Se tudo estiver OK, recarregar nginx
sudo systemctl reload nginx
```

### 6️⃣ Verificar Permissões

```bash
# Garantir que o nginx tem acesso aos arquivos
sudo chown -R www-data:www-data /var/www/planeje/dist
sudo chmod -R 755 /var/www/planeje/dist
```

### 7️⃣ Verificar Firewall

```bash
# Permitir HTTP (porta 80)
sudo ufw allow 80/tcp

# Se usar HTTPS (porta 443)
sudo ufw allow 443/tcp
```

---

## 🔧 Troubleshooting

### Problema: Tela em branco continua

#### 1. Verificar Console do Navegador

Abra o DevTools (F12) e verifique:
- Erros no Console
- Erros na aba Network (arquivos não carregando)
- Status HTTP (404, 500, etc.)

#### 2. Verificar Logs do Nginx

```bash
# Ver erros do nginx
sudo tail -f /var/log/nginx/error.log

# Ver acessos
sudo tail -f /var/log/nginx/access.log
```

#### 3. Verificar se os Arquivos Estão Sendo Servidos

```bash
# Testar se o index.html está acessível
curl http://localhost/

# Deve retornar o HTML da aplicação
```

#### 4. Verificar Build

```bash
# Verificar conteúdo do index.html gerado
cat dist/index.html

# Deve conter referências aos arquivos JS/CSS em /assets/
```

#### 5. Verificar Paths no Build

O problema pode ser paths absolutos vs relativos. Verifique o `vite.config.js`:

```javascript
export default defineConfig({
  base: '/',  // Deve ser '/' para produção na raiz
  // ... resto da config
});
```

### Problema: Erro 404 em rotas

Isso é normal em SPAs. O nginx deve ter:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### Problema: Assets não carregam (404 em JS/CSS)

1. Verificar se a pasta `dist/assets/` existe e tem arquivos
2. Verificar permissões: `sudo chmod -R 755 dist/`
3. Verificar se o nginx está servindo de `/assets/` corretamente

### Problema: Erro de CORS ou Supabase

O código já tem as URLs hardcoded, então não deve ser problema. Mas se houver:

1. Verificar se a URL do Supabase está correta em `src/lib/customSupabaseClient.js`
2. Verificar políticas RLS no Supabase
3. Verificar se não há bloqueio de firewall

---

## 📋 Checklist de Deploy

- [ ] ✅ Node.js instalado (versão 18+)
- [ ] ✅ Repositório clonado na VPS
- [ ] ✅ `npm install` executado com sucesso
- [ ] ✅ `npm run build` executado com sucesso
- [ ] ✅ Pasta `dist/` criada e contém arquivos
- [ ] ✅ Nginx instalado e configurado
- [ ] ✅ Configuração do nginx aponta para `/var/www/planeje/dist`
- [ ] ✅ Site ativado no nginx (`sites-enabled`)
- [ ] ✅ `nginx -t` passa sem erros
- [ ] ✅ Permissões corretas (`www-data:www-data`)
- [ ] ✅ Firewall permite porta 80
- [ ] ✅ Teste local: `curl http://localhost/` retorna HTML
- [ ] ✅ Teste externo: acessar via IP/domínio no navegador

---

## 🔄 Atualizar Aplicação (Após Mudanças)

```bash
cd /var/www/planeje

# Atualizar código
git pull origin main

# Reinstalar dependências (se necessário)
npm install

# Rebuild
npm run build

# Recarregar nginx (geralmente não necessário, mas não faz mal)
sudo systemctl reload nginx
```

---

## 🐳 Deploy com Docker (Opcional)

Se preferir usar Docker:

```bash
# Build da imagem
docker build -t planeje-app .

# Rodar container
docker run -d \
  --name planeje \
  -p 80:80 \
  planeje-app
```

---

## 📞 Suporte

Se ainda tiver problemas:

1. **Cole os logs do nginx:**
   ```bash
   sudo tail -50 /var/log/nginx/error.log
   ```

2. **Cole o output do build:**
   ```bash
   npm run build 2>&1 | tail -50
   ```

3. **Verifique o console do navegador** (F12 → Console)

4. **Verifique a aba Network** (F12 → Network) para ver quais arquivos estão falhando

