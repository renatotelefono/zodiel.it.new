let cards = [];
let chosen = 0;
const slots = ["Passato", "Presente", "Futuro"];   // in italiano
let chosenCards = [];

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

function showInterpretation() {
  const container = document.getElementById("interpretation");
  container.innerHTML = "<h2>Interpretazione</h2>";

  let fullText = ""; // accumula il testo da leggere

  chosenCards.forEach((card, idx) => {
    const filename = card.name + (card.reversed ? "_r" : "");
    fetch(`/api/descrizione/${filename}`)
      .then(resp => resp.text())
      .then(md => {
        const section = extractSection(md, card.position);
        const parsed = marked.parse(section);

        container.innerHTML += `<h3>${card.position}</h3>` + parsed;

        // aggiungiamo testo pulito per TTS
        fullText += `${card.position}. ${section}\n`;

        // quando l'ultima carta è caricata → avvia TTS
        if (idx === chosenCards.length - 1) {
          setTimeout(() => speakText(fullText), 500);
        }
      })
      .catch(() => {
        container.innerHTML += `<h3>${card.position}</h3><p>Nessuna descrizione trovata.</p>`;
      });
  });
}

function extractSection(md, position) {
  const parts = md.split(/##\s+Significato nel/);
  const match = parts.find(p => p.trim().startsWith(position));
  return match ? match.replace(/^.*?\n/, "") : md;
}

// ====== AZURE TTS ======
async function speakText(text) {
  try {
    // chiedi token temporaneo al backend
    const resp = await fetch("/api/token");
    const { token, region } = await resp.json();

    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
    speechConfig.speechSynthesisVoiceName = "it-IT-ElsaNeural"; // voce italiana (puoi cambiarla)

    const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);

    synthesizer.speakTextAsync(
      text,
      result => {
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          console.log("✅ Sintesi completata");
        } else {
          console.error("Errore TTS:", result.errorDetails);
        }
        synthesizer.close();
      },
      err => {
        console.error("Errore TTS:", err);
        synthesizer.close();
      }
    );
  } catch (err) {
    console.error("Errore richiesta token:", err);
  }
}
