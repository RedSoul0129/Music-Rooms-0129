<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>YouTube Mixer</title>
<style>
body { font-family: Arial; padding:20px; }
.controls { margin:10px 0; }
</style>
</head>

<body>

<h2>YouTube Audio Mixer</h2>

<div class="controls">
Video 1 URL:
<input id="url1" placeholder="YouTube URL">
</div>

<div class="controls">
Video 2 URL:
<input id="url2" placeholder="YouTube URL">
</div>

<div class="controls">
Priority:
<select id="priority">
<option value="1">Song 1</option>
<option value="2">Song 2</option>
</select>
</div>

<div class="controls">
Pitch:
<input id="pitch" type="range" min="0.5" max="2" step="0.01" value="1">
</div>

<button onclick="previewMix()">Preview Mix</button>
<button onclick="exportMix()">Export</button>

<audio id="preview" controls></audio>

<script>

let audioCtx = new AudioContext();
let source1, source2;
let buffer1, buffer2;

async function loadAudio(url) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
}

async function previewMix() {

    let url1 = document.getElementById("url1").value;
    let url2 = document.getElementById("url2").value;

    buffer1 = await loadAudio(url1);
    buffer2 = await loadAudio(url2);

    source1 = audioCtx.createBufferSource();
    source2 = audioCtx.createBufferSource();

    source1.buffer = buffer1;
    source2.buffer = buffer2;

    let gain1 = audioCtx.createGain();
    let gain2 = audioCtx.createGain();

    let priority = document.getElementById("priority").value;

    if(priority == "1"){
        gain1.gain.value = 1;
        gain2.gain.value = 0.5;
    } else {
        gain1.gain.value = 0.5;
        gain2.gain.value = 1;
    }

    let pitch = document.getElementById("pitch").value;

    source1.playbackRate.value = pitch;
    source2.playbackRate.value = pitch;

    source1.connect(gain1).connect(audioCtx.destination);
    source2.connect(gain2).connect(audioCtx.destination);

    source1.start();
    source2.start();
}

async function exportMix(){

    const dest = audioCtx.createMediaStreamDestination();

    let recorder = new MediaRecorder(dest.stream);
    let chunks = [];

    recorder.ondataavailable = e => chunks.push(e.data);

    recorder.onstop = e => {

        let blob = new Blob(chunks, {type:"audio/wav"});
        let url = URL.createObjectURL(blob);

        let a = document.createElement("a");
        a.href = url;
        a.download = "mix.wav";
        a.click();
    };

    source1.connect(dest);
    source2.connect(dest);

    recorder.start();

    setTimeout(()=>{
        recorder.stop();
    },10000);

}

</script>

</body>
</html>
