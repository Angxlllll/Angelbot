export function unwrapMessage(m) {
  let msg =
    m?.message ||
    m?.message?.ephemeralMessage?.message ||
    m?.message?.viewOnceMessage?.message ||
    m?.message?.viewOnceMessageV2?.message ||
    m?.message?.viewOnceMessageV2Extension?.message ||
    null

  for (let i = 0; i < 6; i++) {
    const next =
      msg?.ephemeralMessage?.message ||
      msg?.viewOnceMessage?.message ||
      msg?.viewOnceMessageV2?.message ||
      msg?.viewOnceMessageV2Extension?.message
    if (!next) break
    msg = next
  }
  return msg
}