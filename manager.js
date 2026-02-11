import fs from 'fs'
import chalk from 'chalk'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import config from './config.js'
import { isBotEnabled } from './biblioteca/settings.js'
import printMessage from './biblioteca/print.js'

const commands = new Map()

const handledMessages = new Map()
const HANDLED_TTL_MS = 2 * 60 * 1000

const groupMetaCache = new Map()
const GROUP_META_TTL_MS = 15000

let commandsReady = false
let loadingPromise = null

function safeStr(v) {
  if (v === null || v === undefined) return ''
  return String(v)
}

function now() {
  return Date.now()
}

function isGroupJid(jid = '') {
  return /@g.us$/.test(String(jid))
}

function normalizeJid(jid = '') {
  try {
    return jidNormalizedUser(jid)
  } catch {
    return safeStr(jid)
  }
}

function getFrom(msg) {
  return msg?.key?.remoteJid || ''
}

function getSender(msg) {
  return (
    msg?.key?.participant ||
    msg?.participant ||
    msg?.message?.extendedTextMessage?.contextInfo?.participant ||
    msg?.message?.imageMessage?.contextInfo?.participant ||
    msg?.message?.videoMessage?.contextInfo?.participant ||
    ''
  )
}

function unwrapMessage(msg) {
  let m = msg?.message || {}
  for (let i = 0; i < 6; i++) {
    const n =
      m?.ephemeralMessage?.message ||
      m?.viewOnceMessage?.message ||
      m?.viewOnceMessageV2?.message ||
      m?.documentWithCaptionMessage?.message
    if (!n) break
    m = n
  }
  return m
}

function getMessageText(msg) {
  const m = unwrapMessage(msg)
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    ''
  )
}

function cleanupHandled() {
  const t = now()
  for (const [k, ts] of handledMessages.entries()) {
    if (t - ts > HANDLED_TTL_MS) handledMessages.delete(k)
  }
}

function isDuplicate(msg) {
  const id = msg?.key?.id
  if (!id) return false
  const t = now()
  const prev = handledMessages.get(id)
  if (prev && t - prev < HANDLED_TTL_MS) return true
  handledMessages.set(id, t)
  return false
}

function getPrefix() {
  return globalThis?.prefijo || config?.prefijo || config?.PREFIX || '.'
}

function getMessageType(msg) {
  const m = unwrapMessage(msg)
  return Object.keys(m)[0] || 'unknown'
}

async function loadCommands() {
  commands.clear()
  const base = './comandos'

  function scan(dir) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(f => {
      const p = `${dir}/${f.name}`
      if (f.isDirectory()) return scan(p)
      if (f.isFile() && f.name.endsWith('.js')) return [p]
      return []
    })
  }

  for (const file of scan(base)) {
    try {
      const mod = await import(`./${file}?v=${Date.now()}`)
      const handler = mod.default
      if (typeof handler !== 'function') continue
      const cmds = Array.isArray(handler.command)
        ? handler.command
        : [handler.command]
      for (const c of cmds) {
        if (c) commands.set(String(c).toLowerCase(), handler)
      }
    } catch (e) {
      console.error(chalk.red('Error cargando comando'), file, e)
    }
  }
}

async function ensureCommands() {
  if (commandsReady) return
  if (loadingPromise) return loadingPromise
  loadingPromise = loadCommands().then(() => {
    commandsReady = true
  })
  return loadingPromise
}

function parseCommand(text, prefix) {
  const t = safeStr(text).trim()
  if (!t.startsWith(prefix)) return null
  const body = t.slice(prefix.length).trim()
  if (!body) return null
  const parts = body.split(/\s+/)
  return {
    cmd: parts.shift().toLowerCase(),
    args: parts
  }
}

async function getGroupCtx(sock, from, sender) {
  const cached = groupMetaCache.get(from)
  if (cached && now() - cached.ts < GROUP_META_TTL_MS) {
    return cached
  }

  try {
    const meta = await sock.groupMetadata(from)
    const participants = meta.participants || []
    const botJid = normalizeJid(sock.user.id)

    let botIsAdmin = false
    let userIsAdmin = false

    for (const p of participants) {
      const jid = normalizeJid(p.id)
      if (jid === botJid) botIsAdmin = Boolean(p.admin)
      if (jid === sender) userIsAdmin = Boolean(p.admin)
    }

    const entry = {
      ts: now(),
      meta,
      participants,
      botIsAdmin,
      userIsAdmin
    }

    groupMetaCache.set(from, entry)
    return entry
  } catch {
    return {
      meta: null,
      participants: [],
      botIsAdmin: false,
      userIsAdmin: false
    }
  }
}

export async function handleMessage(sock, msg) {
  try {
    if (!msg || msg.key.fromMe) return

    all(msg)

    cleanupHandled()
    if (isDuplicate(msg)) return

    const from = getFrom(msg)
    if (!from) return

    const sender = normalizeJid(getSender(msg))
    const isGroup = isGroupJid(from)
    const text = getMessageText(msg)
    const type = getMessageType(msg)

    const prefix = getPrefix()
    const parsed = parseCommand(text, prefix)
    if (!parsed) return

    printMessage({ msg, conn: sock, from, sender, isGroup, type, text }).catch(() => {})

    const enabled = await isBotEnabled(from)
    if (enabled === false) return

    await ensureCommands()

    const handler = commands.get(parsed.cmd)
    if (!handler) return

    let groupCtx = {
      meta: null,
      participants: [],
      botIsAdmin: false,
      userIsAdmin: false
    }

    if (isGroup) {
      groupCtx = await getGroupCtx(sock, from, sender)
    }

    if (handler.owner) {
      const owners = new Set((config.owner || []).map(normalizeJid))
      if (!owners.has(sender)) {
        await sock.sendMessage(from, { text: 'Solo owners.' }, { quoted: msg })
        return
      }
    }

    if (handler.admin && isGroup && !groupCtx.userIsAdmin) {
      await sock.sendMessage(from, { text: 'Solo admins.' }, { quoted: msg })
      return
    }

    if (handler.botadm && isGroup && !groupCtx.botIsAdmin) {
      await sock.sendMessage(from, { text: 'Necesito admin.' }, { quoted: msg })
      return
    }

    const m = Object.assign(msg, {
      chat: from,
      sender,
      body: text,
      text,
      args: parsed.args,
      command: parsed.cmd,
      reply: t => sock.sendMessage(from, { text: t }, { quoted: msg })
    })

    const extra = {
      conn: sock,
      args: parsed.args,
      text: parsed.args.join(' '),
      isGroup,
      from,
      sender,
      groupMetadata: groupCtx.meta,
      participants: groupCtx.participants,
      botIsAdmin: groupCtx.botIsAdmin,
      userIsAdmin: groupCtx.userIsAdmin,
      usedPrefix: prefix
    }

    await handler(m, extra)
  } catch (e) {
    console.error(chalk.red('HANDLER ERROR'), e)
  }
}

export function start() {
  ensureCommands().catch(() => {})
}

export function all(m) {
  const msg = m.message
  if (!msg) return

  let selection = null

  if (msg.interactiveResponseMessage) {
    const json =
      msg.interactiveResponseMessage
        ?.nativeFlowResponseMessage
        ?.paramsJson
    if (!json) return
    try {
      const parsed = JSON.parse(json)
      selection = parsed.id || parsed
    } catch {
      selection = json
    }
  }

  if (msg.buttonsResponseMessage) {
    selection = msg.buttonsResponseMessage.selectedButtonId
  }

  if (msg.listResponseMessage) {
    selection =
      msg.listResponseMessage.singleSelectReply?.selectedRowId
  }

  if (!selection) return

  const prefix =
    globalThis?.prefijo ||
    globalThis?.PREFIX ||
    '.'

  const text = prefix + String(selection).trim()

  m.message.conversation = text
  m.message.extendedTextMessage = { text }

  m.text = text
  m.body = text

  delete m.message.buttonsResponseMessage
  delete m.message.listResponseMessage
  delete m.message.interactiveResponseMessage
}