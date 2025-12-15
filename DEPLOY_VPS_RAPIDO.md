# ⚡ Deploy Rápido na VPS - Resolver Tela em Branco

## 🚨 Problema: Tela em Branco na VPS

Solução rápida em 5 passos:

---

## ✅ Passo 1: Conectar na VPS

```bash
ssh usuario@seu-ip-vps
cd /var/www/planeje  # ou onde você clonou
```

## ✅ Passo 2: Executar Script de Deploy

```bash
# Tornar executável (se necessário)
chmod +x deploy-vps.sh

# Executar
./deploy-vps.sh
```

O script vai:
- ✅ Verificar Node.js
- ✅ Instalar dependências
- ✅ Fazer build (`npm run build`)
- ✅ Verificar se build foi bem-sucedido

## ✅ Passo 3: Configurar Nginx

```bash
# Copiar configuração
sudo cp deploy/nginx-site.conf /etc/nginx/sites-available/planeje

# Editar configuração
sudo nano /etc/nginx/sites-available/planeje
```

**IMPORTANTE:** Edite estas linhas:

```nginx
server_name seu-dominio.com;  # ou IP da VPS
root /var/www/planeje/dist;    # Caminho completo para a pasta dist
```

## ✅ Passo 4: Ativar Site e Recarregar Nginx

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/planeje /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Se OK, recarregar
sudo systemctl reload nginx
```

## ✅ Passo 5: Verificar Permissões

```bash
# Garantir que nginx tem acesso
sudo chown -R www-data:www-data /var/www/planeje/dist
sudo chmod -R 755 /var/www/planeje/dist
```

---

## 🔍 Verificar se Funcionou

1. **Teste local na VPS:**
   ```bash
   curl http://localhost/
   ```
   Deve retornar HTML da aplicação.

2. **Teste no navegador:**
   Acesse `http://seu-ip-ou-dominio/`

3. **Se ainda tiver tela em branco:**
   - Abra DevTools (F12) → Console
   - Verifique erros
   - Verifique aba Network para ver quais arquivos não carregam

---

## 🐛 Troubleshooting Rápido

### Erro: "dist não encontrado"
```bash
npm run build
```

### Erro: "Permission denied"
```bash
sudo chown -R www-data:www-data /var/www/planeje/dist
sudo chmod -R 755 /var/www/planeje/dist
```

### Erro: "nginx: command not found"
```bash
sudo apt update
sudo apt install nginx
```

### Erro: "Node.js não encontrado"
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 📋 Checklist Rápido

- [ ] ✅ `./deploy-vps.sh` executado com sucesso
- [ ] ✅ Pasta `dist/` existe e tem arquivos
- [ ] ✅ Nginx configurado e apontando para `dist/`
- [ ] ✅ Site ativado (`sites-enabled`)
- [ ] ✅ `nginx -t` passa sem erros
- [ ] ✅ Permissões corretas (`www-data:www-data`)
- [ ] ✅ `curl http://localhost/` retorna HTML

---

## 🔄 Atualizar Aplicação (Depois)

```bash
cd /var/www/planeje
git pull origin main
./deploy-vps.sh
```

Pronto! 🎉

