import fetch from 'node-fetch'
import { generateWAMessageFromContent } from '@whiskeysockets/baileys'

async function handler(m, { conn }) {
  let chat = m.chat
  let meta = await conn.groupMetadata(chat)

  let inviteCode = await conn.groupInviteCode(chat)
  let inviteExpiration = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60

  let jpegThumbnail = null
  try {
    let url = await conn.profilePictureUrl(chat, 'image')
    let res = await fetch(url)
    jpegThumbnail = Buffer.from(await res.arrayBuffer())
  } catch {}

  const msg = generateWAMessageFromContent(chat, {
    groupInviteMessage: {
      groupJid: chat,
      inviteCode,
      inviteExpiration,
      groupName: meta.subject,
      jpegThumbnail,
      caption: `👥 Miembros: ${meta.participants.length}`
    }
  }, {
    quoted: m
  })

  await conn.relayMessage(chat, msg.message, { messageId: msg.key.id })
}

handler.command = ['link']
handler.group = true
handler.botAdmin = true

export default handler