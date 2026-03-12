<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Pro Web DJ Mixer</title>
<style>
body { font-family:sans-serif; background:#111; color:white; padding:20px; }
.slider { width:300px; }
button { margin:5px; }
canvas { background:#222; display:block; margin:10px 0; }
</style>
</head>
<body>

<h2>Pro Web DJ Mixer</h2>

<input type="file" id="track1"> Track 1<br>
<input type="file" id="track2"> Track 2<br><br>

Crossfader: <input type="range" id="cross" class="slider" min="0" max="1" step="0.01" value="0.5"><br>
Pitch Track 1: <input type="range" id="pitch1" min="0.5" max="2" step="0.01" value="1"><br>
Pitch Track 2: <input type="range" id="pitch2" min="0.5" max="2" step="0.01" value="1"><br><br>

<button onclick="preview()">Preview</button>
<button onclick="autoAlign()">Auto Align</button>
<button onclick="exportMP3()">Export MP3</button><br><br>

<canvas id="waveform" width="600" height="100"></canvas>
<audio id="player" controls></audio>

<script src="lame.min.js"></script>
<script>
const ctx = new (window.AudioContext || window.webkitAudioContext)();
let buffer1, buffer2;

async function loadFile(file){
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
}

// Waveform simple
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

// Auto-align basé sur corrélation simple
function autoAlign(){
    if(!buffer1 || !buffer2) return alert("Load tracks first");

    const len = Math.min(buffer1.length, buffer2.length);
    let bestOffset = 0;
    let maxCorr = -Infinity;

    for(let offset = -10000; offset<=10000; offset+=500){
        let corr = 0;
        for(let i=0;i<len;i+=100){
            const j = i+offset;
            if(j<0 || j>=len) continue;
            corr += buffer1.getChannelData(0)[i]*buffer2.getChannelData(0)[j];
        }
        if(corr>maxCorr){ maxCorr=corr; bestOffset=offset; }
    }

    alert("Best alignment offset: "+bestOffset+" samples");
    // Ici tu peux appliquer l'offset à buffer2 pour mixer parfaitement
}

// Export MP3
async function exportMP3(){
    if(!buffer1 || !buffer2) { alert("Preview first"); return; }

    const length = Math.max(buffer1.length, buffer2.length);
    const mergedL = new Float32Array(length);
    const mergedR = new Float32Array(length);

    const pitch1 = parseFloat(document.getElementById('pitch1').value);
    const pitch2 = parseFloat(document.getElementById('pitch2').value);
    const cross = parseFloat(document.getElementById('cross').value);

    for(let i=0;i<length;i++){
        const s1 = buffer1.getChannelData(0)[Math.floor(i/pitch1)] || 0;
        const s2 = buffer2.getChannelData(0)[Math.floor(i/pitch2)] || 0;
        mergedL[i] = Math.max(-1, Math.min(1, s1*(1-cross) + s2*cross));
        mergedR[i] = mergedL[i]; // stéréo simple
    }

    const mp3encoder = new lamejs.Mp3Encoder(2, 44100, 128);
    const mp3Data = [];
    for(let i=0;i<mergedL.length;i+=1152){
        const left = mergedL.subarray(i,i+1152);
        const right = mergedR.subarray(i,i+1152);
        const mp3buf = mp3encoder.encodeBuffer(left,right);
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
