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
const dlBtn = document.getElementById("download-pdf-btn");
if (dlBtn) {
  dlBtn.style.display = "inline-block";
  dlBtn.onclick = downloadPdf;
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
async function downloadPdf() {
  if (!chosenCards || chosenCards.length !== 3) return;

  // 1) Costruisco il DOM temporaneo da convertire
  const pdfEl = document.createElement("div");
  pdfEl.id = "pdf-doc";
  Object.assign(pdfEl.style, {
    padding: "24px",
    background: "#ffffff",
    // larghezza A4 ~ 794px a 96dpi (8.27in)
    width: "794px",
    maxWidth: "794px",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
    color: "#222",
    lineHeight: "1.35"
  });

  // Stili utili per i page-break e resa stampa
  const style = document.createElement("style");
  style.textContent = `
    #pdf-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    #pdf-doc img { max-width: 100%; height: auto; }
    #pdf-doc .page-break { page-break-before: always; }
    #pdf-doc .avoid-break { page-break-inside: avoid; }
    #pdf-doc h1, #pdf-doc h2, #pdf-doc h3 { page-break-after: avoid; }
  `;
  pdfEl.appendChild(style);

  const dateStr = new Date().toLocaleString("it-IT");

  const cardsHtml = chosenCards.map(c => {
    const label = `${c.position} — ${niceName(c.name)} ${c.reversed ? "(rovesciata)" : "(diritta)"}`;
    return `
      <div class="avoid-break" style="text-align:center; margin:0 8px 12px;">
        <div style="font-weight:600; margin-bottom:6px;">${label}</div>
        <img src="img/${c.name}.jpeg" style="${c.reversed ? "transform: rotate(180deg);" : ""}; width:180px;">
      </div>
    `;
  }).join("");

  // Prendo l'interpretazione così com'è a schermo
  const interpretationHtml = document.getElementById("interpretation")?.innerHTML || "";

  pdfEl.innerHTML += `
    <h1 style="text-align:center; margin:0 0 12px 0;">Lettura dei Tarocchi</h1>
    <div style="text-align:center; font-size:12px; margin-bottom:14px;">Generata il ${dateStr}</div>

    <div class="avoid-break" style="display:flex; justify-content:center; gap:12px; margin:8px 0 14px 0; flex-wrap:wrap;">
      ${cardsHtml}
    </div>

    <hr style="margin:14px 0; border:none; border-top:1px solid #ccc;">

    <div id="pdf-interpretation">${interpretationHtml}</div>
  `;

  document.body.appendChild(pdfEl);

  // Forza un page-break prima di grossi titoli interni (se presenti)
  pdfEl.querySelectorAll('#pdf-interpretation h2, #pdf-interpretation h3')
    .forEach((h, i) => {
      if (i > 0) {
        const br = document.createElement('div');
        br.className = 'page-break';
        h.parentNode.insertBefore(br, h);
      }
    });

  // 2) Aspetto il caricamento di tutte le immagini (carte + eventuali immagini nel testo)
  await waitForImages(pdfEl);

  // 3) Esporto con html2pdf abilitando i page-break
  const fileName = `lettura-tarocchi_${new Date().toISOString().slice(0,10)}.pdf`;
  const opt = {
    margin: [10, 10, 10, 10],
    filename: fileName,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, scrollY: 0, backgroundColor: "#ffffff" },
    jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".avoid-break"] }
  };

  try {
    await html2pdf().set(opt).from(pdfEl).save();
  } finally {
    pdfEl.remove();
  }
}

// Helper: attende il caricamento di tutte le immagini dentro un nodo
function waitForImages(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(
    imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
      img.onload = img.onerror = () => res();
    }))
  );
}

function niceName(fileBase) {
  return fileBase.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}


function niceName(fileBase) {
  // opzionale: rende più leggibile il nome file ("il_matto" -> "Il Matto")
  return fileBase
    .replace(/_/g, " ")
    .replace(/\b\w/g, m => m.toUpperCase());
}
// --- Effetto grafico "pila su una carta e ritorno" ---
let isPileAnimating = false;

function getDeckContainer() {
  return document.getElementById("deck");
}
function getDeckItems() {
  const deck = getDeckContainer();
  return deck ? Array.from(deck.children) : [];
}

function pileEffect(anchorIndex = 0, opts = {}) {
  if (isPileAnimating) return;

  const container = getDeckContainer();
  const items = getDeckItems();
  if (!container || items.length < 2) return;

  const {
    collapseDuration = 420, // ms: fase di “collasso”
    expandDuration = 520,   // ms: fase di ritorno
    easingOut = "cubic-bezier(.2,.7,.2,1)",
    easingIn = "cubic-bezier(.2,.7,.2,1)",
    stagger = 10,           // ms: scaglionamento tra carte
    hold = 120,             // ms: pausa quando sono sovrapposte
    addTilt = true          // piccola rotazione casuale per realismo
  } = opts;

  const anchor = items[Math.max(0, Math.min(anchorIndex, items.length - 1))];

  // Salviamo le posizioni iniziali (viewport)
  const startRects = items.map(el => el.getBoundingClientRect());
  const anchorRect = anchor.getBoundingClientRect();

  isPileAnimating = true;
  const btn = document.getElementById("shuffle-btn");
  if (btn) btn.disabled = true;

  // --- Fase 1: collasso verso la carta "ancora"
  let collapsedCount = 0;

  items.forEach((el, i) => {
    const r = startRects[i];
    const dx = (anchorRect.left + anchorRect.width / 2) - (r.left + r.width / 2);
    const dy = (anchorRect.top + anchorRect.height / 2) - (r.top + r.height / 2);
    const rot = addTilt ? ((Math.random() * 2 - 1) * 5).toFixed(2) : 0; // ±5°

    el.style.willChange = "transform";
    el.style.pointerEvents = "none";
    // aiutiamo lo stacking durante il volo
    if (!el.style.position) el.style.position = "relative";
    el.style.zIndex = String(100 + i);

    // Impostiamo transizione e destinazione (pila)
    el.style.transition = `transform ${collapseDuration}ms ${easingOut} ${i * stagger}ms`;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;

    const onCollapseEnd = (ev) => {
      if (ev.propertyName !== "transform") return;
      el.removeEventListener("transitionend", onCollapseEnd);
      collapsedCount++;

      if (collapsedCount === items.length) {
        // --- Pausa breve quando sono tutte sovrapposte
        setTimeout(() => {
          // --- Fase 2: ritorno morbido alle posizioni originali
          let returned = 0;
          items.forEach((el2, j) => {
            el2.style.transition = `transform ${expandDuration}ms ${easingIn} ${j * stagger}ms`;
            el2.style.transform = "translate(0px, 0px) rotate(0deg)";

            const onExpandEnd = (e2) => {
              if (e2.propertyName !== "transform") return;
              el2.removeEventListener("transitionend", onExpandEnd);
              // pulizia
              el2.style.transition = "";
              el2.style.transform = "";
              el2.style.willChange = "";
              el2.style.pointerEvents = "";
              el2.style.zIndex = "";

              returned++;
              if (returned === items.length) {
                isPileAnimating = false;
                if (btn) btn.disabled = false;
              }
            };
            el2.addEventListener("transitionend", onExpandEnd);
          });
        }, hold);
      }
    };
    el.addEventListener("transitionend", onCollapseEnd);
  });
}

// Collega il pulsante esistente a questo effetto
(function wirePileButton(){
  const btn = document.getElementById("shuffle-btn");
  if (!btn) return;
  btn.onclick = () => pileEffect(0, {
    collapseDuration: 420,
    expandDuration: 520,
    stagger: 10,
    hold: 120,
    addTilt: true
  });
})();
