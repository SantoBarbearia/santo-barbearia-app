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
- Marcar como pago (debita automaticamente da conta selecionada)
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
- Dados salvos automaticamente no Supabase (Postgres)
- Acesso de qualquer dispositivo (smartphone, tablet, PC)

---

## 📁 Estrutura do Projeto

```
santo-barbearia-app/
├── frontend/              # React + Vite
│   ├── src/
│   │   ├── App.jsx        # Componente principal
│   │   ├── App.css        # Estilos
│   │   └── main.jsx       # Entrada
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.example       # Exemplo de variáveis de ambiente
│   └── package.json
├── database/
│   └── schema.sql          # Schema do banco (Supabase/Postgres)
├── .gitignore
├── vercel.json             # Configuração de deploy na Vercel
└── README.md
```

---

## 💻 Rodar Localmente

```bash
cd frontend
npm install

# Crie um .env.local (NÃO é commitado) com base no .env.example:
# VITE_SUPABASE_URL=https://seu-projeto.supabase.co
# VITE_SUPABASE_ANON_KEY=sua-anon-key

npm run dev
# Abre em http://localhost:5173
```

---

## 🗄️ Banco de Dados (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito, sem cartão)
2. No **SQL Editor**, rode o conteúdo de `database/schema.sql`
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**
4. Use esses valores em `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

> Use sempre a **anon key** no frontend. A **service role key** é secreta e nunca deve ser exposta em código cliente.

---

## 🚀 Deploy na Vercel

1. Importe este repositório na Vercel
2. **Root Directory**: `frontend`
3. Em **Environment Variables**, adicione:
   ```
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-key
   ```
4. Deploy — a URL fica disponível em ~1-2 minutos

---

## 📱 Usar no Celular

1. Abra a URL do Vercel no navegador do celular
2. Salve como atalho na tela inicial:
   - **iPhone**: Safari → Compartilhar → "Adicionar à Tela de Início"
   - **Android**: Menu → "Instalar aplicativo"

---

## 📊 Próximos Passos

- ✅ Sistema funcionando com Supabase
- ⬜ Adicionar autenticação (login/senha)
- ⬜ Relatórios e exportação PDF

---

**Criado com ❤️ para Santo Barbearia**
