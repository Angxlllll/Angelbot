const OWNER_JID = '50493732693@s.whatsapp.net'

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const msg = String(text || '').trim()

  if (!msg) {
    return conn.sendMessage(
      m.chat,
      { text: `「✦」Escribe tu reporte.\n> Ejemplo: *${usedPrefix}${command} el comando .play no funciona*` },
      { quoted: m }
    )
  }

  const from = m.sender || m.key?.participant || m.key?.remoteJid
  const pushname =
    m.pushName ||
    m.name ||
    (from ? String(from).split('@')[0] : 'Usuario')

  const groupId = m.chat
  const isGroup = String(groupId || '').endsWith('@g.us')

  let groupName = ''
  try {
    if (isGroup) {
      const meta = await conn.groupMetadata(groupId)
      groupName = meta?.subject || ''
    }
  } catch {}

  const reportText = [
    '「★」 *REPORTE*',
    '',
    `❀ Usuario: *${pushname}*`,
    `❀ JID: *${from}*`,
    `❀ Chat: *${isGroup ? `Grupo` : `Privado`}*`,
    isGroup ? `❀ Grupo: *${groupName}*` : '',
    isGroup ? `❀ ID Grupo: *${groupId}*` : `❀ Chat ID: *${groupId}*`,
    '',
    `✐ Mensaje:`,
    `${msg}`,
    '',
    `ⴵ Fecha: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Chicago' })}`
  ]
    .filter(Boolean)
    .join('\n')

  try {
    await conn.sendMessage(OWNER_JID, { text: reportText })
  } catch (e) {
    return conn.sendMessage(
      m.chat,
      { text: '「✦」No pude enviar el reporte al dueño. Intenta más tarde.' },
      { quoted: m }
    )
  }

  await conn.sendMessage(
    m.chat,
    { text: '「✿」Reporte enviado al creador del bot. ¡Gracias!' },
    { quoted: m }
  )
}

handler.help = ['report <texto>']
handler.tags = ['utilidades']
handler.command = ['report', 'reporte']

export default handler