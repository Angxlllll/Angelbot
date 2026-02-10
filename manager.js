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

function getFrom(msg) {
  return msg?.key?.remoteJid || ''
}

function getSender(msg) {
  return (
    msg?.key?.participant ||
    msg?.participant ||
    msg?.message?.extendedTextMessage?.contextInfo?.participant ||
    ''
  )
}

function unwrapMessageContainer(msg) {
  let m = msg?.message || {}
  for (let i = 0; i < 6; i++) {
    const next =
      m?.ephemeralMessage?.message ||
      m?.viewOnceMessage?.message ||
      m?.viewOnceMessageV2?.message ||
      m?.viewOnceMessageV2Extension?.message ||
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
    ''
  )
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

export async function handleMessage(sock, msg, store) {
  try {
    if (!msg || msg.key?.fromMe) return

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

    const enabled = await isBotEnabled(from)
    if (enabled === false && parsed.cmd !== 'unbanchat') {
      await sock.sendMessage(from, { text: 'El bot está desactivado en este chat' })
      return
    }

    if (handler.admin && isGroup) {
  const meta = await sock.groupMetadata(from)
  const admins = meta.participants
    .filter(p => p.admin)
    .map(p => p.id)

  if (!admins.includes(sender)) {
    await sock.sendMessage(from, { text: 'No eres admin' })
    return
  }
}

if (handler.botadm && isGroup) {
  const meta = await sock.groupMetadata(from)
  const botId = normalizeJid(sock.user.id)
  const bot = meta.participants.find(p => normalizeJid(p.id) === botId)

  if (!bot || !bot.admin) {
    await sock.sendMessage(from, { text: 'El bot no es admin' })
    return
  }
}

const ctx = {
  sock,
  msg,
  from,
  sender,
  text,
  isGroup,
  usedPrefix
}

if (typeof handler === 'function') {
  await handler(ctx, parsed.args)
} else if (typeof handler.run === 'function') {
  await handler.run(ctx, parsed.args)
}
  } catch (e) {
    console.error(chalk.red('[MANAGER] Error handleMessage:'), e)
  }
}

export function start() {
  ensureCommandsLoaded().catch(() => {})
}