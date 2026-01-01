import * as baileys from '@whiskeysockets/baileys'
import NodeCache from 'node-cache'
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import chalk from 'chalk'

import { promotePairedSocket } from '../../subbotManager.js'

const SUBBOT_DIR = 'Sessions/SubBotTemp'
const pairings = new Map()

function sanitizeId(jidOrNum = '') {
  return String(jidOrNum || '').replace(/\D/g, '')
}

function isWsOpen(sock) {
  const rs1 = sock?.ws?.socket?.readyState
  const rs2 = sock?.ws?.readyState
  return rs1 === 1 || rs2 === 1
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function formatPairCode(code = '') {
  return String(code || '').match(/.{1,4}/g)?.join('-') || String(code || '')
}

function normalizePairCodeRaw(code = '') {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

async function waitWsOpen(sock, timeoutMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (isWsOpen(sock)) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return isWsOpen(sock)
}

async function requestPairingCodeWithRetry(sock, phone, { attempts = 4 } = {}) {
  const normalizedPhone = sanitizeId(phone)
  if (!normalizedPhone) throw new Error('Número inválido')

  await new Promise((r) => setTimeout(r, 500))
  if (!(await waitWsOpen(sock, 15000))) throw new Error('Conexión cerrada, intenta de nuevo')

  let lastErr = null

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (!sock || !isWsOpen(sock)) throw new Error('Connection Closed')
      const codeRaw = await sock.requestPairingCode(normalizedPhone)
      return normalizePairCodeRaw(codeRaw)
    } catch (e) {
      lastErr = e
      const status =
        e?.output?.statusCode ||
        e?.output?.status ||
        e?.statusCode ||
        e?.status ||
        null

      const msg = String(e?.message || '').toLowerCase()

      if (String(status) === '428' || msg.includes('connection closed') || msg.includes('closed')) {
        await new Promise((r) => setTimeout(r, 900 * attempt))
        continue
      }

      if (String(status) === '429') {
        throw new Error('Rate limit de WhatsApp. Espera 30-40s y vuelve a intentar.')
      }

      throw e
    }
  }

  throw lastErr || new Error('No se pudo generar el código')
}

async function waitForPairingReady(sock, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let done = false

    const finish = (ok, err) => {
      if (done) return
      done = true
      try {
        sock?.ev?.off?.('connection.update', onUpdate)
      } catch {}
      clearTimeout(t)
      if (ok) resolve(true)
      else reject(err || new Error('No listo para pairing'))
    }

    const onUpdate = (u) => {
      const { connection, qr } = u || {}
      if (connection === 'connecting' || !!qr) return finish(true)
    }

    const t = setTimeout(() => finish(false, new Error('Timeout esperando estado connecting/qr')), timeoutMs)
    sock.ev.on('connection.update', onUpdate)
  })
}

async function stopPairing(id, { keepEntry = false } = {}) {
  const entry = pairings.get(id)
  if (!entry) return pairings.delete(id)

  try {
    entry.socket?.ev?.removeAllListeners?.()
  } catch {}
  try {
    entry.socket?.ws?.close?.()
  } catch {}
  try {
    entry.socket?.end?.()
  } catch {}

  if (keepEntry) {
    entry.socket = null
    entry.qr = null
    entry.code = null
    entry.codeRaw = null
    entry.updatedAt = Date.now()
    return
  }

  pairings.delete(id)
}

async function getOrCreatePairing({ ownerNumber }) {
  const id = sanitizeId(ownerNumber)
  if (!id) throw new Error('ownerNumber inválido')

  const existing = pairings.get(id)
  if (existing && existing.socket && isWsOpen(existing.socket)) return existing
  if (existing) await stopPairing(id)

  const sessionPath = path.join('./', SUBBOT_DIR, id)
  ensureDir(sessionPath)

  const { state, saveCreds } = await baileys.useMultiFileAuthState(sessionPath)
  const { version } = await baileys.fetchLatestBaileysVersion()
  const msgRetryCache = new NodeCache({ stdTTL: 60, checkperiod: 120 })

  function createPairingSocket() {
    const storeLogger = pino({ level: 'silent' })
    const store = baileys.makeInMemoryStore({ logger: storeLogger })
    const browser =
      (baileys.Browsers?.windows && baileys.Browsers.windows('Firefox')) || ['Windows', 'Firefox', '1.0.0']

    const sock = baileys.makeWASocket({
      version,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      auth: {
        creds: state.creds,
        keys: baileys.makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser,
      msgRetryCache,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      syncFullHistory: false,
      getMessage: async (key) => {
        try {
          const msg = await store?.loadMessage?.(key?.remoteJid, key?.id)
          return msg?.message || undefined
        } catch {
          return undefined
        }
      }
    })

    try {
      store.bind(sock.ev)
    } catch {}

    return sock
  }

  let socket = createPairingSocket()

  socket.isSubBot = true
  socket.subbotId = id
  socket.subbotOwner = `${id}@s.whatsapp.net`
  socket.subbotSessionPath = sessionPath

  const entry = {
    id,
    ownerJid: `${id}@s.whatsapp.net`,
    socket,
    sessionPath,
    qr: null,
    code: null,
    codeRaw: null,
    status: state.creds.registered ? 'registered' : 'waiting',
    updatedAt: Date.now()
  }

  pairings.set(id, entry)

  const onCredsUpdate = () => {
    try {
      Promise.resolve(saveCreds()).catch(() => {})
      const e = pairings.get(id)
      if (e) {
        e.updatedAt = Date.now()
        e.status = state.creds.registered ? 'registered' : e.status
      }
    } catch {}
  }

  const onConnUpdate = async (u) => {
    const { connection, qr, lastDisconnect } = u || {}
    const e = pairings.get(id)
    if (!e) return

    if (qr) {
      e.qr = qr
      e.updatedAt = Date.now()
      e.status = 'waiting'
    }

    if (connection === 'open') {
      e.updatedAt = Date.now()
      e.status = 'open'
      console.log(chalk.greenBright(`[WEBPAIR] paired/open id=${id}`))

      try {
        try { await Promise.resolve(saveCreds()).catch(() => {}) } catch {}
        promotePairedSocket({
          socket,
          id,
          sessionPath,
          ownerJid: e.ownerJid,
          saveCreds
        })
        e.status = 'ready'
        console.log(chalk.cyanBright(`[WEBPAIR] promoted/ready id=${id}`))
      } catch (err) {
        e.status = `promote_failed:${String(err?.message || err || 'unknown')}`
        console.error(chalk.red('[WEBPAIR] fallo promotePairedSocket:'), err)
      }

      try {
        socket.ev.off('creds.update', onCredsUpdate)
      } catch {}
      try {
        socket.ev.off('connection.update', onConnUpdate)
      } catch {}

      try {
        e.qr = null
        e.code = null
        e.codeRaw = null
      } catch {}

      setTimeout(() => process.exit(1), 2000)
      return
    }

    if (connection === 'close') {
      const code =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.output?.payload?.statusCode ||
        lastDisconnect?.error?.statusCode ||
        null

      if (code === baileys.DisconnectReason.restartRequired || String(code) === '515') {
        e.updatedAt = Date.now()
        e.status = 'restarting'
        console.log(chalk.yellowBright(`[WEBPAIR] restartRequired -> recreando socket id=${id}`))

        try {
          try {
            socket.ev.off('creds.update', onCredsUpdate)
          } catch {}
          try {
            socket.ev.off('connection.update', onConnUpdate)
          } catch {}
          try {
            socket.ws?.close?.()
          } catch {}
        } catch {}

        socket = createPairingSocket()

        socket.isSubBot = true
        socket.subbotId = id
        socket.subbotOwner = `${id}@s.whatsapp.net`
        socket.subbotSessionPath = sessionPath

        e.socket = socket
        pairings.set(id, e)

        socket.ev.on('creds.update', onCredsUpdate)
        socket.ev.on('connection.update', onConnUpdate)
        return
      }

      e.updatedAt = Date.now()
      e.status = `closed:${code ?? 'unknown'}`
    }
  }

  socket.ev.on('creds.update', onCredsUpdate)
  socket.ev.on('connection.update', onConnUpdate)

  return entry
}

async function getPairingQr({ ownerNumber }) {
  const entry = await getOrCreatePairing({ ownerNumber })

  const waitUntil = Date.now() + 8000
  while (Date.now() < waitUntil) {
    if (entry.qr) break
    if (entry.status === 'open' || entry.status === 'registered') break
    if (String(entry.status || '').startsWith('closed:')) break
    await new Promise((r) => setTimeout(r, 250))
  }

  return { id: entry.id, qr: entry.qr, status: entry.status }
}

async function getPairingCode({ ownerNumber, phoneNumber }) {
  const entry = await getOrCreatePairing({ ownerNumber })
  const phone = String(phoneNumber || ownerNumber || '').replace(/\D/g, '')
  if (!phone) throw new Error('Número inválido')

  try {
    await waitForPairingReady(entry.socket, 20000)
  } catch {}

  const raw = await requestPairingCodeWithRetry(entry.socket, phone, { attempts: 4 })
  const code = formatPairCode(raw)

  entry.code = code
  entry.codeRaw = raw
  entry.updatedAt = Date.now()
  entry.status = 'waiting'

  return { id: entry.id, code, codeRaw: raw, status: entry.status }
}

function getPairingStatus({ ownerNumber }) {
  const id = sanitizeId(ownerNumber)
  const entry = pairings.get(id)
  if (!entry) return { exists: false }

  return {
    exists: true,
    id: entry.id,
    status: entry.status,
    updatedAt: entry.updatedAt,
    hasQr: !!entry.qr,
    hasCode: !!entry.code,
    hasCodeRaw: !!entry.codeRaw
  }
}

export { getPairingQr, getPairingCode, getPairingStatus }