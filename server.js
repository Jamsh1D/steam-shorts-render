const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const app = express();

// katta audio base64 uchun limit
app.use(express.json({ limit: "30mb" }));

const PORT = process.env.PORT || 3000;

// health check
app.get("/", (_req, res) => res.send("ok"));

// xavfsiz filename
function safeName(s) {
  return (s || "short")
    .toString()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .slice(0, 60);
}

app.post("/render", async (req, res) => {
  try {
    const { title, script, audio_b64 } = req.body || {};

    if (!audio_b64) {
      return res.status(400).json({ error: "audio_b64 is required" });
    }

    const jobId = Date.now().toString();
    const workDir = path.join("/tmp", jobId);
    fs.mkdirSync(workDir, { recursive: true });

    // 🎧 audio yozamiz
    const audioPath = path.join(workDir, "voice.mp3");
    fs.writeFileSync(audioPath, Buffer.from(audio_b64, "base64"));

    // 🎬 background
    const bgPath = path.join(__dirname, "assets", "background.mp4");
    if (!fs.existsSync(bgPath)) {
      return res.status(500).json({
        error: "assets/background.mp4 not found"
      });
    }

    // 📤 output
    const outName = `${safeName(title)}_${jobId}.mp4`;
    const outPath = path.join(workDir, outName);

    // 🔥 FFmpeg (MVP)
    const cmd = `
      ffmpeg -y -hide_banner -loglevel error \
      -stream_loop -1 -i "${bgPath}" \
      -i "${audioPath}" \
      -shortest \
      -c:v libx264 -preset veryfast -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -movflags +faststart \
      "${outPath}"
    `;

    execSync(cmd, { stdio: "inherit" });

    // public papka
    const publicDir = path.join(__dirname, "public", jobId);
    fs.mkdirSync(publicDir, { recursive: true });

    const publicPath = path.join(publicDir, outName);
    fs.copyFileSync(outPath, publicPath);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const video_url = `${baseUrl}/files/${jobId}/${encodeURIComponent(outName)}`;

    return res.json({
      ok: true,
      video_url
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// public serve
app.use("/files", express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
