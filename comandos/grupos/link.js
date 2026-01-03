import fetch from 'node-fetch'

async function handler(m, { conn }) {
  let chat = m.chat
  let code = await conn.groupInviteCode(chat)
  let link = 'https://chat.whatsapp.com/' + code

  let thumb = null
  try {
    let ppUrl = await conn.profilePictureUrl(chat, 'image')
    let res = await fetch(ppUrl)
    thumb = Buffer.from(await res.arrayBuffer())
  } catch {
    thumb = null
  }

  await conn.sendMessage(chat, {
    text: link,
    contextInfo: {
      externalAdReply: {
        title: '🔗 LINK DEL GRUPO',
        body: 'Toca para unirte',
        thumbnail: thumb,
        sourceUrl: link,
        mediaType: 1,
        renderLargerThumbnail: true,
        showAdAttribution: false
      }
    }
  }, { quoted: m })
}

handler.command = ['link']
handler.group = true
handler.botAdmin = true

export default handler