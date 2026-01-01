import fs from 'fs'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import os from 'os'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

function execFileP(cmd, args = []) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      resolve({ stdout, stderr })
    })
  })
}

async function reply(conn, jid, text, quoted) {
  return conn.sendMessage(jid, { text }, { quoted })
}

function getQuotedMessageObj(m) {
  return (
    m?.quoted?.message ||
    m?.quoted?.msg ||
    m?.msg?.contextInfo?.quotedMessage ||
    m?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    null
  )
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const handler = async (m, { conn }) => {
  const from = m.chat || m.key?.remoteJid

  const qObj = getQuotedMessageObj(m)
  const stickerMsg = qObj?.stickerMessage

  if (!stickerMsg) {
    return reply(conn, from, '「✦」Responde a *un sticker* con *.toimg*.', m)
  }

  let webp
  try {
    const stream = await downloadContentFromMessage(stickerMsg, 'sticker')
    webp = await streamToBuffer(stream)
  } catch {
    webp = null
  }

  if (!webp || !Buffer.isBuffer(webp) || !webp.length) {
    return reply(conn, from, '「✦」No pude descargar el sticker.', m)
  }

  const stamp = Date.now()
  const dir = os.tmpdir()
  const inPath = join(dir, `toimg-${stamp}.webp`)
  const outPath = join(dir, `toimg-${stamp}.png`)

  try {
    writeFileSync(inPath, webp)

    await execFileP('ffmpeg', ['-y', '-i', inPath, outPath])

    const img = await fs.promises.readFile(outPath)
    await conn.sendMessage(from, { image: img, caption: '「✿」Aqui tienes tu *sticker* en imagen.' }, { quoted: m })
  } catch {
    return reply(
      conn,
      from,
      '「✦」No pude convertir el sticker a imagen. Asegúrate de tener *ffmpeg* instalado.',
      m
    )
  } finally {
    try { unlinkSync(inPath) } catch {}
    try { unlinkSync(outPath) } catch {}
  }
}

handler.help = ['toimg']
handler.tags = ['utilidades']
handler.command = ['toimg']

export default handler