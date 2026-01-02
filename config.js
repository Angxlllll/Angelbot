const config = {
  nombrebot: 'Meow WaBot',
  moneda: '$ᴅᴏʟᴀʀᴇs',
  apikey: '', // Pon tu apikey aqui, consiguela en: https://api-adonix.ultraplus.click
  prefijo: '.',

  owner: [
    '159606034665538@lid',
    '50493732693@s.whatsapp.net',
    '51921826291@s.whatsapp.net'
  ],

  restrict: false
}

try {
  if (!globalThis.nombrebot) globalThis.nombrebot = config.nombrebot
  if (!globalThis.moneda) globalThis.moneda = config.moneda
  if (!globalThis.prefijo) globalThis.prefijo = config.prefijo
  if (!globalThis.apikey) globalThis.apikey = config.apikey
} catch {}

export default config
