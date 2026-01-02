import {
  generateWAMessageFromContent,
  downloadContentFromMessage
} from '@whiskeysockets/baileys'
import fetch from 'node-fetch'

let thumb = null
fetch('https://files.catbox.moe/tx6prq.jpg')
  .then(r => r.arrayBuffer())
  .then(b => (thumb = Buffer.from(b)))
  .catch(() => null)

function extractQuotedMessage(m) {
  let q =
    m?.quoted?.fakeObj ||
    m?.quoted ||
    m?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    null

  if (!q) return null

  let msg = q
  for (let i = 0; i < 6; i++) {
    const next =
      msg?.ephemeralMessage?.message ||
      msg?.viewOnceMessage?.message ||
      msg?.viewOnceMessageV2?.message ||
      msg?.viewOnceMessageV2Extension?.message ||
      msg?.documentWithCaptionMessage?.message ||
      null
    if (!next) break
    msg = next
  }
  return msg
}

async function downloadMedia(msgContent, type) {
  const stream = await downloadContentFromMessage(msgContent, type)
  let buffer = Buffer.alloc(0)
  for await (const c of stream) buffer = Buffer.concat([buffer, c])
  return buffer
}

const handler = async (m, { conn, args, participants }) => {
  if (!m.isGroup || m.key.fromMe) return

  const users = participants.map(p => p.id)
  const textExtra = args.join(' ').trim()

  const fkontak = {
    key: { remoteJid: m.chat, fromMe: false, id: 'Angel' },
    message: {
      locationMessage: {
        name: '𝖧𝗈𝗅𝖺, 𝖲𝗈𝗒 𝖠𝗇𝗀𝖾𝗅 𝖡𝗈𝗍',
        jpegThumbnail: thumb
      }
    },
    participant: '0@s.whatsapp.net'
  }

  await conn.sendMessage(m.chat, {
    react: { text: '🗣️', key: m.key }
  })

  let q = extractQuotedMessage(m)

  const caption =
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    ''

  const isCaptionCmd = /^\.n(\s|$)/i.test(caption)
  const cleanCaption = caption.replace(/^\.n\s*/i, '').trim()

  if (!q && isCaptionCmd) q = m.message

  if (!q && !textExtra) return

  if (q) {
    const mtype = Object.keys(q)[0]
    const isMedia = [
      'imageMessage',
      'videoMessage',
      'audioMessage',
      'stickerMessage'
    ].includes(mtype)

    if (isMedia) {
      const mediaType = mtype.replace('Message', '')
      const buffer = await downloadMedia(q[mtype], mediaType)

      const msg = { mentions: users }

      if (mtype === 'imageMessage') {
        msg.image = buffer
        msg.caption = cleanCaption || textExtra || q.imageMessage?.caption || ''
      }

      if (mtype === 'videoMessage') {
        msg.video = buffer
        msg.mimetype = 'video/mp4'
        msg.caption = cleanCaption || textExtra || q.videoMessage?.caption || ''
      }

      if (mtype === 'audioMessage') {
        msg.audio = buffer
        msg.mimetype = 'audio/mpeg'
        msg.ptt = false
      }

      if (mtype === 'stickerMessage') {
        msg.sticker = buffer
      }

      return conn.sendMessage(m.chat, msg, { quoted: fkontak })
    }

    const text =
      cleanCaption ||
      textExtra ||
      q.conversation ||
      q.extendedTextMessage?.text ||
      ''

    const newMsg = conn.cMod(
      m.chat,
      generateWAMessageFromContent(
        m.chat,
        { extendedTextMessage: { text } },
        { quoted: fkontak, userJid: conn.user.id }
      ),
      text,
      conn.user.jid,
      { mentions: users }
    )

    return conn.relayMessage(
      m.chat,
      newMsg.message,
      { messageId: newMsg.key.id }
    )
  }

  return conn.sendMessage(
    m.chat,
    { text: textExtra, mentions: users },
    { quoted: fkontak }
  )
}

handler.command = ['n']
handler.group = true
handler.admin = true

export default handler