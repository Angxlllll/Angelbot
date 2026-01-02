import { exec } from 'child_process';
import util from 'util';
import config from '../config.js';

const execAsync = util.promisify(exec);

let handler = async (m, { conn }) => {
    const from = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const botNumber = conn.user.id.split(':')[0] + '@s.whatsapp.net';
    const ownerJids = config.owner.map(v =>
        v.includes('@') ? v : v.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    );
    const isOwner = ownerJids.includes(sender) || sender === botNumber;

    if (!isOwner) {
        return await conn.sendMessage(
            from,
            { text: '「✦」Este comando solo puede ser usado por el *dueño* del bot.' },
            { quoted: m }
        );
    }

    try {
        const { stdout, stderr } = await execAsync('git pull');
        let output = stdout || stderr || 'Sin cambios.';

        if (output.length > 4000) {
            output = output.slice(0, 4000) + '...';
        }

        await conn.sendMessage(from, {
            text: `「✦」Actualización realizada.
> ✐ Resultado »\n${output}`
        }, { quoted: m });


        setTimeout(() => {
            process.exit(0);
        }, 3000);

    } catch (e) {
        console.error(e);
        await conn.sendMessage(from, {
            text: `「✦」Error al actualizar.\n> ✐ ${e.message}`
        }, { quoted: m });
    }
};

handler.help = ['update'];
handler.tags = ['owner'];
handler.command = ['update'];

export default handler;