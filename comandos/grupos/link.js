import { generateWAMessageFromContent } from '@whiskeysockets/baileys'

const handler = async (m, { conn }) => {
  const chat = m.chat

  // reacción
  await conn.sendMessage(chat, {
    react: { text: "🔗", key: m.key }
  })

  try {
    const safeFetch = async (url, timeout = 5000) => {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), timeout)
      try {
        const res = await fetch(url, { signal: controller.signal })
        return res.ok ? Buffer.from(await res.arrayBuffer()) : null
      } catch {
        return null
      } finally {
        clearTimeout(id)
      }
    }

    const [meta, code] = await Promise.all([
      conn.groupMetadata(chat),
      conn.groupInviteCode(chat).catch(() => null)
    ])

    const groupName = meta.subject || "Grupo"
    const link = code
      ? `https://chat.whatsapp.com/${code}`
      : null

    const fallback = "https://files.catbox.moe/xr2m6u.jpg"
    let ppBuffer = null

    try {
      const url = await conn.profilePictureUrl(chat, "image").catch(() => null)
      if (url && url !== "not-authorized" && url !== "not-exist") {
        ppBuffer = await safeFetch(url, 6000)
      }
    } catch {}

    if (!ppBuffer) {
      ppBuffer = await safeFetch(fallback)
    }

    // mensaje interactivo con copiar link
    const msg = generateWAMessageFromContent(
      chat,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: {
                text: `*${groupName}*\n\n${link || 'Sin enlace disponible'}`
              },
              footer: { text: 'Toca para copiar el enlace' },
              header: {
                hasMediaAttachment: true,
                imageMessage: {
                  jpegThumbnail: ppBuffer
                }
              },
              nativeFlowMessage: {
                buttons: link ? [
                  {
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                      display_text: '📋 Copiar enlace',
                      id: 'copy_group_link',
                      copy_code: link
                    })
                  }
                ] : []
              }
            }
          }
        }
      },
      { quoted: m }
    )

    await conn.relayMessage(chat, msg.message, { messageId: msg.key.id })

  } catch (err) {
    await conn.sendMessage(
      chat,
      { text: "❌ Ocurrió un error al generar el enlace." },
      { quoted: m }
    )
  }
}

handler.command = ['link']
handler.useradm = true
handler.botadm = true

export default handler