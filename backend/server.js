const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// ===== CONTAS =====
app.get('/api/contas', async (req, res) => {
  try {
    const snapshot = await db.ref('contas').once('value');
    res.json(snapshot.val() || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contas', async (req, res) => {
  try {
    await db.ref('contas').set(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== CONTAS A PAGAR =====
app.get('/api/contas-pagar', async (req, res) => {
  try {
    const snapshot = await db.ref('contasAPagar').once('value');
    res.json(snapshot.val() || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contas-pagar', async (req, res) => {
  try {
    const id = Date.now().toString();
    await db.ref(`contasAPagar/${id}`).set({
      ...req.body,
      id,
      dataCriacao: new Date().toISOString()
    });
    res.json({ id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/contas-pagar/:id', async (req, res) => {
  try {
    await db.ref(`contasAPagar/${req.params.id}`).update(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== COMISSÕES =====
app.get('/api/comissoes', async (req, res) => {
  try {
    const snapshot = await db.ref('comissoes').once('value');
    res.json(snapshot.val() || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/comissoes', async (req, res) => {
  try {
    await db.ref('comissoes').set(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== TRANSFERÊNCIAS =====
app.get('/api/transferencias', async (req, res) => {
  try {
    const snapshot = await db.ref('transferencias').once('value');
    res.json(snapshot.val() || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transferencias', async (req, res) => {
  try {
    const id = Date.now().toString();
    await db.ref(`transferencias/${id}`).set({
      ...req.body,
      id,
      dataCriacao: new Date().toISOString()
    });
    res.json({ id, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em porta ${PORT}`);
});
