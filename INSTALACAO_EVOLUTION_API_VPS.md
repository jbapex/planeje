# 🖥️ Instalação Evolution API na VPS

## 🎯 Por Que Precisa de VPS?

**Sim, você precisa instalar o Evolution API em uma VPS porque:**

1. ✅ Precisa rodar 24/7 (manter conexão WhatsApp ativa)
2. ✅ Precisa de IP fixo e estável
3. ✅ Precisa de recursos dedicados (não pode parar)
4. ✅ Não pode rodar no Supabase (Edge Functions são stateless)

---

## 📋 Requisitos da VPS

### **Especificações Mínimas:**
- **RAM:** 1GB (recomendado 2GB)
- **CPU:** 1 core (recomendado 2 cores)
- **Disco:** 10GB (recomendado 20GB)
- **Sistema:** Ubuntu 20.04+ ou Debian 11+
- **Rede:** IP público e portas abertas (8080)

### **Provedores Recomendados (Brasil):**
- **DigitalOcean:** $6/mês (1GB RAM)
- **Linode:** $5/mês (1GB RAM)
- **Vultr:** $6/mês (1GB RAM)
- **Contabo:** €4/mês (4GB RAM) - Melhor custo-benefício
- **Hostinger VPS:** R$ 29/mês (2GB RAM)

---

## 🚀 Passo a Passo Completo

### **1. Criar e Conectar na VPS**

```bash
# Exemplo: DigitalOcean
# 1. Criar Droplet Ubuntu 22.04
# 2. Conectar via SSH
ssh root@seu-ip-vps

# Ou se usar chave SSH
ssh -i ~/.ssh/sua-chave root@seu-ip-vps
```

---

### **2. Atualizar Sistema**

```bash
# Atualizar pacotes
apt update && apt upgrade -y

# Instalar dependências básicas
apt install -y curl wget git nano
```

---

### **3. Instalar Docker**

```bash
# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Iniciar Docker
systemctl start docker
systemctl enable docker

# Verificar instalação
docker --version
docker-compose --version
```

**Se docker-compose não estiver instalado:**

```bash
# Instalar docker-compose
apt install docker-compose -y

# Ou usar versão standalone
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

---

### **4. Criar Diretório e Arquivos**

```bash
# Criar diretório
mkdir -p /opt/evolution-api
cd /opt/evolution-api

# Criar docker-compose.yml
nano docker-compose.yml
```

**Cole este conteúdo:**

```yaml
version: '3.8'

services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      # IMPORTANTE: Mude esta chave para algo seguro!
      - AUTHENTICATION_API_KEY=SUA_CHAVE_SUPER_SECRETA_AQUI_MUDE_ISSO
      
      # Configurações do servidor
      - SERVER_URL=http://SEU_IP_VPS:8080
      - SERVER_TYPE=http
      
      # Configurações de QR Code
      - QRCODE_LIMIT=30
      - QRCODE_COLOR=#198754
      
      # Configurações opcionais (banco de dados)
      # - DATABASE_ENABLED=true
      # - DATABASE_PROVIDER=postgresql
      # - DATABASE_CONNECTION_URI=postgresql://user:pass@host:5432/evolution
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
    networks:
      - evolution-network

volumes:
  evolution_instances:
  evolution_store:

networks:
  evolution-network:
    driver: bridge
```

**Salvar e sair:** `Ctrl+X`, depois `Y`, depois `Enter`

**IMPORTANTE:** Edite o arquivo e mude:
- `AUTHENTICATION_API_KEY` para uma chave segura (ex: `jbapex_2024_secure_key_xyz123`)
- `SERVER_URL` para o IP da sua VPS (ex: `http://123.456.789.0:8080`)

---

### **5. Configurar Firewall**

```bash
# Instalar UFW (se não tiver)
apt install ufw -y

# Permitir SSH
ufw allow 22/tcp

# Permitir porta do Evolution API
ufw allow 8080/tcp

# Ativar firewall
ufw enable

# Verificar status
ufw status
```

---

### **6. Iniciar Evolution API**

```bash
# Voltar para o diretório
cd /opt/evolution-api

# Iniciar container
docker-compose up -d

# Ver logs
docker-compose logs -f

# Verificar se está rodando
docker ps
```

**Você deve ver algo como:**
```
CONTAINER ID   IMAGE                          STATUS
abc123def456   atendai/evolution-api:latest   Up 2 minutes
```

---

### **7. Testar se Está Funcionando**

```bash
# Testar API
curl http://localhost:8080

# Ou do seu computador local
curl http://SEU_IP_VPS:8080
```

**Se funcionar, você verá uma resposta JSON.**

---

### **8. Conectar WhatsApp**

**Opção 1: Via Interface Web (Mais Fácil)**

1. Abra no navegador: `http://SEU_IP_VPS:8080`
2. Você verá a interface do Evolution API
3. Crie uma instância chamada `jbapex-instance`
4. Escaneie o QR Code com seu WhatsApp

**Opção 2: Via API (Mais Técnico)**

```bash
# Criar instância
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: SUA_CHAVE_SUPER_SECRETA_AQUI_MUDE_ISSO" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "jbapex-instance",
    "token": "token-opcional",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'

# Obter QR Code
curl http://localhost:8080/instance/connect/jbapex-instance \
  -H "apikey: SUA_CHAVE_SUPER_SECRETA_AQUI_MUDE_ISSO"
```

**Depois de conectar:**
- Abra WhatsApp no celular
- Vá em Configurações > Aparelhos conectados
- Escaneie o QR Code exibido

---

### **9. Testar Envio de Mensagem**

```bash
# Enviar mensagem de teste
curl -X POST http://localhost:8080/message/sendText/jbapex-instance \
  -H "apikey: SUA_CHAVE_SUPER_SECRETA_AQUI_MUDE_ISSO" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999999999",
    "text": "✅ Evolution API funcionando na VPS!"
  }'
```

**Formato do número:** Sempre com código do país (55 para Brasil) + DDD + número

---

### **10. Configurar no Supabase**

**No Supabase Dashboard:**

1. Vá em **Project Settings > Edge Functions > Secrets**
2. Adicione:
   - `EVOLUTION_API_URL`: `http://SEU_IP_VPS:8080`
   - `EVOLUTION_API_KEY`: `SUA_CHAVE_SUPER_SECRETA_AQUI_MUDE_ISSO`

**Ou via CLI:**

```bash
supabase secrets set EVOLUTION_API_URL=http://SEU_IP_VPS:8080
supabase secrets set EVOLUTION_API_KEY=SUA_CHAVE_SUPER_SECRETA_AQUI_MUDE_ISSO
```

---

## 🔒 Segurança

### **1. Usar HTTPS (Recomendado)**

**Instalar Nginx como proxy reverso:**

```bash
# Instalar Nginx
apt install nginx -y

# Instalar Certbot (Let's Encrypt)
apt install certbot python3-certbot-nginx -y

# Configurar Nginx
nano /etc/nginx/sites-available/evolution-api
```

**Configuração Nginx:**

```nginx
server {
    listen 80;
    server_name seu-dominio.com; # Ou IP da VPS

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Ativar e obter certificado:**

```bash
# Ativar site
ln -s /etc/nginx/sites-available/evolution-api /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Obter certificado SSL (se tiver domínio)
certbot --nginx -d seu-dominio.com
```

**Depois, use HTTPS no Supabase:**
```
EVOLUTION_API_URL=https://seu-dominio.com
```

---

### **2. Restringir Acesso por IP (Opcional)**

**No firewall, permitir apenas IPs específicos:**

```bash
# Permitir apenas IP do Supabase (se souber)
ufw allow from SUPABASE_IP to any port 8080

# Ou permitir apenas seu IP
ufw allow from SEU_IP to any port 8080
```

---

### **3. Usar Chave Forte**

**Gerar chave segura:**

```bash
# Gerar chave aleatória
openssl rand -hex 32
```

**Use essa chave no `AUTHENTICATION_API_KEY`**

---

## 🔄 Manutenção

### **Atualizar Evolution API**

```bash
cd /opt/evolution-api
docker-compose pull
docker-compose up -d
```

### **Ver Logs**

```bash
cd /opt/evolution-api
docker-compose logs -f
```

### **Reiniciar**

```bash
cd /opt/evolution-api
docker-compose restart
```

### **Parar**

```bash
cd /opt/evolution-api
docker-compose down
```

### **Verificar Status**

```bash
docker ps | grep evolution
```

---

## 🐛 Troubleshooting

### **Problema: Container não inicia**

```bash
# Ver logs detalhados
docker-compose logs

# Verificar se porta está livre
netstat -tulpn | grep 8080

# Reiniciar Docker
systemctl restart docker
```

---

### **Problema: WhatsApp desconecta**

**Causa:** Se não usar por muito tempo, pode desconectar.

**Solução:**
- Implementar "keep-alive" (ping periódico)
- Ou usar webhook para manter conexão ativa

---

### **Problema: Não consegue acessar de fora**

**Verificar:**
1. Firewall está permitindo porta 8080?
2. VPS tem IP público?
3. Provedor não está bloqueando porta?

```bash
# Testar localmente
curl http://localhost:8080

# Testar de fora (do seu computador)
curl http://SEU_IP_VPS:8080
```

---

## 📊 Monitoramento

### **Criar Script de Monitoramento**

```bash
# Criar script
nano /opt/evolution-api/check-status.sh
```

**Conteúdo:**

```bash
#!/bin/bash
if ! curl -f http://localhost:8080 > /dev/null 2>&1; then
    echo "Evolution API está offline!"
    cd /opt/evolution-api
    docker-compose restart
fi
```

**Tornar executável:**

```bash
chmod +x /opt/evolution-api/check-status.sh
```

**Adicionar ao crontab (verificar a cada 5 minutos):**

```bash
crontab -e
```

**Adicionar linha:**
```
*/5 * * * * /opt/evolution-api/check-status.sh
```

---

## ✅ Checklist Final

- [ ] VPS criada e configurada
- [ ] Docker instalado
- [ ] Evolution API rodando
- [ ] WhatsApp conectado via QR Code
- [ ] Teste de envio funcionando
- [ ] Secrets configurados no Supabase
- [ ] Firewall configurado
- [ ] Monitoramento configurado (opcional)

---

## 🎯 Próximos Passos

1. ✅ Evolution API rodando na VPS
2. ✅ WhatsApp conectado
3. ✅ Configurar no Supabase (secrets)
4. ✅ Criar Edge Function
5. ✅ Testar integração completa

---

**🎉 Com isso, você terá Evolution API rodando 24/7 na sua VPS!**

