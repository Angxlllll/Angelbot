import fetch from 'node-fetch'

async function handler(m, { conn }) {
  let groupJid = m.chat
  let meta = await conn.groupMetadata(groupJid)

  let inviteCode = await conn.groupInviteCode(groupJid)
  let inviteExpiration = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60

  let jpegThumbnail = null
  try {
    let ppUrl = await conn.profilePictureUrl(groupJid, 'image')
    let res = await fetch(ppUrl)
    jpegThumbnail = Buffer.from(await res.arrayBuffer())
  } catch {}

  await conn.sendMessage(m.chat, {
    groupInviteMessage: {
      groupJid,
      inviteCode,
      inviteExpiration,
      groupName: meta.subject,
      jpegThumbnail,
      caption: `👥 Miembros: ${meta.participants.length}`
    }
  }, { quoted: m })
}

handler.command = ['link']
handler.group = true
handler.botAdmin = true

export default handler