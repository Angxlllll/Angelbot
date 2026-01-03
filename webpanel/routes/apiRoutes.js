import express from 'express'
import multer from 'multer'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'

import {
  computeGlobalSubbotCount,
  getMySubbotSummary,
  listMyGroups,
  setGroupToggles,
  getGroupMessages,
  setGroupMessages,
  setGroupPrimary,
  clearGroupPrimary,
  getSessionDirFor,
  getSubbotIdFromWaNumber
} from '../lib/subbotApi.js'

import { getPairingQr, getPairingCode, getPairingStatus } from '../lib/pairingManager.js'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { setCommandPrefix, getCommandPrefix } from '../../biblioteca/settings.js'

function normalizeJid(jid = '') {
  try {
    return jid ? jidNormalizedUser(jid) : ''
  } catch {
    return String(jid || '')
  }
}

function isWsOpen(sock) {
  const rs1 = sock?.ws?.socket?.readyState
  const rs2 = sock?.ws?.readyState
  return rs1 === 1 || rs2 === 1
}

function getDecodeJid(sock) {
  return typeof sock?.decodeJid === 'function'
    ? sock.decodeJid.bind(sock)
    : (jid) => normalizeJid(jid)
}

const router = express.Router()

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  storage: multer.memoryStorage()
})

function requireAuth(req, res, next) {
  if (req.session?.user?.id) return next()
  return res.status(401).json({ ok: false, error: 'No auth' })
}

router.use(requireAuth)

router.get('/stats', (req, res) => {
  return res.json({ ok: true, globalSubbotsOnline: computeGlobalSubbotCount() })
})

router.get('/subbot', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const summary = await getMySubbotSummary(wa)
    const id = getSubbotIdFromWaNumber(wa)
    const prefix = getCommandPrefix(id)

    let info = summary.info
    if (info?.banner) {
      const bannerPath = String(info.banner)
      if (bannerPath.endsWith('banner.jpg')) {
        info = { ...info, bannerUrl: `/api/subbot/banner?ts=${Date.now()}` }
      }
    }

    return res.json({ ok: true, ...summary, id, info, prefix })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.get('/subbot/prefix', async (req, res) => {
  const wa = req.session.user.waNumber
  const id = getSubbotIdFromWaNumber(wa)
  const prefix = getCommandPrefix(id)
  return res.json({ ok: true, prefix })
})

router.post('/subbot/prefix', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const id = getSubbotIdFromWaNumber(wa)
    const raw = String(req.body?.prefix || '').trim()

    if (!raw) {
      return res.status(400).json({ ok: false, error: 'Prefijo vacío.' })
    }

    const low = raw.toLowerCase()
    if (low === 'default' || low === 'reset') {
      setCommandPrefix('', id)
      return res.json({ ok: true, prefix: '' })
    }

    if (/\s/.test(raw)) return res.status(400).json({ ok: false, error: 'El prefijo no puede contener espacios.' })
    if (raw.length > 12) return res.status(400).json({ ok: false, error: 'Prefijo demasiado largo (máximo 12).' })

    setCommandPrefix(raw, id)
    return res.json({ ok: true, prefix: raw })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.get('/subbot/banner', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const dir = getSessionDirFor(wa)
    const p = path.join(dir, 'banner.jpg')
    if (!fs.existsSync(p)) return res.status(404).end()
    res.setHeader('Content-Type', 'image/jpeg')
    fs.createReadStream(p).pipe(res)
  } catch {
    res.status(404).end()
  }
})

router.get('/subbot/pair/status', async (req, res) => {
  const wa = req.session.user.waNumber
  return res.json({ ok: true, ...getPairingStatus({ ownerNumber: wa }) })
})

router.post('/subbot/pair/qr', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const { qr, status, id } = await getPairingQr({ ownerNumber: wa })
    if (!qr) return res.json({ ok: true, id, status, qrDataUrl: null })
    const qrDataUrl = await qrcode.toDataURL(qr, { scale: 8, margin: 1 })
    return res.json({ ok: true, id, status, qrDataUrl })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/subbot/pair/code', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const { code, codeRaw, status, id } = await getPairingCode({ ownerNumber: wa, phoneNumber: wa })
    return res.json({
      ok: true,
      id,
      status,
      code,
      codeRaw,
      note: 'No llega notificación. Ingresa el código en WhatsApp → Dispositivos vinculados → Vincular con número.'
    })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/subbot/profile/name', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const id = getSubbotIdFromWaNumber(wa)
    const sessions = global.__SUBBOT_SESSIONS__ instanceof Map ? global.__SUBBOT_SESSIONS__ : new Map()
    const sock = sessions.get(id)
    if (!sock) return res.status(400).json({ ok: false, error: 'Subbot no conectado.' })

    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre vacío.' })

    const updated = await setSubbotName(sock, name)
    return res.json({ ok: true, updated })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/subbot/profile/banner', upload.single('banner'), async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const id = getSubbotIdFromWaNumber(wa)
    const sessions = global.__SUBBOT_SESSIONS__ instanceof Map ? global.__SUBBOT_SESSIONS__ : new Map()
    const sock = sessions.get(id)
    if (!sock) return res.status(400).json({ ok: false, error: 'Subbot no conectado.' })

    const buf = req.file?.buffer
    if (!buf || !Buffer.isBuffer(buf)) return res.status(400).json({ ok: false, error: 'Imagen inválida.' })

    const updated = await setSubbotBanner(sock, buf)
    return res.json({ ok: true, updated })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.get('/subbot/groups', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const groups = await listMyGroups(wa)
    return res.json({ ok: true, groups })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/subbot/groups/toggle', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const { groupId, bot, antilink, welcome, avisos } = req.body || {}
    if (!groupId) return res.status(400).json({ ok: false, error: 'groupId requerido' })
    const out = setGroupToggles({
      waNumber: wa,
      groupId,
      bot: typeof bot === 'boolean' ? bot : undefined,
      antilink: typeof antilink === 'boolean' ? antilink : undefined,
      welcome: typeof welcome === 'boolean' ? welcome : undefined,
      avisos: typeof avisos === 'boolean' ? avisos : undefined
    })
    return res.json({ ok: true, ...out })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})


router.get('/subbot/groups/messages', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const groupId = String(req.query?.groupId || '')
    if (!groupId) return res.status(400).json({ ok: false, error: 'groupId requerido' })
    const out = getGroupMessages({ waNumber: wa, groupId })
    return res.json({ ok: true, ...out })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/subbot/groups/messages', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const { groupId, welcomeText, byeText } = req.body || {}
    if (!groupId) return res.status(400).json({ ok: false, error: 'groupId requerido' })
    const out = await setGroupMessages({
      waNumber: wa,
      groupId,
      welcomeText: typeof welcomeText === 'string' ? welcomeText : undefined,
      byeText: typeof byeText === 'string' ? byeText : undefined
    })
    return res.json({ ok: true, ...out })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})


router.post('/subbot/groups/primary', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const { groupId, key } = req.body || {}
    if (!groupId) return res.status(400).json({ ok: false, error: 'groupId requerido' })
    const out = await setGroupPrimary({ waNumber: wa, groupId, key })
    return res.json({ ok: true, ...out })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/subbot/groups/primary/clear', async (req, res) => {
  try {
    const wa = req.session.user.waNumber
    const { groupId } = req.body || {}
    if (!groupId) return res.status(400).json({ ok: false, error: 'groupId requerido' })
    const out = await clearGroupPrimary({ waNumber: wa, groupId })
    return res.json({ ok: true, ...out })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

export default router