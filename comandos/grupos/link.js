const handler = async (m, { conn }) => {
  const chat = m.chat

  // reacción
  await conn.sendMessage(chat, {
    react: { text: '🔗', key: m.key }
  })

  try {
    const [meta, code] = await Promise.all([
      conn.groupMetadata(chat),
      conn.groupInviteCode(chat).catch(() => null)
    ])

    if (!code) throw new Error('Sin enlace')

    const groupName = meta.subject || 'Grupo'
    const link = `https://chat.whatsapp.com/${code}`

    // obtener foto del grupo
    let img = null
    try {
      const url = await conn.profilePictureUrl(chat, 'image')
      img = await fetch(url).then(r => r.buffer())
    } catch {
      img = await fetch('https://files.catbox.moe/xr2m6u.jpg').then(r => r.buffer())
    }

    await conn.sendMessage(
      chat,
      {
        image: img,
        caption:
          `*${groupName}*\n\n` +
          `🔗 *Enlace del grupo*\n` +
          `${link}\n\n` +
          `📋 Mantén presionado para copiar`,
        contextInfo: {
          externalAdReply: {
            title: '🔗 Enlace del grupo',
            body: 'Toca o mantén presionado para copiar',
            thumbnail: img,
            sourceUrl: link,
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      },
      { quoted: m }
    )

  } catch {
    await conn.sendMessage(
      chat,
      { text: '❌ No se pudo generar el enlace del grupo.' },
      { quoted: m }
    )
  }
}

handler.command = ['link']
handler.useradm = true
handler.botadm = true

export default handler