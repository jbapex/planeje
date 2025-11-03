# ⚡ Deploy Rápido - 5 Minutos

## 🎯 Opção Mais Rápida: Vercel (Recomendado)

### 1️⃣ Preparar GitHub (Se ainda não tiver)

```bash
# No terminal, dentro da pasta do projeto:
git init
git add .
git commit -m "Sistema pronto para deploy"
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

### 2️⃣ Deploy na Vercel

**Opção A: Via Site (Mais Fácil)**
1. Acesse: https://vercel.com
2. Clique em "Sign Up" → Use GitHub
3. Clique em "Add New Project"
4. Selecione seu repositório
5. Clique em "Deploy"

**Opção B: Via Terminal**
```bash
npm i -g vercel
vercel
```

### 3️⃣ Pronto! 🎉

Você receberá uma URL tipo: `https://seu-projeto.vercel.app`

---

## ✅ Arquivos Já Criados

✅ `vercel.json` - Configuração para Vercel  
✅ `netlify.toml` - Configuração para Netlify  
✅ `GUIA_DEPLOY_ONLINE.md` - Guia completo detalhado

---

## 🚨 Se der erro no build

```bash
# Teste localmente primeiro:
npm run build
npm run preview
```

Se funcionar localmente, o deploy funcionará também!

---

## 💡 Dica

O arquivo `vercel.json` já está configurado. Só precisa:
1. Ter o código no GitHub
2. Conectar no Vercel
3. Deploy!

Pronto em minutos! ⚡

