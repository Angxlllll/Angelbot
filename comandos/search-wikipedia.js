import fetch from 'node-fetch'

function esc(s = '') {
  return String(s || '')
    .replace(/\*/g, '＊')
    .replace(/_/g, '＿')
    .replace(/`/g, '｀')
}

function stripHtml(s = '') {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickResults(data) {
  const arr = data?.result
  return Array.isArray(arr) ? arr : []
}

async function replyText(conn, chat, text, quoted) {
  return conn.sendMessage(chat, { text }, { quoted })
}

async function reactMsg(conn, chat, key, emoji) {
  try {
    return await conn.sendMessage(chat, { react: { text: emoji, key } })
  } catch {
    return null
  }
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const chat = m.chat || m.key?.remoteJid
  const q = (args || []).join(' ').trim()

  if (!q) {
    return replyText(
      conn,
      chat,
      `「✦」Uso » *${usedPrefix + command}* <texto>\n> ✐ Ejemplo » *${usedPrefix + command} Honduras*`,
      m
    )
  }

  try {
    await reactMsg(conn, chat, m.key, '🕒')

    const api = `https://api-adonix.ultraplus.click/search/wikipedia?apikey=${globalThis.apikey}&q=${encodeURIComponent(q)}&limit=15`
    const res = await fetch(api)
    const json = await res.json().catch(() => null)

    if (!json?.status) {
      await reactMsg(conn, chat, m.key, '✔️')
      return replyText(conn, chat, '「✦」Error consultando Wikipedia.\n> ✐ Intenta nuevamente.', m)
    }

    const items = pickResults(json)

    if (!items.length) {
      await reactMsg(conn, chat, m.key, '✔️')
      return replyText(conn, chat, `「✦」Resultados para *${esc(q)}*\n\n「✦」Sin resultados.`, m)
    }

    const limit = 10
    const list = items.slice(0, limit)

    const text =
      `「✦」Resultados de la busqueda para *${esc(q)}*\n\n` +
      list
        .map((it, idx) => {
          const title = esc(it?.title || 'Sin título')
          const desc = esc(it?.description || '—')
          const excerpt = esc(stripHtml(it?.excerpt || ''))
          const url = it?.url || ''

          const ex = excerpt ? (excerpt.length > 160 ? excerpt.slice(0, 160) + '…' : excerpt) : '—'

          return (
            `❀ *${title}*\n` +
            `> ❏ Info » *${desc}*\n` +
            `> ❍ Resumen » ${ex}\n` +
            `> 🜸 Link » _${url}_`
          )
        })
        .join('\n\n')

    await replyText(conn, chat, text, m)
    await reactMsg(conn, chat, m.key, '✔️')
  } catch (e) {
    console.error(e)
    await reactMsg(conn, chat, m.key, '✔️')
    await replyText(conn, chat, '「✦」Error buscando en Wikipedia.\n> ✐ Intenta nuevamente.', m)
  }
}

handler.command = ['wiki', 'wikipedia']
handler.help = ['wiki <texto>']
handler.tags = ['search']

export default handler
