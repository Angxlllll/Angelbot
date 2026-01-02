let handler = async (m, { conn, args, participants }) => {
  try {
    if (!m.isGroup)
      return m.reply('⚠️ Este comando solo funciona en grupos.')

    const text = args.join(' ').trim()

    // ===== EXTRAER MENSAJE CITADO =====
    let msg =
      m?.quoted?.fakeObj ||
      m?.quoted ||
      m?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
      null

    if (msg) {
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

      const key = Object.keys(msg || {})[0]
      if (!key) return m.reply('❌ No se pudo recrear el mensaje.')

      const mentions = participants.map(p => p.id)

      // Inyectar menciones en el MISMO mensaje
      msg[key].contextInfo = {
        ...(msg[key].contextInfo || {}),
        mentions
      }

      // Enviar mensaje recreado (rápido, sin "reenviado")
      await conn.sendMessage(
        m.chat,
        msg,
        { quoted: m }
      )

      // Texto adicional opcional
      if (text) {
        await conn.sendMessage(
          m.chat,
          { text, mentions },
          { quoted: m }
        )
      }

      return
    }

    // ===== SI NO HAY MENSAJE CITADO =====
    if (text) {
      await conn.sendMessage(
        m.chat,
        {
          text,
          mentions: participants.map(p => p.id)
        },
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