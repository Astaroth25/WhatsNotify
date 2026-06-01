import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import express, { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3001;
const API_KEY = process.env.API_KEY;
const OWNER_PHONE = process.env.OWNER_PHONE || '593996222872';

if (!API_KEY) {
  console.error('❌ La variable de entorno API_KEY no está definida. Abortando.');
  process.exit(1);
}

// Estado de la conexión expuesto para el endpoint /api/status
let waStatus: 'disconnected' | 'connecting' | 'connected' = 'connecting';
let sock: ReturnType<typeof makeWASocket> | null = null;

// ── Endpoints sin autenticación ──────────────────────────────────────────────

app.get('/api/status', (_req: Request, res: Response) => {
  res.json({ status: waStatus, uptime: process.uptime() });
});

// ── Middleware de autenticación (aplica a todo lo que sigue) ─────────────────

app.use((req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  next();
});

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Valida que el teléfono sea solo dígitos con longitud E.164 (7–15 dígitos, sin el +). */
function isValidPhone(phone: string): boolean {
  return /^\d{7,15}$/.test(phone);
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const { default: qrcode } = await import('qrcode-terminal');
      console.log('\n--- ESCANEA ESTE CÓDIGO QR CON WHATSAPP ---');
      qrcode.generate(qr, { small: true });
      console.log('-------------------------------------------\n');
    }

    if (connection === 'close') {
      waStatus = 'disconnected';
      const error = lastDisconnect?.error as Boom | undefined;
      const shouldReconnect = error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('⚠️  Conexión cerrada. Reconectando:', shouldReconnect);

      if (shouldReconnect) {
        waStatus = 'connecting';
        connectToWhatsApp();
      } else {
        console.log('❌ Sesión cerrada. Borra la carpeta auth_info_baileys y reinicia para volver a escanear el QR.');
      }
    } else if (connection === 'open') {
      waStatus = 'connected';
      console.log('✅ WhatsApp conectado.');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// ── Endpoints protegidos ─────────────────────────────────────────────────────

interface PurchaseBody {
  clientPhone: string;
  clientMessage: string;
  internalAlert: string;
}

app.post(
  '/api/purchase',
  async (req: Request<{}, {}, PurchaseBody>, res: Response) => {
    const { clientPhone, clientMessage, internalAlert } = req.body;

    if (!clientPhone || !clientMessage || !internalAlert) {
      res.status(400).json({ error: 'Faltan campos requeridos: clientPhone, clientMessage, internalAlert' });
      return;
    }

    if (!isValidPhone(clientPhone)) {
      res.status(400).json({ error: 'clientPhone inválido. Usa solo dígitos con código de país (ej: 593987654321)' });
      return;
    }

    if (waStatus !== 'connected' || !sock) {
      res.status(503).json({ error: `WhatsApp no está disponible (estado: ${waStatus})` });
      return;
    }

    const clientJid = `${clientPhone}@s.whatsapp.net`;
    const ownerJid = `${OWNER_PHONE}@s.whatsapp.net`;

    try {
      await sock.sendMessage(clientJid, { text: clientMessage });
      await sock.sendMessage(ownerJid, { text: `🔔 NUEVA COMPRA:\n\n${internalAlert}` });

      res.json({ success: true, message: 'Notificaciones enviadas' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('Error enviando mensajes:', message);
      res.status(500).json({ error: message });
    }
  }
);

// Alias retrocompatible con el nombre original del endpoint
app.post('/api/reservation', (req, res) => {
  req.url = '/api/purchase';
  app(req, res);
});

// ── Arranque ─────────────────────────────────────────────────────────────────

connectToWhatsApp();

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});

// Apagado limpio
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando...');
  process.exit(0);
});
