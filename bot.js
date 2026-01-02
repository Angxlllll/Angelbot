import * as baileys from "@whiskeysockets/baileys"
import chalk from "chalk"
import readlineSync from "readline-sync"
import fs from "fs"
import pino from "pino"
import { start, handleMessage } from "./manager.js"
import groupWelcome from "./biblioteca/welcome.js"
import groupAvisos from "./biblioteca/avisos.js"
import { applyModeration } from "./biblioteca/moderation.js"
import { getCommandPrefix } from "./biblioteca/settings.js"
import { initSubbots } from "./subbotManager.js"
import config from "./config.js"
import { startWebPanel } from './webpanel/app.js'

import {
  downloadContentFromMessage,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  generateWAMessageContent
} from '@whiskeysockets/baileys'

global.wa = {
  downloadContentFromMessage,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  generateWAMessageContent
}

if (!global.WEBPANEL_STARTED) {
global.WEBPANEL_STARTED = true
try {
startWebPanel()
} catch (e) {
console.error(chalk.red('「✦」Error iniciando panel web »'), e)
}
}

const sessionFolder = "./session"
const credsPath = `${sessionFolder}/creds.json`

if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true })

let usarCodigo = false
let numero = ""

let subbotsReady = false
let subbotsLock = null

async function ensureSubbots() {
if (subbotsReady) return
if (subbotsLock) return subbotsLock

subbotsLock = (async () => {
try {
await initSubbots()
subbotsReady = true
console.log(chalk.green("「✿」Subbots reconectados"))
} catch (err) {
subbotsReady = false
console.error(chalk.red("「✦」Error al reconectar subbots »"), err)
} finally {
subbotsLock = null
}
})()

return subbotsLock
}

async function main() {
console.clear()
console.log(chalk.hex('#6A0DAD').bold("「✿」Meow WaBot"))
console.log(chalk.gray("☆ Hecho por Ado :D"))

if (!fs.existsSync(credsPath)) {
console.log(chalk.white("\n> 1 » Conectar con código QR"))
console.log(chalk.white("> 2 » Conectar con código de 8 dígitos"))

const opcion = readlineSync.question(chalk.yellow("\n☆ Elige una opción (1 o 2) » "))
usarCodigo = opcion === "2"

if (usarCodigo) {
numero = readlineSync.question(chalk.yellow("☆ Ingresa tu número (ej: 5218144380378) » "))
}

}

await iniciarBot()
}

async function iniciarBot() {
const { state, saveCreds } = await baileys.useMultiFileAuthState("session")
const { version } = await baileys.fetchLatestBaileysVersion()

const sock = baileys.makeWASocket({
version,
printQRInTerminal: !usarCodigo && !fs.existsSync(credsPath),
logger: pino({ level: "silent" }),
auth: {
creds: state.creds,
keys: baileys.makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
},
browser: ["Ubuntu", "Chrome", "108.0.5359.125"],
syncFullHistory: false,
markOnlineOnConnect: false
})

sock.ev.on("creds.update", saveCreds)

sock.isSubBot = false

sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
const code = lastDisconnect?.error?.output?.statusCode

if (connection === "open") {
  try {
    const jid = sock?.user?.jid || sock?.user?.id || ''
    if (jid) globalThis.MAIN_JID = jid
    if (!(global.conns instanceof Array)) global.conns = []
    const norm = (s) => String(s || '').split(':')[0]
    const meNum = String(jid).split('@')[0]
    global.conns = global.conns.filter((c) => {
      const cj = c?.user?.jid || c?.user?.id || ''
      const cn = String(cj).split('@')[0]
      return cn && cn !== meNum
    })
    global.conns.push(sock)
  } catch {}

  const restarterFile = "./lastRestarter.json"
  if (fs.existsSync(restarterFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(restarterFile, "utf-8"))
      if (data.chatId) {
        await sock.sendMessage(
          data.chatId,
          { text: "✅ *Angel Bot está en línea nuevamente* 🚀" }
        )
        console.log(chalk.yellow("📢 Aviso enviado al grupo del reinicio."))
        fs.unlinkSync(restarterFile)
      }
    } catch (error) {
      console.error("❌ Error leyendo lastRestarter.json:", error)
    }
  }

  console.log(chalk.greenBright("\n「✿」¡Conectado correctamente!"))
  console.log(chalk.gray("☆ Esperando mensajes..."))
  ensureSubbots().catch(() => {})
}

if (connection === "close") {
const reconectar = code !== baileys.DisconnectReason.loggedOut
console.log(chalk.red("\n「✦」Conexión cerrada"))
console.log(chalk.gray(`> Código » ${code}`))

if (reconectar) {
console.log(chalk.yellow("☆ Reconectando..."))
try {
sock.ev.removeAllListeners()
} catch {}
setTimeout(() => iniciarBot().catch(() => {}), 1500)
} else {
console.log(
chalk.redBright("☆ Sesión cerrada. Borra la carpeta 'session' y vuelve a vincular.")
)
}
}

})

groupWelcome(sock)
groupAvisos(sock)

sock.ev.on("messages.upsert", async ({ messages, type }) => {
if (type !== "notify") return

// Prefijo (main). Evita cálculos por mensaje.
const usedPrefix = getCommandPrefix('') || globalThis?.prefijo || config?.prefijo || config?.PREFIX || '.'

for (const msg of messages || []) {
if (!msg?.message) continue

const from = msg.key?.remoteJid || ""
const isGroup = from.endsWith("@g.us")

const texto =
msg.message?.conversation ||
msg.message?.extendedTextMessage?.text ||
msg.message?.imageMessage?.caption ||
msg.message?.videoMessage?.caption ||
""

// Si es comando, NO pasar por antilink (evita retardos y que borre el comando)
const isCommand = String(texto || '').trim().startsWith(String(usedPrefix || '.'))

if (!isCommand) {
  // Moderación en background para no bloquear respuestas
  applyModeration(sock, msg, texto).catch(() => {})
}

handleMessage(sock, msg).catch((e) => {
  console.error(chalk.red("「✦」Error handleMessage »"), e)
})
}

})

if (usarCodigo && !state.creds.registered && !fs.existsSync(credsPath)) {
setTimeout(async () => {
try {
const code = await sock.requestPairingCode(String(numero || "").replace(/\D/g, ""))
console.log(chalk.hex('#A020F0').bold("\n「✿」Código de emparejamiento"))
console.log(chalk.white(`> Código » `) + chalk.greenBright.bold(code))
console.log(chalk.gray("☆ WhatsApp » Dispositivos vinculados » Vincular » Usar código"))
} catch (e) {
console.log(chalk.red("「✦」Error al generar código »"), e)
}
}, 2500)
}
}

start()
main().catch((e) => console.error(e))
