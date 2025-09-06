// scripts_en.js
// English client script — uses img_en/, audio_en/, and /api/descrizione_en
let cards = [];
let chosen = 0;
const slots = ["Past", "Present", "Future"];   // UI labels
let chosenCards = [];

// --- Playback state ---
let isReading = false;
let audioEl = null;
let audioQueue = [];
let currentTrack = 0;
let playedAny = false;
let sectionsText = []; // plain-text sections for TTS fallback


// ---- Config (force English to avoid header/referrer ambiguity) ----
const API_CARDS = "/api/carte?lang=en";
const API_DESCRIPTION = (filename) => `/api/descrizione_en/${filename}`;
const IMG_DIR = "img_en";
const AUDIO_DIR = "audio_en";

// Load card list from backend
fetch(API_CARDS)
  .then(resp => {
    if (!resp.ok) throw new Error("Failed to load card list");
    return resp.json();
  })
  .then(data => {
    cards = data
      .sort(() => Math.random() - 0.5) // shuffle
      .map(c => ({
        name: c,
        reversed: Math.random() > 0.5
      }));
    renderDeck();
  })
  .catch(err => {
    console.error(err);
    const deck = document.getElementById("deck");
    if (deck) deck.innerHTML = "<p style='color:#b00'>Error loading deck.</p>";
  });

function renderDeck() {
  const deck = document.getElementById("deck");
  if (!deck) {
    console.warn("Missing #deck element");
    return;
  }
  deck.innerHTML = "";
  cards.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = "card-back";
    // If you have a different back image for EN, change dorso.jpeg accordingly
    div.innerHTML = `<img src="dorso.jpeg" style="width:100%; height:100%; border-radius:8px;">`;
    div.onclick = () => chooseCard(i);
    deck.appendChild(div);
  });
}

function chooseCard(index) {
  if (chosen >= 3) return; // max 3 picks
  const card = cards[index];

  const slotId = slots[chosen];
  const slot = document.getElementById(slotId.toLowerCase()); // html id is lowercase: past|present|future
  if (!slot) {
    console.warn("Missing slot:", slotId.toLowerCase());
    return;
  }

  slot.innerHTML = `<img src="${IMG_DIR}/${card.name}.jpeg" 
    style="max-width:100%; ${card.reversed ? 'transform: rotate(180deg);' : ''}">`;

  chosenCards.push({ ...card, position: slotId });

  const deckEl = document.getElementById("deck");
  if (deckEl && deckEl.children[index]) deckEl.children[index].style.visibility = "hidden";
  chosen++;

  if (chosen === 3) {
    const sect = document.getElementById("interpretation-section");
    if (sect) sect.style.display = "block";
    const btn = document.getElementById("interpret-btn");
    if (btn) btn.onclick = showInterpretation;
  }
}

// ====== ORDERED INTERPRETATION ======
async function showInterpretation() {
  if (isReading) return; // avoid double start

  const container = document.getElementById("interpretation");
  if (!container) return;
  container.innerHTML = "<h2>Interpretation</h2>";

  // clear previous queues
  audioQueue = [];
  currentTrack = 0;

  // iterate in the chosen order
  for (const card of chosenCards) {
    const filename = card.name + (card.reversed ? "_r" : "");
    try {
      // text on screen (markdown -> html)
      const resp = await fetch(API_DESCRIPTION(filename));
      if (!resp.ok) throw new Error("File not found");
      const md = await resp.text();

      const section = extractSection(md, card.position);
      const parsed = marked.parse(section);
      container.innerHTML += `<h3>${card.position}</h3>` + parsed;
      // keep plain text for TTS fallback
      sectionsText.push(htmlToText(parsed));

      // enqueue multiple audio filename candidates to be robust
      enqueueAudioCandidates(filename, card.position);

    } catch (err) {
      console.error("Description error:", err);
      container.innerHTML += `<h3>${card.position}</h3><p>No description found.</p>`;
      sectionsText.push("");
      enqueueAudioCandidates(filename, card.position);
    }
  }

  const dlBtn = document.getElementById("download-pdf-btn");
  if (dlBtn) {
    dlBtn.style.display = "inline-block";
    dlBtn.onclick = downloadPdf;
  }

  ensureControls();          // create Pause/Resume + New reading buttons
  await playAudioQueue();    // start sequential MP3 playback
}

function extractSection(md, position) {
  // Robust parser: supports headers like
  // "## Meaning in the Past/Present/Future" OR "## Past/Present/Future"
  // Returns the body of the matching section, or whole md as fallback.
  const posLower = position.toLowerCase();
  // Split by H2 (## ...)
  const parts = md.split(/\n(?=##\s+)/g);
  for (const part of parts) {
    // header line is the first after '## '
    const headerMatch = part.match(/^##\s*(.+)\s*$/m);
    const header = headerMatch ? headerMatch[1].trim().toLowerCase() : "";
    if (
      header === posLower ||
      header.startsWith(`meaning in the ${posLower}`) ||
      header.startsWith(`meaning in ${posLower}`) ||
      header.endsWith(posLower) // loose match, e.g., "Meaning — Past"
    ) {
      // remove the first header line
      return part.replace(/^##\s*.+\n/, "");
    }
  }
  return md; // fallback
}



// Build robust audio candidate list for a given card+position
function enqueueAudioCandidates(filename, position) {
  const base = encodeURIComponent(filename);
  const posCap = encodeURIComponent(position);           // Past | Present | Future
  const posLow = encodeURIComponent(position.toLowerCase()); // past | present | future

  const candidates = [
    // Your files use SINGLE underscore between base and position:
    `/${AUDIO_DIR}/${base}_${posCap}.mp3`,
    `/${AUDIO_DIR}/${base}_${posLow}.mp3`,

    // Keep support for the previous DOUBLE underscore pattern, just in case:
    `/${AUDIO_DIR}/${base}__${posCap}.mp3`,
    `/${AUDIO_DIR}/${base}__${posLow}.mp3`,

    // Fallback to a plain base name (no position)
    `/${AUDIO_DIR}/${base}.mp3`,
  ];

  candidates.forEach(u => audioQueue.push(u));
}


// Convert rendered HTML to plain text (for TTS)
function htmlToText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}
// ====== UI CONTROLS ======
function ensureControls() {
  const section = document.getElementById("interpretation-section");
  if (!section) return;

  // create hidden <audio> if not present
  audioEl = document.getElementById("tts-audio");
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.id = "tts-audio";
    audioEl.style.display = "none";
    section.appendChild(audioEl);
  }

  // track when any audio actually starts
  audioEl.onplay = () => { playedAny = true; };

  // when a track ends, move to next
  audioEl.onended = () => {
    currentTrack++;
    if (currentTrack < audioQueue.length) {
      audioEl.src = audioQueue[currentTrack];
      audioEl.play().catch(err => console.error("Playback failed:", err));
    } else {
      onAudioEnded();
      if ('speechSynthesis' in window) {
        try { speechSynthesis.cancel(); } catch(e) {}
      }
    }
  };

  // if a file fails to load (404, etc.), skip to next
  audioEl.onerror = () => {
    console.warn("Audio load error, skipping:", audioEl.src);
    audioEl.onended(); // reuse same advance logic
  };

  // Pause/Resume button
  let pauseBtn = document.getElementById("pause-btn");
  if (!pauseBtn) {
    pauseBtn = document.createElement("button");
    pauseBtn.id = "pause-btn";
    pauseBtn.textContent = "Pause";
    pauseBtn.style.marginRight = "8px";
    pauseBtn.onclick = togglePause;
    section.appendChild(pauseBtn);
  }
  pauseBtn.style.display = "inline-block";
  pauseBtn.textContent = "Pause";

  // New reading button
  let newBtn = document.getElementById("new-reading-btn");
  if (!newBtn) {
    newBtn = document.createElement("button");
    newBtn.id = "new-reading-btn";
    newBtn.textContent = "New reading";
    newBtn.onclick = () => { try { stopAudio(); } finally { resetReading(); } };
    section.appendChild(newBtn);
  }
}


function togglePause() {
  const pauseBtn = document.getElementById("pause-btn");
  // Handle TTS pause/resume if active
  if (!audioEl || (audioEl.paused && (window.speechSynthesis && speechSynthesis.speaking))) {
    if (window.speechSynthesis) {
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
        if (pauseBtn) pauseBtn.textContent = 'Pause';
      } else {
        speechSynthesis.pause();
        if (pauseBtn) pauseBtn.textContent = 'Resume';
      }
      return;
    }
  }
  if (!audioEl) return;
  if (audioEl.paused) {
    audioEl.play().catch(err => console.error("Resume failed:", err));
    if (pauseBtn) pauseBtn.textContent = "Pause";
  } else {
    audioEl.pause();
    if (pauseBtn) pauseBtn.textContent = "Resume";
  }
}



function onAudioEnded() {
  isReading = false;
  const interpretBtn = document.getElementById("interpret-btn");
  if (interpretBtn) interpretBtn.disabled = false;

  const pauseBtnEl = document.getElementById("pause-btn");
  if (pauseBtnEl) pauseBtnEl.style.display = "none";

  // If we never managed to play any MP3, fallback to Web Speech TTS
  if (!playedAny && sectionsText && sectionsText.length === 3 && 'speechSynthesis' in window) {
    startTTS();
  }
}



function stopAudio() {
  try {
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.src = "";
        audioEl.load();
      } catch (e) {
        console.warn("Stop audio error:", e);
      }
    }
    audioQueue = [];
    currentTrack = 0;
    isReading = false;
    try { onAudioEnded(); } catch (e) { console.warn("onAudioEnded error (ignored):", e); }
    if ('speechSynthesis' in window) {
      try { speechSynthesis.cancel(); } catch(e) {}
    }
  } catch (e) {
    console.warn("stopAudio outer error:", e);
  }
}



// ====== TTS FALLBACK (Web Speech API) ======
function startTTS() {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    // Pick an English voice if available
    let voices = synth.getVoices();
    // Some browsers load voices async
    if (!voices || voices.length === 0) {
      // try once after a delay
      setTimeout(startTTS, 250);
      return;
    }
    const enVoices = voices.filter(v => /^en(-|_|$)/i.test(v.lang));
    const voice = enVoices[0] || voices[0];

    const items = [
      { title: 'Past', text: sectionsText[0] || '' },
      { title: 'Present', text: sectionsText[1] || '' },
      { title: 'Future', text: sectionsText[2] || '' },
    ];

    // Compose utterances sequentially
    let i = 0;
    function speakNext() {
      if (i >= items.length) { return; }
      const { title, text } = items[i++];
      const u = new SpeechSynthesisUtterance(`${title}. ${text}`);
      u.voice = voice;
      u.lang = voice.lang || 'en-GB';
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onend = speakNext;
      synth.speak(u);
    }

    // Ensure Pause button controls TTS
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.style.display = 'inline-block';
      pauseBtn.textContent = 'Pause';
    }

    speakNext();
  } catch (e) {
    console.warn('TTS fallback failed:', e);
  }
}

// ====== RESET ======

function resetReading() {
  chosen = 0;
  chosenCards = [];
  sectionsText = [];
  playedAny = false;

  // clear slots
  slots.forEach(s => {
    const el = document.getElementById(s.toLowerCase());
    if (el) el.innerHTML = "";
  });

  // clear interpretation
  const interp = document.getElementById("interpretation");
  if (interp) interp.innerHTML = "";

  // hide interpretation section
  const sect = document.getElementById("interpretation-section");
  if (sect) sect.style.display = "none";

  // rebuild deck
  renderDeck();
}


// ====== SEQUENTIAL PLAYBACK OF STATIC MP3s ======
async function playAudioQueue() {
  const interpretBtn = document.getElementById("interpret-btn");
  if (interpretBtn) interpretBtn.disabled = true;
  isReading = true;

  try {
    ensureControls();
    currentTrack = 0;

    if (audioQueue.length === 0) {
      console.warn("No audio files in queue");
      onAudioEnded();
  if ('speechSynthesis' in window) {
    try { speechSynthesis.cancel(); } catch(e) {}
  }
      return;
    }

    audioEl.src = audioQueue[currentTrack];
    await audioEl.play();
  } catch (err) {
    console.error("Playback error:", err);
    stopAudio(); // restore UI
  }
}

async function downloadPdf() {
  if (!chosenCards || chosenCards.length !== 3) return;

  // 1) Build temporary DOM to convert
  const pdfEl = document.createElement("div");
  pdfEl.id = "pdf-doc";
  Object.assign(pdfEl.style, {
    padding: "24px",
    background: "#ffffff",
    // A4 width ~ 794px at 96dpi (8.27in)
    width: "794px",
    maxWidth: "794px",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
    color: "#222",
    lineHeight: "1.35"
  });

  // Styles for page-breaks and print rendering
  const style = document.createElement("style");
  style.textContent = `
    #pdf-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    #pdf-doc img { max-width: 100%; height: auto; }
    #pdf-doc .page-break { page-break-before: always; }
    #pdf-doc .avoid-break { page-break-inside: avoid; }
    #pdf-doc h1, #pdf-doc h2, #pdf-doc h3 { page-break-after: avoid; }
  `;
  pdfEl.appendChild(style);

  const dateStr = new Date().toLocaleString("en-GB");

  const cardsHtml = chosenCards.map(c => {
    const label = `${c.position} — ${niceName(c.name)} ${c.reversed ? "(reversed)" : "(upright)"}`;
    return `
      <div class="avoid-break" style="text-align:center; margin:0 8px 12px;">
        <div style="font-weight:600; margin-bottom:6px;">${label}</div>
        <img src="${IMG_DIR}/${c.name}.jpeg" style="${c.reversed ? "transform: rotate(180deg);" : ""}; width:180px;">
      </div>
    `;
  }).join("");

  // Take the interpretation as shown on screen
  const interpretationHtml = document.getElementById("interpretation")?.innerHTML || "";

  pdfEl.innerHTML += `
    <h1 style="text-align:center; margin:0 0 12px 0;">Tarot Reading</h1>
    <div style="text-align:center; font-size:12px; margin-bottom:14px;">Generated on ${dateStr}</div>

    <div class="avoid-break" style="display:flex; justify-content:center; gap:12px; margin:8px 0 14px 0; flex-wrap:wrap;">
      ${cardsHtml}
    </div>

    <hr style="margin:14px 0; border:none; border-top:1px solid #ccc;">

    <div id="pdf-interpretation">${interpretationHtml}</div>
  `;

  document.body.appendChild(pdfEl);

  // Force page-breaks before large internal headings (if any)
  pdfEl.querySelectorAll('#pdf-interpretation h2, #pdf-interpretation h3')
    .forEach((h, i) => {
      if (i > 0) {
        const br = document.createElement('div');
        br.className = 'page-break';
        h.parentNode.insertBefore(br, h);
      }
    });

  // 2) Wait for all images to load (cards + any images inside text)
  await waitForImages(pdfEl);

  // 3) Export with html2pdf enabling page-breaks
  const fileName = `tarot-reading_${new Date().toISOString().slice(0,10)}.pdf`;
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

// Helper: wait for all images inside a node
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
  // readable name ("the_fool" -> "The Fool")
  return fileBase
    .replace(/_/g, " ")
    .replace(/\b\w/g, m => m.toUpperCase());
}

// --- Visual pile effect (shuffle animation) ---
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
    collapseDuration = 420, // collapse phase
    expandDuration = 520,   // return phase
    easingOut = "cubic-bezier(.2,.7,.2,1)",
    easingIn = "cubic-bezier(.2,.7,.2,1)",
    stagger = 10,           // staggering between cards
    hold = 120,             // pause when stacked
    addTilt = true          // small random rotation for realism
  } = opts;

  const anchor = items[Math.max(0, Math.min(anchorIndex, items.length - 1))];

  // Save initial positions (viewport)
  const startRects = items.map(el => el.getBoundingClientRect());
  const anchorRect = anchor.getBoundingClientRect();

  isPileAnimating = true;
  const btn = document.getElementById("shuffle-btn");
  if (btn) btn.disabled = true;

  // --- Phase 1: collapse towards anchor card
  let collapsedCount = 0;

  items.forEach((el, i) => {
    const r = startRects[i];
    const dx = (anchorRect.left + anchorRect.width / 2) - (r.left + r.width / 2);
    const dy = (anchorRect.top + anchorRect.height / 2) - (r.top + r.height / 2);
    const rot = addTilt ? ((Math.random() * 2 - 1) * 5).toFixed(2) : 0; // ±5°

    el.style.willChange = "transform";
    el.style.pointerEvents = "none";
    // help stacking during flight
    if (!el.style.position) el.style.position = "relative";
    el.style.zIndex = String(100 + i);

    // set transition and destination (pile)
    el.style.transition = `transform ${collapseDuration}ms ${easingOut} ${i * stagger}ms`;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;

    const onCollapseEnd = (ev) => {
      if (ev.propertyName !== "transform") return;
      el.removeEventListener("transitionend", onCollapseEnd);
      collapsedCount++;

      if (collapsedCount === items.length) {
        // --- Short pause when all stacked
        setTimeout(() => {
          // --- Phase 2: smooth return to original positions
          let returned = 0;
          items.forEach((el2, j) => {
            el2.style.transition = `transform ${expandDuration}ms ${easingIn} ${j * stagger}ms`;
            el2.style.transform = "translate(0px, 0px) rotate(0deg)";

            const onExpandEnd = (e2) => {
              if (e2.propertyName !== "transform") return;
              el2.removeEventListener("transitionend", onExpandEnd);
              // cleanup
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

// Wire existing button to this effect
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
