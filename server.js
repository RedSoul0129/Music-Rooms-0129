// Export MP3 via LameJS corrigé
async function exportMP3() {
    if (!buffer1 || !buffer2) {
        alert("Fais d’abord Preview pour charger les pistes !");
        return;
    }

    // Récupération sécurisée des valeurs
    const p1 = parseFloat(document.getElementById("pitch1").value);
    const p2 = parseFloat(document.getElementById("pitch2").value);
    const cross = parseFloat(document.getElementById("cross").value);

    // Calcul de la vraie durée de l'export en fonction des pitchs
    const len1 = Math.floor(buffer1.length / p1);
    const len2 = Math.floor(buffer2.length / p2);
    const length = Math.max(len1, len2);

    // LameJS a besoin d'entiers 16-bits (Int16Array), PAS de Float32Array !
    const mergedInt16 = new Int16Array(length);

    const d1 = buffer1.getChannelData(0);
    const d2 = buffer2.getChannelData(0);

    for (let i = 0; i < length; i++) {
        // Calcul du bon index en fonction du pitch (multiplication, pas division)
        const idx1 = Math.floor(i * p1);
        const idx2 = Math.floor(i * p2);

        const v1 = idx1 < d1.length ? d1[idx1] : 0;
        const v2 = idx2 < d2.length ? d2[idx2] : 0;

        // Mixage avec le crossfader
        let floatSample = (v1 * (1 - cross)) + (v2 * cross);

        // Écrêtage (clamping) pour éviter la saturation (clipping)
        floatSample = Math.max(-1, Math.min(1, floatSample));

        // Conversion Float32 (-1.0 à 1.0) vers Int16 (-32768 à 32767)
        mergedInt16[i] = floatSample < 0 ? floatSample * 32768 : floatSample * 32767;
    }

    // Encode en MP3 (Mono, 44100Hz, 128kbps)
    const encoder = new lamejs.Mp3Encoder(1, 44100, 128);
    const mp3Data = [];

    // LameJS préfère encoder par blocs (chunks)
    for (let i = 0; i < mergedInt16.length; i += 1152) {
        const chunk = mergedInt16.subarray(i, i + 1152);
        let mp3buf = encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    const endBuf = encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    const blob = new Blob(mp3Data, { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "Mon_Super_Mix.mp3";
    a.click();
    
    // Nettoyage de l'URL pour la mémoire
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
