import fs from 'fs'
import chalk from 'chalk'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import config from './config.js'
import { isBotEnabled, getCommandPrefix } from './biblioteca/settings.js'
import { getPrimaryKey, getSessionKey } from './biblioteca/primary.js'
import printMessage from './biblioteca/print.js'

const commands = new Map()

const handledMessages = new Map()
const HANDLED_TTL_MS = 2 * 60 * 1000

const groupMetaCache = new Map()
const GROUP_META_TTL_MS = 15_000

let _commandsReady = false
let _loadingPromise = null
let _cleanupTick = 0

function safeStr(v) {
  if (v === null || v === undefined) return ''
  return String(v)
}

function now() {
  return Date.now()
}

function maybeCleanupHandled() {
  if (++_cleanupTick % 50 !== 0) return
  const t = now()
  for (const [k, ts] of handledMessages.entries()) {
    if (t - ts > HANDLED_TTL_MS) handledMessages.delete(k)
  }
}

function isGroupJid(jid = '') {
  return /@g\.us$/.test(String(jid || ''))
}

function normalizeJid(jid = '') {
  try {
    return jid ? jidNormalizedUser(jid) : ''
  } catch {
    return safeStr(jid)
  }
}

function stripDevice(jid = '') {
  return safeStr(jid).replace(/:\d+(?=@)/, '')
}

function getFrom(msg) {
  return msg?.key?.remoteJid || msg?.chat || msg?.from || ''
}

function getSender(msg) {
  return (
    msg?.sender ||
    msg?.key?.participant ||
    msg?.participant ||
    msg?.message?.extendedTextMessage?.contextInfo?.participant ||
    msg?.message?.imageMessage?.contextInfo?.participant ||
    msg?.message?.videoMessage?.contextInfo?.participant ||
    msg?.message?.documentMessage?.contextInfo?.participant ||
    msg?.message?.audioMessage?.contextInfo?.participant ||
    ''
  )
}

function getCommandFiles(dir) {
  let results = []
  if (!fs.existsSync(dir)) return results
  const list = fs.readdirSync(dir, { withFileTypes: true })
  for (const file of list) {
    const fullPath = `${dir}/${file.name}`
    if (file.isDirectory()) results = results.concat(getCommandFiles(fullPath))
    else if (file.isFile() && file.name.endsWith('.js')) results.push(fullPath)
  }
  return results
}

function unwrapMessageContainer(msg) {
  let m = msg?.message || {}
  for (let i = 0; i < 6; i++) {
    const next =
      m?.ephemeralMessage?.message ||
      m?.viewOnceMessage?.message ||
      m?.viewOnceMessageV2?.message ||
      m?.viewOnceMessageV2Extension?.message ||
      m?.documentWithCaptionMessage?.message ||
      null
    if (!next) break
    m = next
  }
  return m
}

function getMessageText(msg) {
  const m = unwrapMessageContainer(msg)
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    m?.buttonsResponseMessage?.selectedButtonId ||
    m?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.templateButtonReplyMessage?.selectedId ||
    ''
  )
}

function getMentionedJid(msg) {
  const m = unwrapMessageContainer(msg)
  return m?.extendedTextMessage?.contextInfo?.mentionedJid || []
}

function sockKey() {
  return 'main'
}

function isDuplicate(sock, msg) {
  const id = msg?.key?.id
  if (!id) return false
  const key = `${sockKey(sock)}:${id}`
  const t = now()
  const prev = handledMessages.get(key)
  if (prev && t - prev < HANDLED_TTL_MS) return true
  handledMessages.set(key, t)
  return false
}

function getCachedGroupMeta(key) {
  const entry = groupMetaCache.get(key)
  if (!entry) return null
  if (now() - entry.ts > GROUP_META_TTL_MS) {
    groupMetaCache.delete(key)
    return null
  }
  return entry
}

async function loadCommands() {
  commands.clear()
  const files = getCommandFiles('./comandos')
  for (const filePath of files) {
    try {
      const mod = await import(`./${filePath}?update=${Date.now()}`)
      const handler = mod?.default
      if (!handler) continue
      const list = Array.isArray(handler.command)
        ? handler.command
        : [handler.command]
      for (const cmd of list) {
        if (cmd) commands.set(String(cmd).toLowerCase(), handler)
      }
    } catch (e) {
      console.error(chalk.red(`Error cargando ${filePath}`), e)
    }
  }
}

async function ensureCommandsLoaded() {
  if (_commandsReady) return
  if (_loadingPromise) return _loadingPromise
  _loadingPromise = loadCommands().finally(() => {
    _commandsReady = true
    _loadingPromise = null
  })
  return _loadingPromise
}

function getPrefixFor() {
  try {
    return getCommandPrefix('') || config.prefijo || '.'
  } catch {
    return config.prefijo || '.'
  }
}

function parseCommand(text, prefix) {
  const t = safeStr(text).trim()
  if (!t.startsWith(prefix)) return null
  const body = t.slice(prefix.length).trim()
  if (!body) return null
  const parts = body.split(/\s+/)
  return { cmd: parts.shift().toLowerCase(), args: parts }
}

export async function handleMessage(sock, msg) {
  try {
    if (!msg || msg?.key?.fromMe) return

    maybeCleanupHandled()
    if (isDuplicate(sock, msg)) return

    const from = getFrom(msg)
    if (!from) return

    const isGroup = isGroupJid(from)
    const sender = normalizeJid(getSender(msg))

    if (isGroup) {
      const pk = getPrimaryKey(from)
      if (pk && pk !== getSessionKey(sock)) return
    }

    const text = getMessageText(msg)
    if (!text) return

    const usedPrefix = getPrefixFor()
    const parsed = parseCommand(text, usedPrefix)
    if (!parsed) return

    await ensureCommandsLoaded()
    const handler = commands.get(parsed.cmd)
    if (!handler) return

    if (!isGroup) {
      const type = Object.keys(unwrapMessageContainer(msg))[0] || 'unknown'
      printMessage({ msg, conn: sock, from, sender, isGroup, type, text }).catch(() => {})
    }

    const enabled = await isBotEnabled(from)
    if (enabled === false && parsed.cmd !== 'unbanchat') return

    const baseCtx = await buildCtx(sock, msg, {
      needGroupMeta:
        isGroup && (handler.admin || handler.botadm || handler.useradm)
    })

    await runCommand(
      handler,
      {
        sock,
        msg,
        from,
        sender,
        text,
        cmd: parsed.cmd,
        args: parsed.args,
        isGroup,
        usedPrefix
      },
      baseCtx
    )
  } catch (e) {
    console.error(chalk.red('[MANAGER] Error handleMessage:'), e)
  }
}

export function start() {
  ensureCommandsLoaded().catch(() => {})
}