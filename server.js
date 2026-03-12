<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Web DJ Mixer</title>
<script src="https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js"></script>
<style>
body { font-family: sans-serif; background:#111; color:white; padding:20px; }
.slider { width: 300px; }
button { margin: 5px; }
</style>
</head>
<body>

<h2>Web DJ Mixer</h2>

<!-- Upload des deux pistes -->
Track 1: <input type="file" id="track1"><br>
Track 2: <input type="file" id="track2"><br><br>

Crossfader: <input type="range" id="cross" class="slider" min="0" max="1" step="0.01" value="0.5"><br><br>

Pitch Track 1: <input type="range" id="pitch1" min="0.5" max="2" step="0.01" value="1"><br>
Pitch Track 2: <input type="range" id="pitch2" min="0.5" max="2" step="0.01" value="1"><br><br>

<button onclick="preview()">Preview</button>
<button onclick="autoAlign()">Auto Align</button>
<button onclick="exportMP3()">Export MP3</button><br><br>

<audio id="player" controls></audio>

<script>
const ctx = new (window.AudioContext || window.webkitAudioContext)();
let buffer1, buffer2;

async function loadFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
}

// Crossfader mix
function getCrossGain() {
    return parseFloat(document.getElementById('cross').value);
}

// Preview mix
async function preview() {
    if(!track1.files[0] || !track2.files[0]) { alert("Select 2 tracks"); return; }

    buffer1 = await loadFile(track1.files[0]);
    buffer2 = await loadFile(track2.files[0]);

    const source1 = ctx.createBufferSource();
    const source2 = ctx.createBufferSource();

    source1.buffer = buffer1;
    source2.buffer = buffer2;

    source1.playbackRate.value = parseFloat(document.getElementById('pitch1').value);
    source2.playbackRate.value = parseFloat(document.getElementById('pitch2').value);

    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    const cross = getCrossGain();
    gain1.gain.value = 1 - cross;
    gain2.gain.value = cross;

    source1.connect(gain1).connect(ctx.destination);
    source2.connect(gain2).connect(ctx.destination);

    source1.start();
    source2.start();
}

// Simple auto-align (aligne le début des 2 pistes)
function autoAlign() {
    alert("Auto-align: currently aligns track start. Full BPM sync requires Meyda/analysis.");
}

// Export mix en MP3
async function exportMP3() {
    if(!buffer1 || !buffer2) { alert("Preview first"); return; }

    // Merge pistes (simple addition sample par sample, clipping possible)
    const length = Math.max(buffer1.length, buffer2.length);
    const merged = new Float32Array(length);

    const pitch1 = parseFloat(document.getElementById('pitch1').value);
    const pitch2 = parseFloat(document.getElementById('pitch2').value);

    for(let i=0;i<length;i++){
        const sample1 = buffer1.getChannelData(0)[Math.floor(i/pitch1)] || 0;
        const sample2 = buffer2.getChannelData(0)[Math.floor(i/pitch2)] || 0;
        merged[i] = Math.max(-1, Math.min(1, sample1 + sample2));
    }

    // Encode MP3
    const mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128);
    const samples = merged;
    const mp3Data = [];
    let remaining = samples.length;

    for(let i=0; i<samples.length; i+=1152){
        const chunk = samples.subarray(i, i+1152);
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if(mp3buf.length>0) mp3Data.push(mp3buf);
    }

    const mp3buf = mp3encoder.flush();
    if(mp3buf.length>0) mp3Data.push(mp3buf);

    const blob = new Blob(mp3Data, {type:'audio/mp3'});
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'mix.mp3';
    a.click();
}
</script>

</body>
</html>
