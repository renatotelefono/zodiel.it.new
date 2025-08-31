const cards = [
  "00_il_matto", "01_il_mago", "02_la_papessa",
  "03_l_imperatrice", "04_l_imperatore", "05_il_papa",
  "06_gli_amanti", "07_il_carro", "08_la_giustizia",
  "09_l_eremita", "10_la_fortuna", "11_la_forza",
  "12_l_appeso", "13_la_morte", "14_temperanza",
  "15_il_diavolo", "16_la_torre", "17_la_stella",
  "18_la_luna", "19_il_sole", "20_il_giudizio", "21_il_mondo"
];

function drawCard() {
  const card = cards[Math.floor(Math.random() * cards.length)];
  const reversed = Math.random() > 0.5; 
  const filename = card + (reversed ? "_r" : "");

  // Mostra immagine (rovesciata se serve)
  document.getElementById("card-container").innerHTML =
    `<img src="img/${card}.jpeg" alt="${card}" 
      style="max-width:200px; ${reversed ? 'transform: rotate(180deg);' : ''}">`;

  // Chiamata API al backend per caricare descrizione
  fetch(`/api/descrizione/${filename}`)
    .then(resp => resp.text())
    .then(md => {
      document.getElementById("description").innerHTML = marked.parse(md);
    })
    .catch(() => {
      document.getElementById("description").innerHTML = "<p>Descrizione non trovata</p>";
    });
}
