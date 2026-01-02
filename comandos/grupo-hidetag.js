let handler = async (m, { conn, args }) => {
  try {
    if (!m.isGroup)
      return conn.reply(m.chat, '⚠️ Este comando solo funciona en grupos.', m);

    // Texto después del comando
    const text = (args.join(' ') || '').trim();

    // Participantes
    const meta = await conn.groupMetadata(m.chat);
    const botId = conn.user?.id || conn.user?.jid;
    const mentions = meta.participants.map(p => p.id).filter(id => id !== botId);

    // --- Detectar mensaje citado en cualquier estructura ---
    const quoted =
      m.quoted?.fakeObj ||
      m.quoted ||
      m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
      m.msg?.contextInfo?.quotedMessage ||
      null;

    // Enviar aviso 📣
    await conn.sendMessage(m.chat, {
      text: '📣 *Notificación:* mensaje reenviado',
      mentions,
    }, { quoted: m });

    // === CASO 1: Hay mensaje citado ===
    if (quoted) {
      await conn.sendMessage(m.chat, { forward: quoted }, { quoted: m });
      if (text) await conn.sendMessage(m.chat, { text }, { quoted: m });
      return;
    }

    // === CASO 2: Solo texto ===
    if (text) {
      await conn.sendMessage(m.chat, { text }, { quoted: m });
      return;
    }

    // === CASO 3: Nada ===
    await conn.reply(m.chat, '❌ No hay nada para reenviar.', m);

  } catch (err) {
    console.error('Error en .n:', err);
    await conn.reply(m.chat, '❌ Ocurrió un error al reenviar.\n' + err.message, m);
  }
};

handler.command = ['n'];

export default handler;