let handler = async (m, { conn, args, participants }) => {
  try {
    if (!m.isGroup)
      return m.reply('⚠️ Este comando solo funciona en grupos.')

    const textExtra = args.join(' ').trim()
    const mentions = participants.map(p => p.id)

    let q =
      m?.quoted?.fakeObj ||
      m?.quoted ||
      m?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
      null

    if (q) {
      for (let i = 0; i < 6; i++) {
        const next =
          q?.ephemeralMessage?.message ||
          q?.viewOnceMessage?.message ||
          q?.viewOnceMessageV2?.message ||
          q?.viewOnceMessageV2Extension?.message ||
          q?.documentWithCaptionMessage?.message ||
          null
        if (!next) break
        q = next
      }

      const type = Object.keys(q)[0]

      // ===== TEXTO =====
      if (type === 'conversation' || type === 'extendedTextMessage') {
        const txt =
          q.conversation ||
          q.extendedTextMessage?.text ||
          ''

        await conn.sendMessage(
          m.chat,
          { text: txt, mentions },
          { quoted: m }
        )
      }

      // ===== MEDIA =====
      else {
        const media = q[type]

        await conn.sendMessage(
          m.chat,
          {
            [type.replace('Message', '')]: media,
            caption: media.caption || '',
            mentions
          },
          { quoted: m }
        )
      }

      if (textExtra) {
        await conn.sendMessage(
          m.chat,
          { text: textExtra, mentions },
          { quoted: m }
        )
      }

      return
    }

    // ===== SIN MENSAJE CITADO =====
    if (textExtra) {
      await conn.sendMessage(
        m.chat,
        { text: textExtra, mentions },
        { quoted: m }
      )
      return
    }

    await m.reply('❌ No hay nada para reenviar.')

  } catch (err) {
    console.error('Error en .n:', err)
    await m.reply('❌ Error:\n' + err.message)
  }
}

handler.command = ['n']
export default handler