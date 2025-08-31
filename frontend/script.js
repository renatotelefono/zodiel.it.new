let cards = [];
let chosen = 0;
const slots = ["Passato", "Presente", "Futuro"];
let chosenCards = []; // memorizza le 3 carte scelte

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
  const slot = document.getElementById(slotId);
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

  chosenCards.forEach(card => {
    const filename = card.name + (card.reversed ? "_r" : "");
    fetch(`/api/descrizione/${filename}`)
      .then(resp => resp.text())
      .then(md => {
        const section = extractSection(md, card.position);
        container.innerHTML += `<h3>${capitalize(card.position)}</h3>` + marked.parse(section);
      })
      .catch(() => {
        container.innerHTML += `<h3>${capitalize(card.position)}</h3><p>Nessuna descrizione trovata.</p>`;
      });
  });
}

function extractSection(md, position) {
  const parts = md.split(/##\s+Significato nel/);
  let key = "";
  if (position === "Passato") key = "Passato";
  if (position === "Presente") key = "Presente";
  if (position === "Futuro") key = "Futuro";

  const match = parts.find(p => p.trim().startsWith(key));
  return match ? match.replace(/^.*?\n/, "") : md;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
