import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getUser,
  normalizeUserJid,
  gachaDecor,
  safeUserTag,
  replyText
} from '../biblioteca/economia.js'

const handler = async (m, { conn, usedPrefix }) => {
  const userJid = normalizeUserJid(m?.sender)

  await withDbLock('global', async () => {
    const db = loadEconomyDb()
    const user = getUser(db, userJid)
    const userTag = safeUserTag(conn, m)

    user.claimMsg = ''

    saveEconomyDb(db)
    const t = gachaDecor({
      title: 'Mensaje de claim restablecido.',
      lines: [`> Puedes volver a configurarlo con *${usedPrefix || '.'}setclaimmsg*.`],
      userTag
    })
    return replyText(conn, m, t)
  })
}

handler.command = ['delclaimmsg']
handler.tags = ['gacha']
handler.help = ['delclaimmsg']

export default handler
