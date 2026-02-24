const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const multer = require("multer");

const app = express();
const upload = multer({ dest: "/tmp/uploads" });

const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => res.send("ok"));

function safeName(s) {
  return (s || "short")
    .toString()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .slice(0, 60);
}

// multipart/form-data endpoint
// fields: title, script, source_url, audio(file)
app.post("/render", upload.single("audio"), async (req, res) => {
  try {
    const title = req.body?.title || "Steam Update";
    const script = req.body?.script || "";
    const source_url = req.body?.source_url || "";

    if (!req.file?.path) {
      return res.status(400).json({ error: "audio file is required (field name: audio)" });
    }

    const jobId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const workDir = path.join("/tmp", jobId);
    fs.mkdirSync(workDir, { recursive: true });

    const audioPath = path.join(workDir, "voice.mp3");
    fs.copyFileSync(req.file.path, audioPath);

    const bgPath = path.join(__dirname, "assets", "background.mp4");
    if (!fs.existsSync(bgPath)) {
      return res.status(500).json({ error: "assets/background.mp4 not found" });
    }

    const outName = `${safeName(title)}_${jobId}.mp4`;
    const outPath = path.join(workDir, outName);

    const cmd = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-stream_loop", "-1",
      "-i", `"${bgPath}"`,
      "-i", `"${audioPath}"`,
      "-shortest",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      `"${outPath}"`
    ].join(" ");

    execSync(cmd, { stdio: "inherit" });

    const publicDir = path.join(__dirname, "public", jobId);
    fs.mkdirSync(publicDir, { recursive: true });

    const publicPath = path.join(publicDir, outName);
    fs.copyFileSync(outPath, publicPath);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const video_url = `${baseUrl}/files/${jobId}/${encodeURIComponent(outName)}`;

    return res.json({ ok: true, video_url, title, source_url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "render failed" });
  }
});

app.use("/files", express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log("Server running on", PORT));
