import fs from "fs"
import path from "path"
import axios from "axios"

const stickerPath = path.join(process.cwd(), "media", "grupo.webp")

async function ensureSticker() {
  if (!fs.existsSync(stickerPath)) {
    let { data } = await axios.get(
      "https://cdn.russellxz.click/9b99dd72.webp",
      { responseType: "arraybuffer" }
    )
    fs.mkdirSync(path.dirname(stickerPath), { recursive: true })
    fs.writeFileSync(stickerPath, Buffer.from(data))
  }
}

let handler = async (m, { conn, from, command, args }) => {
  await ensureSticker()

  let cmd = command.toLowerCase()
  let sub = args[0]?.toLowerCase()

  let abrir =
    cmd === "abrir" ||
    cmd === "open" ||
    (cmd === "grupo" && /(abrir|open)/.test(sub))

  let cerrar =
    cmd === "cerrar" ||
    cmd === "close" ||
    (cmd === "grupo" && /(cerrar|close)/.test(sub))

  if (!abrir && !cerrar) return

  await conn.groupSettingUpdate(
    from,
    abrir ? "not_announcement" : "announcement"
  )

  await conn.sendMessage(
    from,
    { sticker: fs.readFileSync(stickerPath) },
    { quoted: m }
  )

  await conn.sendMessage(from, {
    react: { text: "✅", key: m.key }
  })
}

handler.command = ["grupo", "abrir", "cerrar", "open", "close"]
handler.admin = true
handler.botAdmin = true
export default handler