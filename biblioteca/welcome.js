import config from '../config.js'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { isWelcomeEnabled, isBotEnabled, getWelcomeMessage, getByeMessage } from './settings.js'
import { getBotVisual } from '../subbotManager.js'

function renderTemplate(tpl, vars) {
  const safe = (v) => (v === null || v === undefined ? '' : String(v))
  return String(tpl || '')
    .replace(/\{mention\}/gi, safe(vars.mention))
    .replace(/\{username\}/gi, safe(vars.username))
    .replace(/\{group\}/gi, safe(vars.group))
    .replace(/\{desc\}/gi, safe(vars.desc))
    .replace(/\{bot\}/gi, safe(vars.bot))
}

const DEFAULT_WELCOME_TEMPLATE = `*☆ {bot} \`≧◠ᴥ◠≦\`*
❏ Nuevo integrante {mention}:

❀ *Bienvenido*:
❍ Usuario » *{username}*
❒ Grupo » *{group}*

> • ¡Bienvenido/a! Nos alegra tenerte aquí, por favor lee las reglas del grupo y mantén siempre el respeto para una buena convivencia.`

const DEFAULT_BYE_TEMPLATE = `*☆ {bot} \`≧◠ᴥ◠≦\`*
❏ Se fue {mention}:

❀ *Despedida*:
❍ Usuario » *{username}*
❒ Grupo » *{group}*

> • Gracias por haber estado con nosotros, te deseamos lo mejor y que te vaya excelente en tu camino.`

export default function groupWelcome(sock) {
  const subbotId = sock?.isSubBot ? String(sock?.subbotId || '').trim() : ''
  const normalizeJid = (jid = '') => (jid ? jidNormalizedUser(jid) : '')

  const decodeJid =
    typeof sock.decodeJid === 'function'
      ? sock.decodeJid.bind(sock)
      : (jid) => normalizeJid(jid)

  const ensureJid = (v = '') => {
    const s = String(v || '')
    if (!s) return ''
    if (/@(s\.whatsapp\.net|lid|g\.us)$/i.test(s)) return normalizeJid(s)
    if (/^\d+$/.test(s)) return normalizeJid(s + '@s.whatsapp.net')
    return normalizeJid(s)
  }

  const getPNForLID = async (lidJid = '') => {
    const lid = normalizeJid(lidJid)
    const repo = sock?.signalRepository?.lidMapping
    if (!lid || !/@lid$/i.test(lid)) return ''
    if (!repo || typeof repo.getPNForLID !== 'function') return ''
    try {
      const pn = await repo.getPNForLID(lid)
      const pnJid = ensureJid(pn)
      if (pnJid && /@s\.whatsapp\.net$/i.test(pnJid)) return pnJid
    } catch {}
    return ''
  }

  const resolveUserId = async (raw = '', metadata = null) => {
    const r = normalizeJid(raw)
    if (!r) return ''

    const d = decodeJid(r)
    if (d) {
      if (/@lid$/i.test(d)) return (await getPNForLID(d)) || d
      return d
    }

    if (/@lid$/i.test(r)) {
      const pn = await getPNForLID(r)
      if (pn) return pn

      const parts = metadata?.participants || []
      for (const p of parts) {
        const jid = normalizeJid(p?.jid || p?.id || p?.participant || '')
        const lid = normalizeJid(p?.lid || p?.lId || '')
        const phone = ensureJid(p?.phoneNumber || p?.pn || '')
        if (lid === r || jid === r) {
          if (phone && /@s\.whatsapp\.net$/i.test(phone)) return phone
          if (jid && /@s\.whatsapp\.net$/i.test(jid)) return jid
          return lid || r
        }
      }

      return r
    }

    return r
  }

  const buildUsername = (userId = '') => `@${String(userId).split('@')[0]}`

  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update
    if (!id || !participants?.length) return

    // Respeta banchat
    if (!isBotEnabled(id, subbotId)) return

    const metadata = await sock.groupMetadata(id).catch(() => null)
    if (!metadata) return

    const groupName = metadata.subject || 'Grupo'
    const visual = getBotVisual(sock)
    const botName = visual?.name || config.nombrebot || 'Bot'
    const botNum =
      (visual?.jid ? String(visual.jid).split('@')[0] : '') ||
      (visual?.number ? String(visual.number).replace(/\D/g, '') : '') ||
      (sock?.user?.id ? String(sock.user.id).split(':')[0].replace(/\D/g, '') : '') ||
      ''

    const botLine = botNum ? `❍ Bot » *+${botNum}*\n` : ''

    const welcomeActive = isWelcomeEnabled(id, subbotId)
    const isBye = action === 'remove' || action === 'leave' || action === 'kick'

    for (const p of participants) {
      const userId = await resolveUserId(p, metadata)
      if (!userId) continue

      const username = buildUsername(userId)

      let ppUrl = null
      try {
        ppUrl = await sock.profilePictureUrl(userId, 'image')
      } catch {
        ppUrl = null
      }

      const fallback = 'https://files.catbox.moe/0gog3y'
      const thumbSource = ppUrl || fallback

      let thumbnailBuffer = null
      try {
        const r = await fetch(thumbSource)
        const b = await r.arrayBuffer()
        thumbnailBuffer = Buffer.from(b)
      } catch {
        thumbnailBuffer = null
      }

      let text = ''

      const mention = `@${String(userId).split('@')[0]}`
      const vars = {
        mention,
        username,
        group: groupName,
        desc: metadata?.desc || metadata?.subjectOwner || '',
        bot: botName
      }

      if (!isBye && action === 'add' && welcomeActive) {
        const custom = getWelcomeMessage(id, subbotId)
        const tpl = custom && custom.trim() ? custom : DEFAULT_WELCOME_TEMPLATE
        text = renderTemplate(tpl, vars)
      } else if (isBye && action === 'remove' && welcomeActive) {
        const custom = getByeMessage(id, subbotId)
        const tpl = custom && custom.trim() ? custom : DEFAULT_BYE_TEMPLATE
        text = renderTemplate(tpl, vars)
      }

      if (!text) continue

      await sock.sendMessage(id, {
        text,
        contextInfo: {
          mentionedJid: [userId],
          externalAdReply: {
            title: isBye ? '❏⏤͟͟͞͞ 𝖣𝖤𝖲𝖯𝖤𝖣𝖨𝖣𝖠 D:⏤͟͟͞͞☆' : '❏⏤͟͟͞͞ 𝖶𝖤𝖫𝖢𝖮𝖬𝖤 :𝖣⏤͟͟͞͞☆',
            body: 'Invitación al grupo oficial',
            thumbnail: thumbnailBuffer,
            thumbnailUrl: 'https://chat.whatsapp.com/FI1v7MbMr2rJ1bdgZ8rvrJ',
            sourceUrl: 'https://chat.whatsapp.com/FI1v7MbMr2rJ1bdgZ8rvrJ',
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      })
    }
  })
}