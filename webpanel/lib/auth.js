import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { createUser, findUserByUsername } from './db.js'

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase()
}

function normalizeWaNumber(n) {
  return String(n || '').replace(/\D/g, '')
}

async function registerUser({ username, password, waNumber }) {
  const uname = normalizeUsername(username)
  const pass = String(password || '')
  const wa = normalizeWaNumber(waNumber)

  if (!uname || uname.length < 3) throw new Error('Usuario inválido (min 3 caracteres).')
  if (!pass || pass.length < 6) throw new Error('Contraseña inválida (min 6 caracteres).')
  if (!wa || wa.length < 8) throw new Error('Número de WhatsApp inválido.')

  const exists = findUserByUsername(uname)
  if (exists) throw new Error('Ese usuario ya existe.')

  const passwordHash = await bcrypt.hash(pass, 10)

  const user = {
    id: nanoid(12),
    username: uname,
    passwordHash,
    waNumber: wa,
    createdAt: new Date().toISOString()
  }

  createUser(user)
  return { id: user.id, username: user.username, waNumber: user.waNumber }
}

async function verifyLogin({ username, password }) {
  const uname = normalizeUsername(username)
  const pass = String(password || '')
  if (!uname || !pass) throw new Error('Usuario o contraseña inválidos.')

  const user = findUserByUsername(uname)
  if (!user) throw new Error('Usuario o contraseña inválidos.')

  const ok = await bcrypt.compare(pass, user.passwordHash)
  if (!ok) throw new Error('Usuario o contraseña inválidos.')

  return { id: user.id, username: user.username, waNumber: user.waNumber }
}

export { normalizeWaNumber, registerUser, verifyLogin }
