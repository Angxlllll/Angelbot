// ===============================
// Util: extraer mensaje citado (TODO tipo)
// ===============================
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

// ===============================
// Util: reenviar CUALQUIER mensaje
// ===============================
async function forwardAnyMessage(conn, chat, quoted) {
  return conn.relayMessage(
    chat,
    quoted,
    {
      messageId:
        quoted?.key?.id ||
        quoted?.message?.key?.id ||
        undefined
    }
  )
}

// ===============================
// Comando .n
// ===============================
let handler = async (m, { conn, args }) => {
  try {
    if (!m.isGroup)
      return m.reply('⚠️ Este comando solo funciona en grupos.')

    const text = args.join(' ').trim()

    const meta = await conn.groupMetadata(m.chat)

    const botId =
      conn.user?.id ||
      conn.user?.jid ||
      conn.user?.lid

    const mentions = meta.participants
      .map(p => p.id || p.jid)
      .filter(jid => jid && jid !== botId)

    const quoted = extractQuotedMessage(m)

    // 📣 aviso
    await conn.sendMessage(
      m.chat,
      {
        text: '📣 *Notificación:* mensaje reenviado',
        mentions
      },
      { quoted: m }
    )

    // 🔁 reenviar TODO
    if (quoted) {
      await forwardAnyMessage(conn, m.chat, quoted)

      if (text) {
        await conn.sendMessage(
          m.chat,
          { text },
          { quoted: m }
        )
      }
      return
    }

    // 📝 solo texto
    if (text) {
      await conn.sendMessage(
        m.chat,
        { text },
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