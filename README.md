# Mail Viewer cho iCloud Hide My Email

Web nay dung dung mo hinh trong tai lieu ban dua:

Web giao dien -> nhap email an + `VIEW_TOKEN` -> backend kiem tra token -> backend dang nhap IMAP iCloud bang app-specific password -> doc `INBOX` -> loc thu co chua email an -> tra ket qua ra web.

Luu y: chi nen dung cho hop thu iCloud cua chinh ban. Khong lam web bat nguoi khac nhap Apple ID, mat khau, hoac app-specific password.

## Cai dat

```powershell
npm install
Copy-Item .env.example .env
```

Sua `.env`:

```env
ICLOUD_EMAIL=yourname@icloud.com
ICLOUD_APP_PASSWORD=abcd-efgh-ijkl-mnop
VIEW_TOKEN=123456
PORT=3000
FETCH_LIMIT=100
MAILBOX=INBOX
```

`ICLOUD_APP_PASSWORD` tao tai `account.apple.com`.

## Chay web

```powershell
npm start
```

Mo:

```text
http://localhost:3000
```

Nhap vi du:

```text
cattle.mixes_4u+q0f4lm@icloud.com
```

Backend se dang nhap vao `ICLOUD_EMAIL`, doc thu moi nhat trong `INBOX`, roi loc header `To`, `Cc`, `Bcc`, `Delivered-To`, `X-Original-To`... co chua alias Hide My Email.

## Cau hinh

- `ICLOUD_EMAIL`: mail iCloud chinh.
- `ICLOUD_APP_PASSWORD`: app-specific password cua Apple.
- `VIEW_TOKEN`: ma bao ve web.
- `PORT`: cong web, mac dinh `3000`.
- `FETCH_LIMIT`: so thu moi nhat can quet, mac dinh `100`.
- `MAILBOX`: mailbox can doc, mac dinh `INBOX`.
