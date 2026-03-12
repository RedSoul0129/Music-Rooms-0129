// server.js
const express = require('express');
const ytdl = require('ytdl-core');
const app = express();

app.use(express.static('public')); // Dossier contenant ton index.html

app.get('/api/audio', async (req, res) => {
    const url = req.query.url;
    if (!ytdl.validateURL(url)) return res.status(400).send('URL invalide');

    res.header('Content-Disposition', 'attachment; filename="audio.mp3"');
    // On extrait uniquement l'audio
    ytdl(url, { filter: 'audioonly' }).pipe(res);
});

app.listen(3000, () => console.log('Serveur DJ démarré sur le port 3000'));
