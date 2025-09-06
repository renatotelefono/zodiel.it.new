import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix per __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 📂 Percorsi assoluti
const frontendDir = path.join(__dirname, "../frontend");     // contiene index.html, index_en.html, css/js, img, img_en, audio, audio_en
const imgDirIt    = path.join(frontendDir, "img");
const imgDirEn    = path.join(frontendDir, "img_en");
const descDirIt   = path.join(__dirname, "descrizioni");
const descDirEn   = path.join(__dirname, "descrizioni_en");

// Servi i file statici (HTML, CSS, JS, IMG, AUDIO, ...)
app.use(express.static(frontendDir));

/**
 * Rileva la lingua richiesta:
 * 1) query ?lang=en|it
 * 2) referrer che contiene /en o index_en.html
 * 3) Accept-Language header (se inizia con 'en')
 * default: 'it'
 */
function detectLang(req, fallback = "it") {
  const q = (req.query.lang || "").toString().toLowerCase();
  if (q === "en" || q === "it") return q;

  const ref = (req.get("referer") || "").toLowerCase();
  if (/\bindex_en\.html\b/.test(ref) || /\/en\b/.test(ref)) return "en";

  const al = (req.get("accept-language") || "").toLowerCase();
  if (al.startsWith("en")) return "en";

  return fallback;
}

// Rotte principali → index (IT) e index_en (EN) se presente
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/en", (req, res) => {
  const enPath = path.join(frontendDir, "index_en.html");
  if (fs.existsSync(enPath)) return res.sendFile(enPath);
  // fallback a index.html se non c'è la versione EN
  return res.sendFile(path.join(frontendDir, "index.html"));
});

// ---- API: elenco carte ----
// Compat: /api/carte (con rilevamento lingua), più alias espliciti /api/carte_it e /api/carte_en
app.get("/api/carte", (req, res) => {
  const lang = detectLang(req, "it");
  const dir = lang === "en" ? imgDirEn : imgDirIt;
  try {
    const cards = fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith(".jpeg"))
      .map(f => f.replace(/\.jpeg$/i, ""));
    res.json(cards);
  } catch (err) {
    console.error("Errore lettura imgDir:", dir, err);
    res.status(500).send("Errore server");
  }
});

app.get("/api/carte_it", (req, res) => {
  try {
    const cards = fs.readdirSync(imgDirIt)
      .filter(f => f.toLowerCase().endsWith(".jpeg"))
      .map(f => f.replace(/\.jpeg$/i, ""));
    res.json(cards);
  } catch (err) {
    console.error("Errore lettura imgDir IT:", err);
    res.status(500).send("Errore server");
  }
});

app.get("/api/carte_en", (req, res) => {
  try {
    const cards = fs.readdirSync(imgDirEn)
      .filter(f => f.toLowerCase().endsWith(".jpeg"))
      .map(f => f.replace(/\.jpeg$/i, ""));
    res.json(cards);
  } catch (err) {
    console.error("Errore lettura imgDir EN:", err);
    res.status(500).send("Errore server");
  }
});

// ---- API: descrizioni (markdown) ----
// Compat: /api/descrizione/:carta (con rilevamento lingua), più alias /api/descrizione_it/:carta e /api/descrizione_en/:carta
app.get("/api/descrizione/:carta", (req, res) => {
  const lang = detectLang(req, "it");
  const baseDir = lang === "en" ? descDirEn : descDirIt;
  const filePath = path.join(baseDir, `${req.params.carta}.md`);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send("Descrizione non trovata");
});

app.get("/api/descrizione_it/:carta", (req, res) => {
  const filePath = path.join(descDirIt, `${req.params.carta}.md`);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send("Descrizione IT non trovata");
});

app.get("/api/descrizione_en/:carta", (req, res) => {
  const filePath = path.join(descDirEn, `${req.params.carta}.md`);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send("Description EN not found");
});

app.listen(PORT, () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
  console.log(`   - Statico da: ${frontendDir}`);
  console.log(`   - Img IT:     ${imgDirIt}`);
  console.log(`   - Img EN:     ${imgDirEn}`);
  console.log(`   - Desc IT:    ${descDirIt}`);
  console.log(`   - Desc EN:    ${descDirEn}`);
});
