<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Mini Web DJ Mixer</title>
<style>
body { font-family: sans-serif; background: #111; color: white; padding: 20px; }
input, button { margin: 5px 0; }
.slider { width: 300px; }
canvas { background: #222; display: block; margin: 10px 0; }
</style>
</head>
<body>

<h2>Mini Web DJ Mixer</h2>

Track 1: <input type="file" id="track1"><br>
Track 2: <input type="file" id="track2"><br><br>

Crossfader: <input type="range" id="cross" class="slider" min="0" max="1" step="0.01" value="0.5"><br>

Pitch Track 1: <input type="range" id="pitch1" class="slider" min="0.5" max="2" step="0.01" value="1"><br>
Pitch Track 2: <input type="range" id="pitch2" class="slider" min="0.5" max="2" step="0.01" value="1"><br><br>

<button onclick="preview()">Preview</button>
<button onclick="exportMP3()">Export MP3</button><br><br>

<canvas id="waveform" width="600" height="100"></canvas>
<audio id="player" controls></audio>

<!-- LameJS pour encoder MP3 -->
<script src="https://unpkg.com/lamejs@1.2.0/lame.min.js"></script>

<script>
const ctx = new (window.AudioContext || window.webkitAudioContext)();
let buffer1, buffer2;

// Charge un fichier audio local
async function loadFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
}

// Dessine deux waveforms (rouge = piste 1, bleu = piste 2)
function drawWave() {
    const canvas = document.getElementById("waveform");
    const ctx2 = canvas.getContext("2d");
    ctx2.clearRect(0,0,canvas.width,canvas.height);

    if (!buffer1 || !buffer2) return;

    const d1 = buffer1.getChannelData(0);
    const d2 = buffer2.getChannelData(0);
    const step1 = Math.floor(d1.length / canvas.width);
    const step2 = Math.floor(d2.length / canvas.width);

    ctx2.strokeStyle = "red";
    ctx2.beginPath();
    for (let i = 0; i < canvas.width; i++) {
        const v = (d1[i * step1] * 0.5 + 0.5) * canvas.height;
        ctx2.lineTo(i, canvas.height - v);
    }
    ctx2.stroke();

    ctx2.strokeStyle = "blue";
    ctx2.beginPath();
    for (let i = 0; i < canvas.width; i++) {
        const v = (d2[i * step2] * 0.5 + 0.5) * canvas.height;
        ctx2.lineTo(i, canvas.height - v);
    }
    ctx2.stroke();
}

// Prévisualisation du mix
async function preview() {
    if (!track1.files[0] || !track2.files[0]) {
        alert("Sélectionne deux pistes !");
        return;
    }

    buffer1 = await loadFile(track1.files[0]);
    buffer2 = await loadFile(track2.files[0]);

    drawWave();

    const s1 = ctx.createBufferSource();
    const s2 = ctx.createBufferSource();

    s1.buffer = buffer1;
    s2.buffer = buffer2;

    s1.playbackRate.value = parseFloat(pitch1.value);
    s2.playbackRate.value = parseFloat(pitch2.value);

    const g1 = ctx.createGain();
    const g2 = ctx.createGain();

    const cross = parseFloat(document.getElementById("cross").value);
    g1.gain.value = 1 - cross;
    g2.gain.value = cross;

    s1.connect(g1).connect(ctx.destination);
    s2.connect(g2).connect(ctx.destination);

    s1.start();
    s2.start();
}

// Export MP3 via LameJS
async function exportMP3() {
    if (!buffer1 || !buffer2) {
        alert("Fais d’abord Preview !");
        return;
    }

    const length = Math.max(buffer1.length, buffer2.length);
    const merged = new Float32Array(length);

    const p1 = parseFloat(pitch1.value);
    const p2 = parseFloat(pitch2.value);
    const cross = parseFloat(document.getElementById("cross").value);

    for (let i = 0; i < length; i++) {
        const v1 = buffer1.getChannelData(0)[Math.floor(i / p1)] || 0;
        const v2 = buffer2.getChannelData(0)[Math.floor(i / p2)] || 0;
        merged[i] = Math.max(-1, Math.min(1, v1 * (1 - cross) + v2 * cross));
    }

    // Encode en MP3
    const encoder = new lamejs.Mp3Encoder(1, 44100, 128);
    const mp3Data = [];

    for (let i = 0; i < merged.length; i += 1152) {
        const chunk = merged.subarray(i, i + 1152);
        let mp3buf = encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    const endBuf = encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    const blob = new Blob(mp3Data, { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "mix.mp3";
    a.click();
}
</script>

</body>
</html>
