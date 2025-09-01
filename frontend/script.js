let cards = [];
let chosen = 0;
const slots = ["Passato", "Presente", "Futuro"];   // in italiano
let chosenCards = [];

// --- Stato riproduzione ---
let isReading = false;
let audioEl = null;

// Carica lista carte dal backend
fetch("/api/carte")
  .then(resp => resp.json())
  .then(data => {
    cards = data
      .sort(() => Math.random() - 0.5) // mischiate
      .map(c => ({
        name: c,
        reversed: Math.random() > 0.5
      }));
    renderDeck();
  });

function renderDeck() {
  const deck = document.getElementById("deck");
  deck.innerHTML = "";
  cards.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = "card-back";
    div.innerHTML = `<img src="dorso.jpeg" style="width:100%; height:100%; border-radius:8px;">`;
    div.onclick = () => chooseCard(i);
    deck.appendChild(div);
  });
}

function chooseCard(index) {
  if (chosen >= 3) return; // massimo 3 scelte
  const card = cards[index];

  const slotId = slots[chosen];
  const slot = document.getElementById(slotId.toLowerCase()); // id html in minuscolo
  slot.innerHTML = `<img src="img/${card.name}.jpeg" 
    style="max-width:100%; ${card.reversed ? 'transform: rotate(180deg);' : ''}">`;

  chosenCards.push({ ...card, position: slotId });

  document.getElementById("deck").children[index].style.visibility = "hidden";
  chosen++;

  if (chosen === 3) {
    document.getElementById("interpretation-section").style.display = "block";
    document.getElementById("interpret-btn").onclick = showInterpretation;
  }
}

// ====== INTERPRETAZIONE ORDINATA ======
async function showInterpretation() {
  if (isReading) return; // evita doppio avvio

  const container = document.getElementById("interpretation");
  container.innerHTML = "<h2>Interpretazione</h2>";

  let fullText = "";

  // percorriamo le carte in ordine scelto
  for (const card of chosenCards) {
    const filename = card.name + (card.reversed ? "_r" : "");
    try {
      const resp = await fetch(`/api/descrizione/${filename}`);
      if (!resp.ok) throw new Error("File non trovato");
      const md = await resp.text();

      const section = extractSection(md, card.position);
      const parsed = marked.parse(section);

      // Mostra a video
      container.innerHTML += `<h3>${card.position}</h3>` + parsed;

      // Prepara testo pulito per TTS
      const cleanSection = section
        .replace(/^---$/gm, "")   // elimina linee con ---
        .replace(/[#*_>`]/g, "")  // elimina simboli markdown
        .trim();

      fullText += `${card.position}. ${cleanSection}\n`;

    } catch (err) {
      console.error("Errore descrizione:", err);
      container.innerHTML += `<h3>${card.position}</h3><p>Nessuna descrizione trovata.</p>`;
    }
  }

  ensureControls();          // crea i pulsanti Pausa/Riprendi + Nuova lettura
  await speakText(fullText); // avvia lettura
}

function extractSection(md, position) {
  const parts = md.split(/##\s+Significato nel/);
  const match = parts.find(p => p.trim().startsWith(position));
  return match ? match.replace(/^.*?\n/, "") : md;
}

// ====== CONTROLLI UI ======
function ensureControls() {
  const section = document.getElementById("interpretation-section");

  // crea <audio> nascosto se non presente
  audioEl = document.getElementById("tts-audio");
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.id = "tts-audio";
    audioEl.style.display = "none";
    section.appendChild(audioEl);

    // fine riproduzione -> ripristina UI
    audioEl.addEventListener("ended", onAudioEnded);
  }

  // Pulsante Pausa/Riprendi
  let pauseBtn = document.getElementById("pause-btn");
  if (!pauseBtn) {
    pauseBtn = document.createElement("button");
    pauseBtn.id = "pause-btn";
    pauseBtn.textContent = "Pausa";
    pauseBtn.style.marginRight = "8px";
    pauseBtn.onclick = togglePause;
    section.appendChild(pauseBtn);
  }
  pauseBtn.style.display = "inline-block";
  pauseBtn.textContent = "Pausa";

  // Pulsante Nuova lettura
  let newBtn = document.getElementById("new-reading-btn");
  if (!newBtn) {
    newBtn = document.createElement("button");
    newBtn.id = "new-reading-btn";
    newBtn.textContent = "Nuova lettura";
    newBtn.onclick = () => { stopAudio(); resetReading(); };
    section.appendChild(newBtn);
  }
}

function togglePause() {
  if (!audioEl) return;
  const pauseBtn = document.getElementById("pause-btn");
  if (audioEl.paused) {
    audioEl.play().catch(err => console.error("Ripresa non riuscita:", err));
    pauseBtn.textContent = "Pausa";
  } else {
    audioEl.pause();
    pauseBtn.textContent = "Riprendi";
  }
}

function onAudioEnded() {
  isReading = false;
  const interpretBtn = document.getElementById("interpret-btn");
  if (interpretBtn) interpretBtn.disabled = false;

  const pauseBtn = document.getElementById("pause-btn");
  if (pauseBtn) pauseBtn.style.display = "none";
}

function stopAudio() {
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.src = "";
      audioEl.load();
    } catch (e) {
      console.warn("Errore stop audio:", e);
    }
  }
  onAudioEnded();
}

// ====== RESET ======
function resetReading() {
  chosen = 0;
  chosenCards = [];

  // svuota slot
  slots.forEach(s => {
    document.getElementById(s.toLowerCase()).innerHTML = "";
  });

  // svuota interpretazione
  document.getElementById("interpretation").innerHTML = "";

  // nascondi sezione interpretazione
  document.getElementById("interpretation-section").style.display = "none";

  // ricostruisci il mazzo
  renderDeck();
}

// ====== SINTESI + RIPRODUZIONE (Azure TTS -> MP3 -> <audio>) ======
async function speakText(text) {
  const interpretBtn = document.getElementById("interpret-btn");
  if (interpretBtn) interpretBtn.disabled = true;
  isReading = true;

  try {
    // 1) prendi token e regione dal tuo server
    const tk = await fetch("/api/token");
    if (!tk.ok) throw new Error("Token non ottenuto");
    const { token, region } = await tk.json();

    // 2) SSML per la voce italiana
    const ssml =
      `<speak version='1.0' xml:lang='it-IT'>
         <voice name='it-IT-ElsaNeural'>${escapeXml(text)}</voice>
       </speak>`;

    // 3) chiama endpoint TTS Azure per ottenere MP3
    const ttsResp = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"
      },
      body: ssml
    });

    if (!ttsResp.ok) {
      throw new Error(`Errore TTS Azure: ${ttsResp.status} ${ttsResp.statusText}`);
    }

    const arrayBuf = await ttsResp.arrayBuffer();
    const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    // 4) riproduci con <audio> (così Pausa/Riprendi funzionano)
    ensureControls();                 // assicura che audio/pulsanti esistano
    audioEl.src = url;
    await audioEl.play();

  } catch (err) {
    console.error("Errore durante la lettura:", err);
    stopAudio(); // ripristina UI
  }
}

// Escape semplice per l’SSML
function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
