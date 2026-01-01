import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getSubbotId,
  getUser,
  formatMoney,
  economyDecor,
  safeUserTag,
  replyText
} from '../biblioteca/economia.js'

const handler = async (m, { conn }) => {
  const subbotId = getSubbotId(conn)
  const userJid = m?.sender

  await withDbLock(subbotId, async () => {
    const db = loadEconomyDb()
    const user = getUser(db, subbotId, userJid)
    const userTag = safeUserTag(conn, m)

    const now = Date.now()
    const inv = user.invest || { amount: 0, matureAt: 0, multiplier: 1 }

    if (!inv.amount || inv.amount <= 0) {
      const text = economyDecor({
        title: 'No tienes inversiones activas.',
        lines: ['> Usa *.invest <cantidad>* para empezar.'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    if (inv.matureAt > now) {
      const text = economyDecor({
        title: 'Aún no puedes cobrar tu inversión.',
        lines: ['> Revisa el tiempo en *.einfo*'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const payout = Math.max(0, Math.floor(inv.amount * Number(inv.multiplier || 1)))
    const profit = payout - inv.amount

    user.wallet += payout
    user.invest = { amount: 0, matureAt: 0, multiplier: 1 }
    user.stats.collect = (user.stats.collect || 0) + 1

    const sign = profit >= 0 ? '+' : '-'
    const text = economyDecor({
      title: `Inversión cobrada: ${sign}${formatMoney(Math.abs(profit))}`,
      lines: [`> Cobraste *${formatMoney(payout)}*.`],
      userTag
    })

    saveEconomyDb(db)
    return await replyText(conn, m, text)
  })
}

handler.command = ['collect', 'cobrar', 'cobrarinv', 'cobrarinversion']
handler.tags = ['economy']
handler.help = ['collect']

export default handler
