# QR Code Generator

A static web app for making custom QR codes. Everything runs in the browser — nothing typed or uploaded leaves the device.

## Features

- **Content types:** URL, text, WiFi, contact (vCard), calendar event, phone, email, SMS, GPS location, WhatsApp, and crypto payment.
- **Design:** square or circular outline, six dot styles, corner frame and center styles, solid or gradient colors, separate corner colors, transparent background.
- **Logo:** embed any image in the center, with adjustable size and spacing.
- **Output:** 128–2048 px, adjustable margin and error correction; download as PNG, SVG, JPEG or WebP, or copy to the clipboard.

## Running it

There is no build step. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

## GitHub Pages

All asset paths are relative, so the site works from a project subpath such as `https://<owner>.github.io/qr-code-gen/`.

To publish: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then choose the branch and the `/ (root)` folder. The `.nojekyll` file tells Pages to serve the files as-is.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `css/style.css` | Styles (light and dark) |
| `js/payloads.js` | Content types and the text each one encodes |
| `js/app.js` | Form, design controls, preview and export |
| `vendor/qr-code-styling.js` | [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) 1.9.2 (MIT) |
