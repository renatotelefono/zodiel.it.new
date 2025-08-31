import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3000;

const __dirname = path.resolve();

// Servi il frontend statico
app.use("/", express.static(path.join(__dirname, "frontend")));

// Servi le descrizioni
app.get("/api/descrizione/:carta", (req, res) => {
  const { carta } = req.params; // es: 00_il_matto o 00_il_matto_r
  const filePath = path.join(__dirname, "backend", "descrizioni", `${carta}.md`);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Descrizione non trovata");
  }
});

// Avvio server
app.listen(PORT, () => {
  console.log(`Server attivo su http://localhost:${PORT}`);
});
