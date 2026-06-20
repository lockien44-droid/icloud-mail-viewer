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
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-View-Token");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

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

function getRequestToken(req) {
  const authorization = req.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return (
    req.body?.token ||
    req.query.token ||
    req.query.view_token ||
    req.get("x-view-token") ||
    bearer ||
    ""
  );
}

function getRequestEmails(req) {
  return req.body?.emails || req.body?.mail || req.query.emails || req.query.email || req.query.mail || "";
}

function validateToken(req) {
  if (!process.env.VIEW_TOKEN) {
    return { status: 500, error: "Server chua cau hinh VIEW_TOKEN." };
  }

  if (getRequestToken(req) !== process.env.VIEW_TOKEN) {
    return { status: 401, error: "Sai ma truy cap." };
  }

  return null;
}

function getErrorField(error, field) {
  return typeof error?.[field] === "string" ? error[field] : "";
}

function buildMailErrorDetail(error) {
  const parts = [
    getErrorField(error, "message"),
    getErrorField(error, "code"),
    getErrorField(error, "response"),
    getErrorField(error, "responseText"),
    getErrorField(error, "serverResponse"),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const raw = parts.join(" ").toLowerCase();
  if (raw.includes("auth") || raw.includes("login")) {
    return "Dang nhap iCloud IMAP that bai. Hay kiem tra ICLOUD_EMAIL va ICLOUD_APP_PASSWORD app-specific password.";
  }
  if (raw.includes("timeout") || raw.includes("timed out")) {
    return "Ket noi toi iCloud IMAP bi timeout. Thu lai sau hoac kiem tra Render co ra duoc imap.mail.me.com:993.";
  }
  if (raw.includes("mailbox") || raw.includes("select")) {
    return `Khong mo duoc mailbox ${mailboxName}. Hay kiem tra bien MAILBOX.`;
  }

  return [...new Set(parts)].join(" ");
}

async function fetchMailboxMessages(targets, options = {}) {
  const configError = requireServerConfig();
  if (configError) {
    const error = new Error(configError);
    error.status = 500;
    throw error;
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
      return {
        emails: targets,
        updatedAt: new Date().toISOString(),
        mailbox: mailboxName,
        scanned: 0,
        count: 0,
        mails: [],
      };
    }

    const start = Math.max(1, total - fetchLimit + 1);
    const range = `${start}:*`;
    const mails = [];
    let scanned = 0;

    for await (const msg of client.fetch(range, { source: true, uid: true })) {
      scanned += 1;
      const parsed = await simpleParser(msg.source);
      const matched = findMatchedTarget(parsed, targets);

      if (matched || options.includeAll) {
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
    return {
      emails: targets,
      updatedAt: new Date().toISOString(),
      mailbox: mailboxName,
      scanned,
      count: mails.length,
      mails,
    };
  } catch (error) {
    try {
      await client.logout();
    } catch {}

    throw error;
  }
}

function sendMailError(res, error) {
  console.error("IMAP read failed", {
    message: error.message,
    code: error.code,
    response: error.response,
    responseText: error.responseText,
    serverResponse: error.serverResponse,
  });

  return res.status(error.status || 500).json({
    error: error.status ? error.message : "Khong doc duoc mail.",
    detail: error.status ? "" : buildMailErrorDetail(error),
    code: error.code || "",
  });
}

app.post("/api/mail", async (req, res) => {
  const tokenError = validateToken(req);
  if (tokenError) {
    return res.status(tokenError.status).json({ error: tokenError.error });
  }

  const targets = parseTargets(getRequestEmails(req));
  if (!targets.length) {
    return res.status(400).json({ error: "Chua nhap email can xem." });
  }

  try {
    return res.json(await fetchMailboxMessages(targets));
  } catch (error) {
    return sendMailError(res, error);
  }
});

async function logsHandler(req, res) {
  const targets = parseTargets(getRequestEmails(req));
  if (!targets.length) {
    return res.status(400).type("text/plain").send("mail is required");
  }

  const tokenError = validateToken(req);
  if (tokenError) {
    return res.status(tokenError.status).json({ error: tokenError.error });
  }

  try {
    const result = await fetchMailboxMessages(targets);
    return res.json({
      ok: true,
      ...result,
      logs: result.mails,
    });
  } catch (error) {
    return sendMailError(res, error);
  }
}

app.get("/logs", logsHandler);
app.post("/logs", logsHandler);

app.listen(port, () => {
  console.log(`Mail Viewer chay tai http://localhost:${port}`);
});
