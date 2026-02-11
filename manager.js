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

const now = () => Date.now()

function safeStr(v) {
  return v == null ? '' : String(v)
}

function isGroupJid(jid = '') {
  return jid.endsWith('@g.us')
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
  for (;;) {
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
  for (const [k, ts] of handledMessages) {
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

async function loadCommands() {
  commands.clear()
  const base = './comandos'

  const scan = dir =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(f => {
          const p = `${dir}/${f.name}`
          if (f.isDirectory()) return scan(p)
          if (f.isFile() && p.endsWith('.js')) return [p]
          return []
        })
      : []

  for (const file of scan(base)) {
    try {
      const mod = await import(`./${file}?v=${now()}`)
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
  if (!loadingPromise) {
    loadingPromise = loadCommands().then(() => {
      commandsReady = true
    })
  }
  return loadingPromise
}

function parseCommand(text, prefix) {
  if (!text.startsWith(prefix)) return null
  const body = text.slice(prefix.length).trim()
  if (!body) return null
  const parts = body.split(/\s+/)
  return { cmd: parts.shift().toLowerCase(), args: parts }
}

async function getGroupCtx(sock, from, sender) {
  const cached = groupMetaCache.get(from)
  if (cached && now() - cached.ts < GROUP_META_TTL_MS) return cached

  try {
    const meta = await sock.groupMetadata(from)
    const botJid = normalizeJid(sock.user.id)

    let botIsAdmin = false
    let userIsAdmin = false

    for (const p of meta.participants || []) {
      const jid = normalizeJid(p.id)
      if (jid === botJid) botIsAdmin = !!p.admin
      if (jid === sender) userIsAdmin = !!p.admin
    }

    const entry = {
      ts: now(),
      meta,
      participants: meta.participants || [],
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

    cleanupHandled()
    if (isDuplicate(msg)) return

    const from = getFrom(msg)
    if (!from) return

    const text = getMessageText(msg)
    if (!text) return

    const prefix = getPrefix()
    if (!text.startsWith(prefix)) return

    const enabled = await isBotEnabled(from)
    if (enabled === false) return

    const parsed = parseCommand(text, prefix)
    if (!parsed) return

    await ensureCommands()

    const handler = commands.get(parsed.cmd)
    if (!handler) return

    const sender = normalizeJid(getSender(msg))
    const isGroup = isGroupJid(from)

    printMessage({ msg, conn: sock, from, sender, isGroup, text }).catch(() => {})

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
      text,
      body: text,
      args: parsed.args,
      command: parsed.cmd,
      reply: t => sock.sendMessage(from, { text: t }, { quoted: msg })
    })

    await handler(m, {
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
    })
  } catch (e) {
    console.error(chalk.red('HANDLER ERROR'), e)
  }
}

export function start() {
  ensureCommands().catch(() => {})
}