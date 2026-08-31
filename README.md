# Santo Barbearia - Controle Financeiro Online

Sistema completo de controle financeiro para Santo Barbearia, acessível de qualquer lugar via web app.

## 🎯 Funcionalidades

✅ **Gerenciamento de Contas**
- Caixa (dinheiro físico)
- Cofre (dinheiro guardado)
- Reserva/Investimento
- Conta Corrente (Sicredi)

✅ **Contas a Pagar**
- Registro de despesas recorrentes
- Marcar como pago (debita automaticamente da conta)
- Histórico de pagamentos

✅ **Comissões dos Barbeiros**
- Cálculo automático: Serviços + Produtos + Assinatura - Vale - Consumo - MEI
- 4 barbeiros pré-configurados
- Atualização em tempo real

✅ **Transferências Entre Contas**
- Transferir dinheiro entre contas
- Registro automático
- Histórico de movimentações

✅ **Sincronização**
- Dados salvos automaticamente no Firebase
- Acesso de qualquer dispositivo (smartphone, tablet, PC)
- Backup automático

---

## 🚀 Como Configurar (3 PASSOS)

### **PASSO 1: Criar Conta Firebase (5 minutos)**

1. Abra `firebase.google.com`
2. Clique em **"Começar"**
3. **Crie um projeto**
   - Nome: `Santo Barbearia` (ou o que preferir)
   - Selecione sua região
   - Clique em **"Criar projeto"**

4. Após criar, vá em **"Realtime Database"**
   - Clique em **"Criar banco de dados"**
   - Escolha **"Começar no modo de teste"** (temporário)
   - Selecione localização: **us-central1** (ou sua região)
   - Clique em **"Ativar"**

5. Agora copie suas credenciais:
   - No menu à esquerda, vá em **"Configurações do projeto"** (engrenagem)
   - Clique na aba **"Geral"**
   - Procure por **"firebaseConfig"** (está em JavaScript)
   - Ou vá em **"Contas de serviço"** e copie as informações

6. Suas credenciais são:
   ```
   - apiKey
   - authDomain
   - databaseURL
   - projectId
   - storageBucket
   - messagingSenderId
   - appId
   ```

**Copie esses valores, você vai precisar!**

---

### **PASSO 2: Criar Repositório GitHub**

1. Abra `github.com` e faça login (ou crie conta)
2. Clique em **"New repository"**
3. **Configure:**
   - Nome: `santo-barbearia-app`
   - Descrição: `Sistema de controle financeiro`
   - Selecione **"Public"** (mais fácil)
   - Clique em **"Create repository"**

4. **Copie o código que aparecer** (tipo `git clone https://github.com/...`)

5. **No seu PC**, abra o terminal/CMD e execute:
   ```bash
   git clone https://github.com/seu-usuario/santo-barbearia-app.git
   cd santo-barbearia-app
   ```

---

### **PASSO 3: Fazer Deploy na Vercel**

1. Abra `vercel.com` e faça login com GitHub
2. Clique em **"New Project"**
3. Selecione **seu repositório** `santo-barbearia-app`
4. Clique em **"Import"**
5. **Adicione as variáveis de ambiente:**
   - Na seção **"Environment Variables"**, adicione:
     ```
     VITE_FIREBASE_API_KEY = [sua api key do Firebase]
     VITE_FIREBASE_AUTH_DOMAIN = [seu auth domain]
     VITE_FIREBASE_DATABASE_URL = [sua database URL]
     VITE_FIREBASE_PROJECT_ID = [seu project id]
     VITE_FIREBASE_STORAGE_BUCKET = [seu storage bucket]
     VITE_FIREBASE_MESSAGING_SENDER_ID = [seu messaging sender id]
     VITE_FIREBASE_APP_ID = [seu app id]
     ```

6. Clique em **"Deploy"**
7. **Pronto!** Sua URL aparecer em 1-2 minutos (tipo: `seu-app.vercel.app`)

---

## 💻 Para Rodar Localmente (Opcional)

```bash
# Instalar dependências do frontend
cd frontend
npm install

# Rodar em desenvolvimento
npm run dev

# Vai abrir em http://localhost:5173
```

---

## 📝 Estrutura do Projeto

```
santo-barbearia-app/
├── frontend/              # React App
│   ├── src/
│   │   ├── App.jsx       # Componente principal
│   │   ├── App.css       # Estilos
│   │   └── main.jsx      # Entrada
│   ├── index.html        # HTML
│   ├── vite.config.js    # Configuração Vite
│   ├── .env.example      # Exemplo de variáveis
│   └── package.json
├── backend/              # Node.js/Express (opcional, futuro)
└── vercel.json          # Configuração Vercel
```

---

## 🔐 Segurança do Firebase

Depois que tudo funcionar, **altere o Firebase para modo RESTRITO:**

1. No Firebase Console, vá em **"Realtime Database"**
2. Clique na aba **"Regras"**
3. Substitua por:
   ```json
   {
     "rules": {
       ".read": false,
       ".write": false
     }
   }
   ```
4. Clique em **"Publicar"**

**Depois, você vai precisar de autenticação.** Quando chegar a hora, eu te ajudo com isso.

---

## 🐛 Troubleshooting

### "Erro ao conectar com banco de dados"
- Verifique se suas credenciais Firebase estão corretas
- Copie exatamente como aparecem no Firebase Console
- Não deixe espaços em branco

### "Dados não salvam"
- Verifique se o Firebase Database URL está correto
- Certifique-se de estar em modo "Teste" (ou configure as regras)

### "App não aparece online"
- Espere 5 minutos para Vercel completar o build
- Verifique os logs em Vercel > "Deployments"

---

## 📱 Usar no Celular

1. Pegue sua URL do Vercel (tipo: `seu-app.vercel.app`)
2. Abra no navegador do celular
3. Você pode salvar como atalho na tela inicial:
   - **iPhone**: Safari → Compartilhar → "Adicionar à Tela de Início"
   - **Android**: Menu → "Instalar aplicativo" (aparece como PWA)

---

## 📊 Próximos Passos

- ✅ Sistema funcionando
- ⬜ Adicionar autenticação (login/senha)
- ⬜ Adicionar backend (Node.js + Express)
- ⬜ Integração com API do Cash Barber
- ⬜ Relatórios e exportação PDF

---

## 💡 Dúvidas?

Se tiver problema em qualquer etapa, avisa! 🚀

---

**Criado com ❤️ para Santo Barbearia**
