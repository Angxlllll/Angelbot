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
const recentCommands = new Map()

const RECENT_WINDOW_MS = 1500

const groupMetaCache = new Map()
const GROUP_META_TTL_MS = 15_000

let _commandsReady = false
let _loadingPromise = null

function safeStr(v) {
  if (v === null || v === undefined) return ''
  return String(v)
}

function now() {
  return Date.now()
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
  const s = safeStr(jid)
  return s.replace(/:\d+(?=@)/, '')
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

    if (file.isDirectory()) {
      results = results.concat(getCommandFiles(fullPath))
    } else if (file.isFile() && file.name.endsWith('.js')) {
      results.push(fullPath)
    }
  }
  return results
}

function unwrapMessageContainer(msg) {
  
  let m = msg?.message || {}
  const maxDepth = 6
  for (let i = 0; i < maxDepth; i++) {
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
  return (
    m?.extendedTextMessage?.contextInfo?.mentionedJid ||
    m?.imageMessage?.contextInfo?.mentionedJid ||
    m?.videoMessage?.contextInfo?.mentionedJid ||
    []
  )
}

function cleanupHandled() {
  const t = now()
  for (const [k, ts] of handledMessages.entries()) {
    if (t - ts > HANDLED_TTL_MS) handledMessages.delete(k)
  }
}

function sockKey(sock) {
  return sock?.isSubBot ? String(sock?.subbotId || 'sub') : 'main'
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

function isRateLimited(sock, sender, cmd) {
  const key = `${sockKey(sock)}:${sender}:${cmd}`
  const t = now()
  const prev = recentCommands.get(key)
  if (prev && t - prev < RECENT_WINDOW_MS) return true
  recentCommands.set(key, t)
  return false
}

function getCachedGroupMeta(cacheKey) {
  const entry = groupMetaCache.get(cacheKey)
  if (!entry) return null
  if (now() - entry.ts > GROUP_META_TTL_MS) {
    groupMetaCache.delete(cacheKey)
    return null
  }
  return entry
}

async function loadCommands() {
  commands.clear()

  const baseDir = './comandos'
  const files = getCommandFiles(baseDir)
  const uniqueByFile = new Map()

  for (const filePath of files) {
    try {
      const mod = await import(`./${filePath}?update=${Date.now()}`)
      const handler = mod?.default
      if (typeof handler !== 'function') continue

      const folder = filePath
        .replace(baseDir + '/', '')
        .split('/')[0]

      handler.__file = filePath
      handler.__category = handler.tags?.[0] || folder || 'other'

      uniqueByFile.set(filePath, handler)

      if (handler.command) {
        const list = Array.isArray(handler.command)
          ? handler.command
          : [handler.command]

        for (const cmd of list) {
          if (!cmd) continue
          commands.set(String(cmd).toLowerCase(), handler)
        }
      }
    } catch (err) {
      console.error(
        chalk.red(`Error cargando comando ${filePath}`),
        err
      )
    }
  }

  globalThis.COMMAND_INDEX = Array.from(uniqueByFile.values()).map((h) => ({
    file: h.__file,
    category: h.__category,
    tags: Array.isArray(h.tags) ? h.tags : [],
    help: Array.isArray(h.help) ? h.help : [],
    commands: Array.isArray(h.command) ? h.command : [h.command]
  }))
}

async function ensureCommandsLoaded() {
  if (_commandsReady) return
  if (_loadingPromise) return _loadingPromise

  _loadingPromise = (async () => {
    await loadCommands()
    _commandsReady = true
  })().finally(() => {
    _loadingPromise = null
  })

  return _loadingPromise
}

function getPrefixFor(sock) {
  const fallback = globalThis?.prefijo || config?.prefijo || config?.PREFIX || '.'
  try {
    const subbotId = sock?.isSubBot ? String(sock?.subbotId || '').trim() : ''
    const stored = getCommandPrefix(subbotId)
    return stored || fallback
  } catch {
    return fallback
  }
}

function getMessageType(msg) {
  const m = unwrapMessageContainer(msg)
  const keys = Object.keys(m)
  return keys[0] || 'unknown'
}

function hasQuoted(msg) {
  const m = msg?.message || {}
  const ctx =
    m?.extendedTextMessage?.contextInfo ||
    m?.imageMessage?.contextInfo ||
    m?.videoMessage?.contextInfo ||
    m?.documentMessage?.contextInfo ||
    m?.audioMessage?.contextInfo ||
    null
  return Boolean(ctx?.quotedMessage)
}

function isTruthy(v) {
  return v === true || v === 1 || v === 'true' || v === '1'
}

function shouldRequireUserAdmin(handler) {
  return isTruthy(handler?.useradm) || isTruthy(handler?.admin)
}

function shouldRequireBotAdmin(handler) {
  return isTruthy(handler?.botadm) || isTruthy(handler?.botAdmin)
}

function shouldRequireOwner(handler) {
  return isTruthy(handler?.owner) || isTruthy(handler?.rowner)
}

function deny(sock, from, msg, text) {
  const t = safeStr(text)
  if (!t) return
  return sock
    .sendMessage(from, { text: t }, { quoted: msg })
    .catch(() => sock.sendMessage(from, { text: t }).catch(() => {}))
}

function shorten(s, max = 180) {
  const t = safeStr(s).replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > max ? t.slice(0, max) + '…' : t
}

function logMsg(meta) {
  const { id, from, sender, pushName, isGroup, type, text, parsed, decision } = meta
  const ts = new Date().toISOString()
  const where = isGroup ? 'GROUP' : 'DM'
  const pfx =
    safeStr(meta?.usedPrefix || meta?.prefix || '') ||
    (globalThis?.prefijo || config?.prefijo || config?.PREFIX || '.')
  const cmdInfo = parsed ? `CMD=${pfx}${parsed.cmd} ARGS=${parsed.args?.length || 0}` : 'NO_CMD'

  console.log(
    chalk.gray(
      `\n[MSG ${ts}] ${where} | id=${safeStr(id)} | type=${safeStr(type)} | quoted=${
        hasQuoted(meta.rawMsg) ? 'yes' : 'no'
      }`
    )
  )
  console.log(chalk.gray(`  From:   ${safeStr(from)}`))
  console.log(chalk.gray(`  Sender: ${safeStr(sender)}${pushName ? ` (${pushName})` : ''}`))
  if (text) console.log(chalk.gray(`  Text:   ${shorten(text)}`))
  console.log(chalk.gray(`  Parse:  ${cmdInfo}`))
  if (decision) console.log(chalk.gray(`  Action: ${decision}`))
}

async function buildCtx(sock, msg, { needGroupMeta = true } = {}) {
  const from = getFrom(msg)
  const senderRaw = getSender(msg)
  const sender = normalizeJid(senderRaw)
  const isGroup = isGroupJid(from)
  const text = getMessageText(msg)

  const subbotId = sock?.isSubBot ? String(sock?.subbotId || '').trim() : ''
  const usedPrefix = getPrefixFor(sock)

  const extra = {
    conn: sock,
    sock,
    from,
    chat: from,
    sender,
    isGroup,
    text,
    fullText: safeStr(text),
    usedPrefix,
    args: [],
    command: '',
    isSubBot: Boolean(sock?.isSubBot),
    subbotOwner: sock?.subbotOwner || '',
    groupMetadata: null,
    participants: [],
    botIsAdmin: false,
    userIsAdmin: false,
    isOwner: false,
    subbotId
  }

  const ownerList = Array.isArray(config?.owner) ? config.owner : []
  const ownerSet = new Set(ownerList.map((x) => normalizeJid(x)))
  const senderNorm = normalizeJid(sender)
  extra.isOwner = ownerSet.has(senderNorm)

  if (isGroup && needGroupMeta) {
    const cacheKey = `${sockKey(sock)}:${from}`
    const cached = getCachedGroupMeta(cacheKey)
    if (cached) {
      extra.groupMetadata = cached.meta
      extra.participants = cached.participants
      extra.botIsAdmin = cached.botIsAdmin
      extra.userIsAdmin = cached.userIsAdminForSender(senderNorm)
    } else {
      try {
        const meta = await Promise.race([
          sock.groupMetadata(from),
          new Promise((_, rej) => setTimeout(() => rej(new Error('groupMetadata timeout')), 8000))
        ])
        const participants = Array.isArray(meta?.participants) ? meta.participants : []

        const botRaw1 = sock?.user?.id || ''
        const botRaw2 = sock?.user?.jid || ''
        const botRaw3 = sock?.user?.lid || ''

        const botCandidates = new Set(
          [botRaw1, botRaw2, botRaw3]
            .filter(Boolean)
            .flatMap((j) => [j, stripDevice(j)])
            .map((j) => normalizeJid(j))
            .filter(Boolean)
        )

        const me = participants.find((p) => botCandidates.has(normalizeJid(p?.jid || p?.id || '')))
        const botIsAdmin = Boolean(me?.admin)

        const adminByJid = new Map()
        for (const p of participants) {
          const pj = normalizeJid(p?.jid || p?.id || '')
          if (!pj) continue
          adminByJid.set(pj, Boolean(p?.admin))
        }

        const cacheEntry = {
          ts: now(),
          meta,
          participants,
          botIsAdmin,
          userIsAdminForSender: (jid) => adminByJid.get(jid) === true
        }

        groupMetaCache.set(cacheKey, cacheEntry)

        extra.groupMetadata = meta
        extra.participants = participants
        extra.botIsAdmin = botIsAdmin
        extra.userIsAdmin = cacheEntry.userIsAdminForSender(senderNorm)
      } catch {
        extra.groupMetadata = null
        extra.participants = []
        extra.botIsAdmin = false
        extra.userIsAdmin = false
      }
    }
  }

  return extra
}

async function runCommand(handler, ctx, baseCtx) {
  const { sock, msg, from, sender, text, cmd, args, isGroup, usedPrefix } = ctx

  const dsock = sock

  const fullText = safeStr(text)
  const argText = Array.isArray(args) ? args.join(' ').trim() : ''
  const mentionedJid = getMentionedJid(msg)

  const m = Object.assign({}, msg, {
    chat: from,
    sender,
    from,
    mentionedJid,
    isGroup,
    body: fullText,
    args: args || [],
    command: cmd,
    usedPrefix: usedPrefix || getPrefixFor(sock),
    reply: async (t = '', opts = {}) => {
      const raw = safeStr(t)
      const out = raw
      if (!safeStr(out).trim()) return
      try {
        return await dsock.sendMessage(from, { text: out, ...opts }, { quoted: msg })
      } catch {
        try {
          return await dsock.sendMessage(from, { text: out, ...opts })
        } catch {}
      }
    }
  })

  const base = baseCtx || (await buildCtx(sock, msg, { needGroupMeta: true }))

  const extra = {
    conn: dsock,
    sock: dsock,
    args: args || [],
    command: cmd,
    text: argText,
    fullText,
    body: fullText,
    usedPrefix: usedPrefix || getPrefixFor(sock),
    isGroup,
    from,
    sender,
    chat: from,
    isSubBot: base.isSubBot,
    subbotOwner: base.subbotOwner,
    isOwner: base.isOwner,
    groupMetadata: base.groupMetadata,
    participants: base.participants,
    botIsAdmin: base.botIsAdmin,
    userIsAdmin: base.userIsAdmin,
    subbotId: base.subbotId
  }

  return await handler(m, extra)
}

function parseCommand(text = '', prefix = '.') {
  const t = safeStr(text).trim()
  if (!t) return null
  if (!t.startsWith(prefix)) return null

  const body = t.slice(prefix.length).trim()
  if (!body) return null

  const parts = body.split(/\s+/)
  const cmd = String(parts.shift() || '').toLowerCase()
  const args = parts
  return { cmd, args, raw: t }
}

export async function handleMessage(sock, msg) {
  try {
    if (!msg) return
    if (msg?.key?.fromMe) return

    cleanupHandled()
    if (isDuplicate(sock, msg)) return

    const from = getFrom(msg)
    if (!from) return

    const senderRaw = getSender(msg)
    const sender = normalizeJid(senderRaw)
    const isGroup = isGroupJid(from)

    if (isGroup) {
      try {
        const pk = getPrimaryKey(from)
        if (pk) {
          const myKey = getSessionKey(sock)
          if (pk !== myKey) return
        }
      } catch {}
    }
    const text = getMessageText(msg)
    const type = getMessageType(msg)

    const usedPrefix = getPrefixFor(sock)
    const parsed = parseCommand(text, usedPrefix)
    if (!parsed) return

    // ⚡ Loguear cada mensaje en consola (printMessage) es MUY costoso en grupos grandes.
    // Por default, solo imprimimos comandos.
    printMessage({ msg, conn: sock, from, sender, isGroup, type, text }).catch(() => {})

    const { cmd, args } = parsed

    const subbotId = sock?.isSubBot ? String(sock?.subbotId || '').trim() : ''
    const allowWhenBotOff = new Set(['unbanchat'])

    try {
      const enabled = await isBotEnabled(from, subbotId)
      if (enabled === false && !allowWhenBotOff.has(cmd)) return
    } catch {}

    await ensureCommandsLoaded()

    const handler = commands.get(cmd)
    if (!handler) return

    if (isRateLimited(sock, sender, cmd)) return

    const needsGroupMeta = isGroup && (shouldRequireUserAdmin(handler) || shouldRequireBotAdmin(handler))
    const baseCtx = await buildCtx(sock, msg, { needGroupMeta: needsGroupMeta })

    if (shouldRequireOwner(handler) && !baseCtx.isOwner) {
      await deny(sock, from, msg, '「✦」Solo los *owners* (config.js) pueden usar este comando.')
      return
    }

    if (isGroup) {
      if (shouldRequireUserAdmin(handler) && !baseCtx.isOwner && !baseCtx.userIsAdmin) {
        await deny(sock, from, msg, '「✦」Solo *administradores* del grupo pueden usar este comando.')
        return
      }
      if (shouldRequireBotAdmin(handler) && !baseCtx.botIsAdmin) {
        await deny(sock, from, msg, '「✦」Necesito ser *admin* para usar este comando.')
        return
      }
    } else {
      if (shouldRequireUserAdmin(handler) || shouldRequireBotAdmin(handler)) {
        await deny(sock, from, msg, '「✦」Este comando solo funciona en *grupos*.')
        return
      }
    }

    await runCommand(handler, { sock, msg, from, sender, text, cmd, args, isGroup, usedPrefix }, baseCtx)
  } catch (err) {
    console.error(chalk.red('[MANAGER] Error handleMessage:'), err)
  }
}

export function start() {
  ensureCommandsLoaded().catch(() => {})
}