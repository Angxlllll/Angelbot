import express from 'express'
import session from 'express-session'
import path from 'path'

import JsonFileStore from './lib/jsonSessionStore.js'

const app = express()

const pub = path.resolve('./webpanel/public')

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.use(
  session({
    name: 'sb_sess',
    secret: process.env.WEB_SESSION_SECRET || 'sb_secret_change_me',
    resave: false,
    saveUninitialized: false,
    store: new JsonFileStore({
      path: process.env.WEB_SESSION_DB || './webpanel/db/sessions.json',
      ttlMs: Number(process.env.WEB_SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 365),
      reapIntervalMs: Number(process.env.WEB_SESSION_REAP_MS || 1000 * 60 * 15)
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: Number(process.env.WEB_COOKIE_MAX_AGE_MS || 1000 * 60 * 60 * 24 * 365)
    }
  })
)

// Static assets
app.use('/assets', express.static(path.join(pub, 'assets')))

app.use((req, res) => {
  res.status(404).send('404')
})

function startWebPanel() {
  const port = Number(process.env.WEB_PORT || 3005)
  const host = process.env.WEB_HOST || '0.0.0.0'

  app.listen(port, host, () => {
    console.log(`[WEB] Panel listo: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
  })
}

export { startWebPanel }
