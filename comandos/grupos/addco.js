import fs from 'fs'
import path from 'path'

const jsonPath = path.resolve('./comandos.json')

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

export async function handler(m, { conn, args }) {
  const q = extractQuotedMessage(m)

  if (!q || !q.stickerMessage) {
    return conn.sendMessage(
      m.chat,
      { text: '❌ Responde a un *sticker* para asignarle un comando.' },
      { quoted: m }
    )
  }

  const text = args.join(' ').trim()
  if (!text) {
    return conn.sendMessage(
      m.chat,
      { text: '❌ Debes indicar el comando.\nEjemplo: .addco kick' },
      { quoted: m }
    )
  }

  if (!fs.existsSync(jsonPath)) fs.writeFileSync(jsonPath, '{}')
  const map = JSON.parse(fs.readFileSync(jsonPath, 'utf-8') || '{}')

  const st = q.stickerMessage
  const rawSha = st.fileSha256 || st.fileSha256Hash || st.filehash

  if (!rawSha) {
    return conn.sendMessage(
      m.chat,
      { text: '❌ No se pudo obtener el hash del sticker.' },
      { quoted: m }
    )
  }

  const hash = Buffer.isBuffer(rawSha)
    ? rawSha.toString('base64')
    : Buffer.from(rawSha).toString('base64')

  map[m.chat] ||= {}
  map[m.chat][hash] = text.startsWith('.') ? text : '.' + text

  fs.writeFileSync(jsonPath, JSON.stringify(map, null, 2))

  await conn.sendMessage(m.chat, {
    react: { text: '✅', key: m.key }
  })

  return conn.sendMessage(
    m.chat,
    {
      text: `✅ Sticker vinculado al comando:\n${map[m.chat][hash]}\n📌 Solo funciona en este grupo.`
    },
    { quoted: m }
  )
}

handler.command = ['addco']
handler.admin = true
handler.group = true

export default handler