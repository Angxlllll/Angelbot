import express from 'express'
import path from 'path'

import { registerUser, verifyLogin } from '../lib/auth.js'
import { findUserById } from '../lib/db.js'

const router = express.Router()

const pub = path.resolve('./webpanel/public')

function alreadyAuthed(req) {
  return !!req.session?.user
}

router.get('/', (req, res) => {
  if (alreadyAuthed(req)) return res.redirect('/dashboard')
  return res.redirect('/login')
})

router.get('/login', (req, res) => {
  if (alreadyAuthed(req)) return res.redirect('/dashboard')
  res.sendFile(path.join(pub, 'login.html'))
})

router.get('/register', (req, res) => {
  if (alreadyAuthed(req)) return res.redirect('/dashboard')
  res.sendFile(path.join(pub, 'register.html'))
})

router.get('/dashboard', (req, res) => {
  if (!alreadyAuthed(req)) return res.redirect('/login')
  res.sendFile(path.join(pub, 'dashboard.html'))
})

router.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, waNumber } = req.body || {}
    const user = await registerUser({ username, password, waNumber })
    req.session.user = user
    return res.json({ ok: true, user })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    const user = await verifyLogin({ username, password })
    req.session.user = user
    return res.json({ ok: true, user })
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e || 'Error') })
  }
})

router.post('/api/auth/logout', (req, res) => {
  try {
    req.session?.destroy?.(() => {})
  } catch {}
  res.json({ ok: true })
})

router.get('/api/me', (req, res) => {
  const u = req.session?.user
  if (!u?.id) return res.status(401).json({ ok: false, error: 'No auth' })
  const fresh = findUserById(u.id)
  return res.json({ ok: true, user: fresh ? { id: fresh.id, username: fresh.username, waNumber: fresh.waNumber } : u })
})

export default router
