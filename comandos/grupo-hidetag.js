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

let handler = async (m, { conn, args, participants }) => {
  try {
    if (!m.isGroup)
      return m.reply('⚠️ Este comando solo funciona en grupos.')

    const text = args.join(' ').trim()
    const quoted = extractQuotedMessage(m)

    const botId = conn.user?.id || conn.user?.jid
    const mentions = participants
      .map(p => p.id || p.jid)
      .filter(jid => jid && jid !== botId)

    if (quoted) {
      await forwardAnyMessage(conn, m.chat, quoted)

      await conn.sendMessage(
        m.chat,
        { text: text || ' ', mentions },
        { quoted: m }
      )
      return
    }

    if (text) {
      await conn.sendMessage(
        m.chat,
        { text, mentions },
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