const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

function loadEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

const env = loadEnvFile(path.join(__dirname, "..", ".env"));
const frontendPort = Number(process.env.FRONTEND_PORT || env.FRONTEND_PORT || 5000);
const backendUrl = process.env.BACKEND_URL || env.BACKEND_URL || "http://localhost:5001";
const frontendDir = __dirname;
const backendTarget = new URL(backendUrl);

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function proxyApi(req, res) {
  const client = backendTarget.protocol === "https:" ? require("https") : require("http");
  const options = {
    protocol: backendTarget.protocol,
    hostname: backendTarget.hostname,
    port: backendTarget.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: backendTarget.host,
    },
  };

  const proxyReq = client.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Failed to reach backend" }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }

  const cleanPath = req.url === "/" ? "/index.html" : (req.url || "/index.html").split("?")[0];
  const filePath = path.join(frontendDir, cleanPath);

  if (filePath.endsWith("index.html")) {
    sendFile(res, filePath, "text/html; charset=utf-8");
    return;
  }

  if (filePath.endsWith("style.css")) {
    sendFile(res, filePath, "text/css; charset=utf-8");
    return;
  }

  if (filePath.endsWith("app.js")) {
    sendFile(res, filePath, "application/javascript; charset=utf-8");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(frontendPort, "0.0.0.0", () => {
  console.log(`Frontend serving at http://localhost:${frontendPort}`);
  console.log(`Proxying API to: ${backendUrl}`);
});
