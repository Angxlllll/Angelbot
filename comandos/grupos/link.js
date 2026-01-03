async function handler(m, { conn }) {
  let code = await conn.groupInviteCode(m.chat)
  let link = 'https://chat.whatsapp.com/' + code

  await conn.sendMessage(
    m.chat,
    { text: link, detectLink: true },
    { quoted: m }
  )
}

handler.command = ['link']
handler.group = true
handler.botAdmin = true

export default handler