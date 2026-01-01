import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getUser,
  normalizeUserJid,
  resolveUserJid,
  getNameSafe,
  economyDecor,
  replyText
} from '../biblioteca/economia.js'

const MONTHS_ES = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
}

function birthIsoFromLegacy(birthText = '') {
  const t = String(birthText || '').trim().toLowerCase()
  
  const m = t.match(/^(\d{1,2})\s+de\s+([a-zñáéíóú]+)\s+de\s+(\d{4})$/i)
  if (!m) return null
  const d = Number(m[1])
  const mo = MONTHS_ES[m[2]]
  const y = Number(m[3])
  if (!d || !mo || !y) return null
  const iso = `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { iso, year: y }
}

function nextOccurDate(isoMMDD = '') {
  const [mm, dd] = String(isoMMDD || '').split('-').map((x) => Number(x))
  if (!mm || !dd) return null
  const now = new Date()
  const y = now.getFullYear()
  const thisYear = new Date(y, mm - 1, dd, 12, 0, 0)
  if (Number.isNaN(thisYear.getTime())) return null
  if (thisYear.getTime() >= now.getTime()) return thisYear
  const next = new Date(y + 1, mm - 1, dd, 12, 0, 0)
  return Number.isNaN(next.getTime()) ? null : next
}

function daysUntil(d) {
  const now = new Date()
  const ms = d.getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86400000))
}

const handler = async (m, { conn, isGroup, groupMetadata, command, usedPrefix }) => {
  if (!isGroup) {
    return replyText(
      conn,
      m,
      economyDecor({
        title: 'Este comando es para grupos',
        lines: ['> Úsalo dentro de un grupo para ver los cumpleaños de los miembros.']
      })
    )
  }

  const participants = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : []
  const groupJids = new Set(
    participants
      .map((p) => p?.id || p?.jid)
      .filter(Boolean)
      .map((jid) => String(jid))
  )

  await withDbLock('global', async () => {
    const db = loadEconomyDb()

    const members = []
    for (const jid of groupJids) {
      const rJid = await resolveUserJid(conn, jid)
      const u = getUser(db, normalizeUserJid(rJid))

      if (!u.birthISO && u.birth) {
        const legacy = birthIsoFromLegacy(u.birth)
        if (legacy) {
          u.birthISO = legacy.iso
          if (!u.birthYear) u.birthYear = legacy.year
        }
      }

      const iso = String(u.birthISO || '').trim()
      if (!iso) continue
      const next = nextOccurDate(iso)
      if (!next) continue

      members.push({
        jid: normalizeUserJid(rJid),
        iso,
        birthText: String(u.birth || '').trim(),
        next,
        inDays: daysUntil(next)
      })
    }

    if (!members.length) {
      saveEconomyDb(db)
      return replyText(
        conn,
        m,
        economyDecor({
          title: 'No hay cumpleaños registrados',
          lines: [
            `> Los miembros pueden registrar el suyo con: *${usedPrefix || '.'}setbirth 01/01/2000*`,
            `> Y ver su perfil con: *${usedPrefix || '.'}perfil*`
          ]
        })
      )
    }

    const isAll = /^all/i.test(command)
    members.sort((a, b) => a.inDays - b.inDays)

    const slice = isAll ? members : members.slice(0, 15)
    const lines = []
    for (const item of slice) {
      const name = await getNameSafe(conn, item.jid)
      const when = item.inDays === 0 ? 'hoy' : item.inDays === 1 ? 'mañana' : `en ${item.inDays} días`
      const shown = item.birthText ? item.birthText : item.iso
      lines.push(`✐ ${name} » *${shown}*`) 
      lines.push(`ⴵ Próximo » *${when}*`)
      lines.push('')
    }

    const title = isAll ? 'Todos los cumpleaños' : 'Cumpleaños cercanos'
    const text = economyDecor({
      title,
      lines: lines.filter((x) => x !== undefined)
    })

    saveEconomyDb(db)
    return replyText(conn, m, text)
  })
}

handler.command = ['birthdays', 'cumpleaños', 'births', 'allbirthdays', 'allbirths']
handler.tags = ['perfil']
handler.help = ['birthdays', 'allbirthdays']

export default handler
