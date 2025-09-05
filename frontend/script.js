let cards = [];
let chosen = 0;
const slots = ["Passato", "Presente", "Futuro"];   // in italiano
let chosenCards = [];

// --- Stato riproduzione ---
let isReading = false;
let audioEl = null;
let audioQueue = [];
let currentTrack = 0;

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

  // svuota eventuali code precedenti
  audioQueue = [];
  currentTrack = 0;

  // percorriamo le carte in ordine scelto
  for (const card of chosenCards) {
    const filename = card.name + (card.reversed ? "_r" : "");
    try {
      // testo a schermo (markdown -> html)
      const resp = await fetch(`/api/descrizione/${filename}`);
      if (!resp.ok) throw new Error("File non trovato");
      const md = await resp.text();

      const section = extractSection(md, card.position);
      const parsed = marked.parse(section);
      container.innerHTML += `<h3>${card.position}</h3>` + parsed;

      // audio: /audio/<nome>[_r]__<Posizione>.mp3
      const audioUrl = `/audio/${encodeURIComponent(filename)}__${encodeURIComponent(card.position)}.mp3`;
      audioQueue.push(audioUrl);

    } catch (err) {
      console.error("Errore descrizione:", err);
      container.innerHTML += `<h3>${card.position}</h3><p>Nessuna descrizione trovata.</p>`;
      // anche se manca la descrizione, proviamo comunque a riprodurre l'audio se esiste
      const fallbackUrl = `/audio/${encodeURIComponent(filename)}__${encodeURIComponent(card.position)}.mp3`;
      audioQueue.push(fallbackUrl);
    }
  }

  ensureControls();          // crea i pulsanti Pausa/Riprendi + Nuova lettura
  await playAudioQueue();    // avvia riproduzione sequenziale MP3
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
  }

  // handler: quando finisce una traccia, passa alla successiva
  audioEl.onended = () => {
    currentTrack++;
    if (currentTrack < audioQueue.length) {
      audioEl.src = audioQueue[currentTrack];
      audioEl.play().catch(err => console.error("Riproduzione non riuscita:", err));
    } else {
      onAudioEnded();
    }
  };

  // se un file non si carica (404, ecc.), salta al prossimo
  audioEl.onerror = () => {
    console.warn("Errore caricamento audio, salto al prossimo:", audioEl.src);
    audioEl.onended(); // riusa la stessa logica di avanzamento
  };

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
  audioQueue = [];
  currentTrack = 0;
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

// ====== RIPRODUZIONE SEQUENZIALE DI MP3 STATICI ======
async function playAudioQueue() {
  const interpretBtn = document.getElementById("interpret-btn");
  if (interpretBtn) interpretBtn.disabled = true;
  isReading = true;

  try {
    ensureControls();
    currentTrack = 0;

    if (audioQueue.length === 0) {
      console.warn("Nessun file audio in coda");
      onAudioEnded();
      return;
    }

    audioEl.src = audioQueue[currentTrack];
    await audioEl.play();
  } catch (err) {
    console.error("Errore durante la riproduzione:", err);
    stopAudio(); // ripristina UI
  }
}
