<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Mini Web DJ Mixer</title>
<style>
body { font-family:sans-serif; background:#111; color:white; padding:20px; }
.slider { width:300px; }
button { margin:5px; }
canvas { background:#222; display:block; margin:10px 0; }
</style>
</head>
<body>

<h2>Mini Web DJ Mixer</h2>

Track 1: <input type="file" id="track1"><br>
Track 2: <input type="file" id="track2"><br><br>

Crossfader: <input type="range" id="cross" class="slider" min="0" max="1" step="0.01" value="0.5"><br>
Pitch Track 1: <input type="range" id="pitch1" min="0.5" max="2" step="0.01" value="1"><br>
Pitch Track 2: <input type="range" id="pitch2" min="0.5" max="2" step="0.01" value="1"><br><br>

<button onclick="preview()">Preview</button>
<button onclick="exportMP3()">Export MP3</button><br><br>

<canvas id="waveform" width="600" height="100"></canvas>
<audio id="player" controls></audio>

<!-- Inclure lame.min.js localement ou via CDN -->
<script src="https://unpkg.com/lamejs@1.2.0/lame.min.js"></script>

<script>
const ctx = new (window.AudioContext || window.webkitAudioContext)();
let buffer1, buffer2;

async function loadFile(file){
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
}

// Afficher un waveform simple
function drawWave(){
    const canvas = document.getElementById("waveform");
    const ctx2 = canvas.getContext("2d");
    ctx2.clearRect(0,0,canvas.width,canvas.height);
    if(!buffer1 || !buffer2) return;

    const data1 = buffer1.getChannelData(0);
    const data2 = buffer2.getChannelData(0);
    const step = Math.floor(data1.length / canvas.width);

    ctx2.strokeStyle = "red";
    ctx2.beginPath();
    for(let i=0;i<canvas.width;i++){
        const v = data1[i*step]*50 + 50;
        ctx2.lineTo(i, canvas.height - v);
    }
    ctx2.stroke();

    ctx2.strokeStyle = "blue";
    ctx2.beginPath();
    for(let i=0;i<canvas.width;i++){
        const v = data2[i*step]*50 + 50;
        ctx2.lineTo(i, canvas.height - v);
    }
    ctx2.stroke();
}

// Preview mix
async function preview(){
    if(!track1.files[0] || !track2.files[0]) { alert("Select 2 tracks"); return; }

    buffer1 = await loadFile(track1.files[0]);
    buffer2 = await loadFile(track2.files[0]);

    drawWave();

    const source1 = ctx.createBufferSource();
    const source2 = ctx.createBufferSource();
    source1.buffer = buffer1;
    source2.buffer = buffer2;

    source1.playbackRate.value = parseFloat(document.getElementById('pitch1').value);
    source2.playbackRate.value = parseFloat(document.getElementById('pitch2').value);

    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    const cross = parseFloat(document.getElementById('cross').value);
    gain1.gain.value = 1 - cross;
    gain2.gain.value = cross;

    source1.connect(gain1).connect(ctx.destination);
    source2.connect(gain2).connect(ctx.destination);

    source1.start();
    source2.start();
}

// Export MP3
async function exportMP3(){
    if(!buffer1 || !buffer2) { alert("Preview first"); return; }

    const length = Math.max(buffer1.length, buffer2.length);
    const merged = new Float32Array(length);
    const pitch1 = parseFloat(document.getElementById('pitch1').value);
    const pitch2 = parseFloat(document.getElementById('pitch2').value);
    const cross = parseFloat(document.getElementById('cross').value);

    for(let i=0;i<length;i++){
        const s1 = buffer1.getChannelData(0)[Math.floor(i/pitch1)] || 0;
        const s2 = buffer2.getChannelData(0)[Math.floor(i/pitch2)] || 0;
        merged[i] = Math.max(-1, Math.min(1, s1*(1-cross)+s2*cross));
    }

    const mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128);
    const mp3Data = [];
    for(let i=0;i<merged.length;i+=1152){
        const chunk = merged.subarray(i,i+1152);
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
