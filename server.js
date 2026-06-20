const express = require("express");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const fetchLimit = Number(process.env.FETCH_LIMIT || 100);
const mailboxName = process.env.MAILBOX || "INBOX";

app.use(express.json({ limit: "64kb" }));
app.use(express.static("public"));

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

function parseTargets(input) {
  return String(input || "")
    .split(/[\n,; ]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getRawHeaders(parsed) {
  if (!Array.isArray(parsed.headerLines)) return "";
  return parsed.headerLines.map((header) => header.line || "").join("\n");
}

function findMatchedTarget(parsed, targets) {
  const searchable = [
    parsed.to?.text || "",
    parsed.cc?.text || "",
    parsed.bcc?.text || "",
    getRawHeaders(parsed),
  ]
    .join("\n")
    .toLowerCase();

  return targets.find((target) => searchable.includes(target)) || "";
}

function requireServerConfig() {
  if (!process.env.ICLOUD_EMAIL || !process.env.ICLOUD_APP_PASSWORD) {
    return "Server chua cau hinh ICLOUD_EMAIL hoac ICLOUD_APP_PASSWORD.";
  }
  return "";
}

app.post("/api/mail", async (req, res) => {
  const { emails, token } = req.body || {};

  if (!process.env.VIEW_TOKEN) {
    return res.status(500).json({ error: "Server chua cau hinh VIEW_TOKEN." });
  }

  if (token !== process.env.VIEW_TOKEN) {
    return res.status(401).json({ error: "Sai ma truy cap." });
  }

  const configError = requireServerConfig();
  if (configError) {
    return res.status(500).json({ error: configError });
  }

  const targets = parseTargets(emails);
  if (!targets.length) {
    return res.status(400).json({ error: "Chua nhap email can xem." });
  }

  const client = new ImapFlow({
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.ICLOUD_EMAIL,
      pass: process.env.ICLOUD_APP_PASSWORD,
    },
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(mailboxName);
    const total = mailbox.exists || 0;

    if (!total) {
      await client.logout();
      return res.json({
        emails: targets,
        updatedAt: new Date().toISOString(),
        count: 0,
        mails: [],
      });
    }

    const start = Math.max(1, total - fetchLimit + 1);
    const range = `${start}:*`;
    const mails = [];

    for await (const msg of client.fetch(range, { source: true, uid: true })) {
      const parsed = await simpleParser(msg.source);
      const matched = findMatchedTarget(parsed, targets);

      if (matched) {
        mails.push({
          uid: msg.uid,
          matched,
          from: parsed.from?.text || "",
          to: parsed.to?.text || "",
          cc: parsed.cc?.text || "",
          subject: parsed.subject || "(Khong co tieu de)",
          date: parsed.date ? parsed.date.toISOString() : "",
          bodyType: parsed.html ? "html" : "text",
          body: parsed.html || parsed.text || "",
          attachments: (parsed.attachments || []).map((attachment) => attachment.filename).filter(Boolean),
        });
      }
    }

    await client.logout();

    mails.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.json({
      emails: targets,
      updatedAt: new Date().toISOString(),
      count: mails.length,
      mails,
    });
  } catch (error) {
    try {
      await client.logout();
    } catch {}

    return res.status(500).json({
      error: "Khong doc duoc mail.",
      detail: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Mail Viewer chay tai http://localhost:${port}`);
});
