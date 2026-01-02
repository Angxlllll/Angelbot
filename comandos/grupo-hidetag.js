import { generateWAMessageFromContent, downloadContentFromMessage } from '@whiskeysockets/baileys'
import fetch from 'node-fetch'

let thumb = null
fetch('https://files.catbox.moe/tx6prq.jpg')
  .then(r => r.arrayBuffer())
  .then(b => thumb = Buffer.from(b))
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
  try {
    const stream = await downloadContentFromMessage(msgContent, type)
    let buffer = Buffer.alloc(0)
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
    return buffer
  } catch {
    return null
  }
}

const handler = async (m, { conn, args, participants }) => {
  try {
    if (!m.isGroup || m.key.fromMe) return

    const users = [...new Set(participants.map(p => p.id))]
    const textExtra = args.join(' ').trim()

    const fkontak = {
      key: {
        remoteJid: m.chat,
        fromMe: false,
        id: 'Angel'
      },
      message: {
        locationMessage: {
          name: '𝖧𝗈𝗅𝖺, 𝖲𝗈𝗒 𝖠𝗇𝗀𝖾𝗅 𝖡𝗈𝗍',
          jpegThumbnail: thumb
        }
      },
      participant: '0@s.whatsapp.net'
    }

    await conn.sendMessage(m.chat, { react: { text: '🗣️', key: m.key } })

    const q = extractQuotedMessage(m)
    if (!q && !textExtra) {
      return m.reply('❌ No hay nada para reenviar.')
    }

    if (q) {
      const mtype = Object.keys(q)[0]

      const isMedia = [
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'stickerMessage'
      ].includes(mtype)

      if (isMedia) {
        let buffer = null
        const mediaType = mtype.replace('Message', '')

        if (q[mtype]) {
          buffer = await downloadMedia(q[mtype], mediaType)
        }

        const msg = { mentions: users }

        if (mtype === 'audioMessage') {
          msg.audio = buffer
          msg.mimetype = 'audio/mpeg'
          msg.ptt = false

          await conn.sendMessage(m.chat, msg, { quoted: fkontak })
        }

        if (mtype === 'imageMessage') {
          msg.image = buffer
          msg.caption = textExtra || q.imageMessage?.caption || ''
          await conn.sendMessage(m.chat, msg, { quoted: fkontak })
        }

        if (mtype === 'videoMessage') {
          msg.video = buffer
          msg.caption = textExtra || q.videoMessage?.caption || ''
          msg.mimetype = 'video/mp4'
          await conn.sendMessage(m.chat, msg, { quoted: fkontak })
        }

        if (mtype === 'stickerMessage') {
          msg.sticker = buffer
          await conn.sendMessage(m.chat, msg, { quoted: fkontak })
        }

        return
      }

      const text =
        q.conversation ||
        q.extendedTextMessage?.text ||
        textExtra ||
        ''

      const newMsg = conn.cMod(
        m.chat,
        generateWAMessageFromContent(
          m.chat,
          {
            extendedTextMessage: {
              text
            }
          },
          { quoted: fkontak, userJid: conn.user.id }
        ),
        text,
        conn.user.jid,
        { mentions: users }
      )

      return await conn.relayMessage(
        m.chat,
        newMsg.message,
        { messageId: newMsg.key.id }
      )
    }

    return await conn.sendMessage(
      m.chat,
      { text: textExtra, mentions: users },
      { quoted: fkontak }
    )

  } catch (err) {
    console.error('Error en .n:', err)
    await conn.sendMessage(
      m.chat,
      { text: '🔊 Notificación', mentions: participants.map(p => p.id) }
    )
  }
}

handler.help = ['n']
handler.tags = ['grupos']
handler.command = ['n']
handler.group = true
handler.admin = true

export default handler