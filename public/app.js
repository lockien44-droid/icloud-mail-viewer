const form = document.querySelector("#mailForm");
const emailsInput = document.querySelector("#emails");
const tokenInput = document.querySelector("#token");
const refreshBtn = document.querySelector("#refreshBtn");
const message = document.querySelector("#message");
const results = document.querySelector("#results");
const currentEmail = document.querySelector("#currentEmail");
const updatedAt = document.querySelector("#updatedAt");
const countdown = document.querySelector("#countdown");

let seconds = 30;
let loading = false;

function setMessage(text, type = "info") {
  message.textContent = text;
  message.className = `message ${type}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderMail(mail) {
  const body =
    mail.bodyType === "html"
      ? `<div class="body">${mail.body || ""}</div>`
      : `<div class="body"><pre>${escapeHtml(mail.body || "")}</pre></div>`;
  const attachText = mail.attachments?.length ? ` · Đính kèm: ${mail.attachments.map(escapeHtml).join(", ")}` : "";

  return `
    <details class="mail">
      <summary>
        <div>
          <div class="subject">${escapeHtml(mail.subject)}</div>
          <div class="meta">Từ: ${escapeHtml(mail.from)} · Tới: ${escapeHtml(mail.to)} · Match: ${escapeHtml(mail.matched)}${attachText}</div>
        </div>
        <div class="date">${escapeHtml(formatDate(mail.date))}</div>
      </summary>
      ${body}
    </details>
  `;
}

async function loadMail() {
  const emails = emailsInput.value.trim();
  const token = tokenInput.value.trim();

  currentEmail.textContent = emails || "Chưa chọn email";
  if (!token) {
    setMessage("Nhập mã truy cập trước khi tải mail.", "warning");
    return;
  }
  if (!emails) {
    setMessage("Nhập ít nhất một email cần xem.", "warning");
    return;
  }

  loading = true;
  form.querySelectorAll("button").forEach((button) => (button.disabled = true));
  setMessage("Đang tải thư từ iCloud IMAP...", "info");

  try {
    const response = await fetch("/api/mail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ emails, token }),
    });
    const data = await response.json();
    if (!response.ok) {
      const details = [data.error, data.detail].filter(Boolean).join(" ");
      throw new Error(details || "Không tải được mail.");
    }

    updatedAt.textContent = formatDate(data.updatedAt);
    results.hidden = false;
    results.innerHTML = data.mails.length
      ? data.mails.map(renderMail).join("")
      : "";
    setMessage(data.mails.length ? `Tìm thấy ${data.mails.length} thư.` : "Không tìm thấy thư nào khớp email đã nhập.", data.mails.length ? "ok" : "info");
    seconds = 30;
  } catch (error) {
    results.hidden = true;
    setMessage(error.message, "warning");
  } finally {
    loading = false;
    form.querySelectorAll("button").forEach((button) => (button.disabled = false));
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadMail();
});

refreshBtn.addEventListener("click", loadMail);

setInterval(() => {
  seconds -= 1;
  if (seconds <= 0) {
    seconds = 30;
    if (!loading && tokenInput.value.trim() && emailsInput.value.trim()) {
      loadMail();
    }
  }
  countdown.textContent = `${seconds}s`;
}, 1000);
