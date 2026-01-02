let handler = async (m, { conn, from, participants }) => {

  const tag = jid => `@${jid.split('@')[0]}`

  const ctx = m.message?.extendedTextMessage?.contextInfo
  const user =
    ctx?.mentionedJid?.[0] ||
    ctx?.participant ||
    m.mentionedJid?.[0] ||
    m.quoted?.sender

  if (!user) {
    return conn.sendMessage(from, {
      text: '☁️ *Responde o menciona al usuario*.'
    }, { quoted: m })
  }

  const p = participants.find(v => v.id === user)

  if (p?.admin) {
    return conn.sendMessage(from, {
      text: 'ℹ️ *Ese usuario ya es admin*.'
    }, { quoted: m })
  }

  await conn.groupParticipantsUpdate(from, [user], 'promote')

  await conn.sendMessage(from, {
    text: `✅ *Admin dado a:* ${tag(user)}`,
    mentions: [user]
  }, { quoted: m })
}

handler.group = true
handler.admin = true
handler.botAdmin = true
handler.command = ['promote', 'daradmin']

export default handler