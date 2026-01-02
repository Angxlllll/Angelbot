let handler = async (m, { conn }) => {

  const target =
    m.mentionedJid?.[0] ||
    m.quoted?.sender

  if (!target) {
    return conn.sendMessage(m.chat, {
      text: '*🗡️ 𝙼𝚎𝚗𝚌𝚒𝚘𝚗𝚊 𝚘 𝚛𝚎𝚜𝚙𝚘𝚗𝚍𝚎 𝚊𝚕 𝚞𝚜𝚞𝚊𝚛𝚒𝚘 𝚚𝚞𝚎 𝚍𝚎𝚜𝚎𝚊𝚜 𝚎𝚕𝚒𝚖𝚒𝚗𝚊𝚛*'
    }, { quoted: m })
  }

  await conn.groupParticipantsUpdate(m.chat, [target], 'remove')

  await conn.sendMessage(m.chat, {
    text: '*🗡️ 𝚄𝚂𝚄𝙰𝚁𝙸𝙾 𝙴𝙻𝙸𝙼𝙸𝙽𝙰𝙳𝙾*'
  }, { quoted: m })
}

handler.customPrefix = /^\.?kick/i
handler.command = new RegExp()
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler