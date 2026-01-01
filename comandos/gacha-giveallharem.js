import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getUser,
  getNameSafe,
  normalizeUserJid,
  gachaDecor,
  resolveUserJid,
  replyText
} from '../biblioteca/economia.js'

function extractMention(conn, m) {
  const mentioned =
    m?.mentionedJid ||
    m?.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    []
  if (Array.isArray(mentioned) && mentioned.length) return mentioned[0]

  const q =
    m?.quoted?.sender ||
    m?.quoted?.participant ||
    m?.msg?.contextInfo?.participant ||
    m?.message?.extendedTextMessage?.contextInfo?.participant ||
    null
  if (q) return q

  const text =
    m?.text ||
    m?.body ||
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    ''
  const parsed = conn?.parseMention ? conn.parseMention(String(text)) : []
  if (Array.isArray(parsed) && parsed.length) return parsed[0]

  return ''
}

const handler = async (m, { conn, usedPrefix }) => {
  const fromJid = normalizeUserJid(m?.sender)
  let toRaw = extractMention(conn, m)

  toRaw = await resolveUserJid(conn, toRaw)
  const toJid = normalizeUserJid(toRaw)

  await withDbLock('global', async () => {
    const db = loadEconomyDb()
    const fromUser = getUser(db, fromJid)
    const toUser = toJid ? getUser(db, toJid) : null

    if (!toJid || !toUser || toJid === fromJid) {
      const t = gachaDecor({
        title: 'Debes mencionar a un usuario válido.',
        lines: [`> Ej: *${usedPrefix || '.'}giveallharem @usuario*`]
      })
      saveEconomyDb(db)
      return replyText(conn, m, t)
    }

    const inv = Array.isArray(fromUser.waifus) ? [...fromUser.waifus] : []
    if (!inv.length) {
      const t = gachaDecor({
        title: 'Tu harem está vacío.',
        lines: [`> No tienes personajes para regalar.`]
      })
      saveEconomyDb(db)
      return replyText(conn, m, t)
    }


    for (const id of inv) {
      
      if (db.market?.[id]) delete db.market[id]
      
      db.waifus = db.waifus || {}
      db.waifus[id] = db.waifus[id] || {}
      db.waifus[id].owner = toJid
      db.waifus[id].claimedAt = db.waifus[id].claimedAt || Date.now()

      if (!toUser.waifus.includes(id)) toUser.waifus.push(id)
    }

    fromUser.waifus = []
    if (fromUser.favWaifu) fromUser.favWaifu = ''

    saveEconomyDb(db)
    const toNameRaw = await getNameSafe(conn, toJid)
    const toName = String(toNameRaw || '').replace(/\s+/g, ' ').trim() || (toJid ? `+${toJid.split('@')[0]}` : 'usuario')

    const t = gachaDecor({
      title: 'Harem transferido.',
      lines: [
        `> Regalaste *${inv.length}* personaje(s) a ${toName}.`,
        `> Consejo: el mercado se limpia automáticamente en la transferencia.`
      ]
    })
    return replyText(conn, m, t, { mentions: [toJid] })
  })
}

handler.command = ['giveallharem']
handler.tags = ['gacha']
handler.help = ['giveallharem @usuario']

export default handler
