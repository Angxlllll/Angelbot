import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getUser,
  setMarketEntry,
  gachaDecor,
  safeUserTag,
  parseAmount,
  replyText
} from '../biblioteca/economia.js'

import { getWaifuById, rarityMeta } from '../biblioteca/waifuCatalog.js'

const handler = async (m, { conn, args }) => {
  const userJid = m?.sender
  const waifuId = String(args?.[0] || '').trim()
  const price = parseAmount(args?.[1], 0)

  await withDbLock('global', async () => {
    const db = loadEconomyDb()
    const user = getUser(db, userJid)
    const userTag = safeUserTag(conn, m)

    if (!waifuId || !price || price <= 0) {
      const text = gachaDecor({
        title: 'Uso: venderwaifu <id> <precio>',
        lines: [`> Ej: *${m.usedPrefix || '.'}venderwaifu w010 50000*`],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    if (!Array.isArray(user.waifus) || !user.waifus.includes(waifuId)) {
      const text = gachaDecor({
        title: 'No tienes esa waifu.',
        lines: [`> Revisa tu inventario con *${m.usedPrefix || '.'}waifus*.`],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    if (db.market?.[waifuId]) {
      const text = gachaDecor({
        title: 'Esa waifu ya está en el mercado.',
        lines: [`> Usa *${m.usedPrefix || '.'}market* para verla.`],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const w = getWaifuById(waifuId)
    if (!w) {
      const text = gachaDecor({
        title: 'ID inválida.',
        lines: [`> Revisa tu inventario con *${m.usedPrefix || '.'}waifus*.`],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    setMarketEntry(db, waifuId, { price, seller: userJid, listedAt: Date.now() })

    const meta = rarityMeta(w.rarity)
    const pretty = price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

    const text = gachaDecor({
      title: 'Waifu puesta en venta',
      lines: [
        `> *${w.name}* (✰ ${meta.name} • ${w.rarity})`,
        `> ❏ ID » *${waifuId}*`,
        `> 🛒 Precio » *¥${pretty}*`,
        '',
        `✐ Ver mercado: *${m.usedPrefix || '.'}market*`,
        `✐ Quitar del mercado: *${m.usedPrefix || '.'}cancelarventa ${waifuId}*`
      ],
      userTag
    })

    saveEconomyDb(db)
    await replyText(conn, m, text)
  })
}

handler.command = ['sell', 'vender', 'venderwaifu', 'sellwaifu']
handler.tags = ['gacha']
handler.help = ['venderwaifu <id> <precio>']

export default handler
