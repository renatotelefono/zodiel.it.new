import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix per __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 📂 Percorso assoluto al frontend
const frontendDir = path.join(__dirname, "../frontend");

// Servi i file statici (HTML, CSS, JS, IMG)
app.use(express.static(frontendDir));

// Rotta principale → index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

// Percorsi reali
const imgDir = path.join(frontendDir, "img");
const descDir = path.join(__dirname, "descrizioni");

// API: elenco carte
app.get("/api/carte", (req, res) => {
  try {
    const cards = fs.readdirSync(imgDir)
      .filter(f => f.endsWith(".jpeg"))
      .map(f => f.replace(".jpeg", ""));
    res.json(cards);
  } catch (err) {
    console.error("Errore lettura imgDir:", err);
    res.status(500).send("Errore server");
  }
});

// API: descrizione
app.get("/api/descrizione/:carta", (req, res) => {
  const { carta } = req.params;
  const filePath = path.join(descDir, `${carta}.md`);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Descrizione non trovata");
  }
});

// Avvio server
app.listen(PORT, () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
});
