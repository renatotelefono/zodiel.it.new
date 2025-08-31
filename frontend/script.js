let cards = [];

// Carica la lista carte dal backend
fetch("/api/carte")
  .then(resp => resp.json())
  .then(data => {
    cards = data;
    console.log("Carte disponibili:", cards);
  });

function drawCard() {
  if (cards.length === 0) {
    alert("Nessuna carta trovata!");
    return;
  }

  const card = cards[Math.floor(Math.random() * cards.length)];
  const reversed = Math.random() > 0.5;
  const filename = card + (reversed ? "_r" : "");

  // Mostra immagine (rovesciata se serve)
  document.getElementById("card-container").innerHTML =
    `<img src="img/${card}.jpeg" alt="${card}"
      style="max-width:200px; ${reversed ? 'transform: rotate(180deg);' : ''}">`;

  // Carica descrizione dal backend
  fetch(`/api/descrizione/${filename}`)
    .then(resp => {
      if (!resp.ok) throw new Error("Manca descrizione");
      return resp.text();
    })
    .then(md => {
      document.getElementById("description").innerHTML = marked.parse(md);
    })
    .catch(err => {
      document.getElementById("description").innerHTML = "<p>Descrizione non trovata</p>";
      console.error(err);
    });
}
