import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys'

let handler = async (m, { conn }) => {
  const caption = `
👋 *Hola*
Selecciona una opción:
  `.trim()

  const buttons = [
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '🖼️ Sticker',
        id: 's'
      })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: '👥 Tagall',
        id: 'todos'
      })
    }
  ]

  const msg = generateWAMessageFromContent(
    m.chat,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({
              text: caption
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: global?.wm || 'Bot'
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons
            })
          })
        }
      }
    },
    { quoted: m }
  )

  await conn.relayMessage(m.chat, msg.message, {})
}

handler.help = ['hola']
handler.tags = ['tools']
handler.command = ['hola']

export default handler