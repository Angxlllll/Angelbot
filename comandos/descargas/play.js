import yts from "yt-search"

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const query = args.join(" ").trim()
  if (!query) {
    return conn.sendMessage(
      m.chat,
      { text: `✳️ Usa:\n${usedPrefix}${command} <texto>` },
      { quoted: m }
    )
  }

  await conn.sendMessage(m.chat, {
    react: { text: "🕒", key: m.key }
  })

  const search = await yts(query)
  const video = search.videos?.[0]
  if (!video) {
    return conn.sendMessage(
      m.chat,
      { text: "❌ No se encontraron resultados" },
      { quoted: m }
    )
  }

  const caption =
    `🎬 *${video.title}*\n` +
    `👤 ${video.author?.name || "—"}\n` +
    `⏱ ${video.timestamp || "--:--"}`

  const audioCmd = `${usedPrefix}ytmp3 ${video.url}`
  const videoCmd = `${usedPrefix}ytmp4 ${video.url}`

  await conn.sendMessage(
    m.chat,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "🎵 Reproductor",
              subtitle: "Selecciona formato",
              hasMediaAttachment: true,
              imageMessage: {
                url: video.thumbnail
              }
            },
            body: { text: caption },
            footer: { text: "© Bot" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "🎧 Audio",
                    id: audioCmd
                  })
                },
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "🎬 Video",
                    id: videoCmd
                  })
                }
              ]
            }
          }
        }
      }
    },
    { quoted: m }
  )
}

handler.command = ["play"]
handler.tags = ["descargas"]
handler.help = ["play <texto>"]

export default handler