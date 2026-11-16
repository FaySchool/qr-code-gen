/*
 * Content types and the functions that turn form values into the text a QR
 * code actually stores. Each type returns '' until its essential fields are
 * filled in, which the UI treats as "nothing to encode yet".
 */
(function (root) {
  'use strict';

  const trim = (v) => (v == null ? '' : String(v).trim());

  // WIFI: and MECARD-style payloads escape these with a backslash.
  const escWifi = (v) => String(v).replace(/([\\;,:"])/g, '\\$1');

  // vCard / iCalendar text values.
  const escCard = (v) =>
    String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

  const phone = (v) => trim(v).replace(/[^\d+*#]/g, '');

  const query = (pairs) => {
    const parts = pairs
      .filter(([, v]) => trim(v) !== '')
      .map(([k, v]) => k + '=' + encodeURIComponent(v));
    return parts.length ? '?' + parts.join('&') : '';
  };

  const pad = (n) => String(n).padStart(2, '0');

  // "2026-11-16T09:00" (local) -> "20261116T140000Z"
  const icsDateTime = (local) => {
    const d = new Date(local);
    if (isNaN(d)) return '';
    return (
      d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
    );
  };

  // "2026-11-16" (+ days) -> "20261116"
  const icsDate = (date, addDays) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(date));
    if (!m) return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + (addDays || 0)));
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
  };

  const types = {
    url: {
      label: 'URL',
      hint: 'Opens a web page when scanned.',
      fields: [
        { id: 'url', label: 'Web address', type: 'url', placeholder: 'https://example.com', span: 2 },
      ],
      build(v) {
        const u = trim(v.url);
        if (!u) return '';
        return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u;
      },
    },

    text: {
      label: 'Text',
      hint: 'Shows plain text on the scanning device.',
      fields: [
        { id: 'text', label: 'Text', type: 'textarea', placeholder: 'Anything you like', span: 2 },
      ],
      build: (v) => (trim(v.text) ? String(v.text) : ''),
    },

    wifi: {
      label: 'WiFi',
      hint: 'Lets a phone join the network without typing the password.',
      fields: [
        { id: 'ssid', label: 'Network name (SSID)', type: 'text', span: 2 },
        {
          id: 'security', label: 'Security', type: 'select', value: 'WPA',
          options: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'None (open network)']],
        },
        { id: 'password', label: 'Password', type: 'text', showIf: (v) => v.security !== 'nopass' },
        { id: 'hidden', label: 'Hidden network', type: 'checkbox', span: 2 },
      ],
      build(v) {
        if (!trim(v.ssid)) return '';
        const sec = v.security || 'WPA';
        let out = 'WIFI:T:' + sec + ';S:' + escWifi(v.ssid) + ';';
        if (sec !== 'nopass') out += 'P:' + escWifi(v.password || '') + ';';
        if (v.hidden) out += 'H:true;';
        return out + ';';
      },
    },

    vcard: {
      label: 'Contact',
      hint: 'Adds a contact card (vCard) to the address book.',
      fields: [
        { id: 'first', label: 'First name', type: 'text' },
        { id: 'last', label: 'Last name', type: 'text' },
        { id: 'org', label: 'Organization', type: 'text' },
        { id: 'title', label: 'Job title', type: 'text' },
        { id: 'mobile', label: 'Mobile phone', type: 'tel' },
        { id: 'work', label: 'Work phone', type: 'tel' },
        { id: 'email', label: 'Email', type: 'email' },
        { id: 'website', label: 'Website', type: 'url' },
        { id: 'street', label: 'Street', type: 'text', span: 2 },
        { id: 'city', label: 'City', type: 'text' },
        { id: 'state', label: 'State / region', type: 'text' },
        { id: 'zip', label: 'Postal code', type: 'text' },
        { id: 'country', label: 'Country', type: 'text' },
        { id: 'note', label: 'Note', type: 'textarea', span: 2 },
      ],
      build(v) {
        const first = trim(v.first), last = trim(v.last), org = trim(v.org);
        if (!first && !last && !org) return '';
        const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
        lines.push('N:' + escCard(last) + ';' + escCard(first) + ';;;');
        lines.push('FN:' + escCard([first, last].filter(Boolean).join(' ') || org));
        if (org) lines.push('ORG:' + escCard(org));
        if (trim(v.title)) lines.push('TITLE:' + escCard(trim(v.title)));
        if (phone(v.mobile)) lines.push('TEL;TYPE=CELL:' + phone(v.mobile));
        if (phone(v.work)) lines.push('TEL;TYPE=WORK:' + phone(v.work));
        if (trim(v.email)) lines.push('EMAIL:' + trim(v.email));
        if (trim(v.website)) lines.push('URL:' + trim(v.website));
        const adr = [v.street, v.city, v.state, v.zip, v.country].map(trim);
        if (adr.some(Boolean)) lines.push('ADR;TYPE=WORK:;;' + adr.map(escCard).join(';'));
        if (trim(v.note)) lines.push('NOTE:' + escCard(trim(v.note)));
        lines.push('END:VCARD');
        return lines.join('\n');
      },
    },

    event: {
      label: 'Calendar',
      hint: 'Offers to add an event to the calendar.',
      fields: [
        { id: 'title', label: 'Event title', type: 'text', span: 2 },
        { id: 'allDay', label: 'All-day event', type: 'checkbox', span: 2 },
        { id: 'start', label: 'Starts', type: 'datetime-local', showIf: (v) => !v.allDay },
        { id: 'end', label: 'Ends', type: 'datetime-local', showIf: (v) => !v.allDay },
        { id: 'startDate', label: 'First day', type: 'date', showIf: (v) => v.allDay },
        { id: 'endDate', label: 'Last day', type: 'date', showIf: (v) => v.allDay },
        { id: 'location', label: 'Location', type: 'text', span: 2 },
        { id: 'description', label: 'Description', type: 'textarea', span: 2 },
      ],
      build(v) {
        const title = trim(v.title);
        let start, end;
        if (v.allDay) {
          const s = icsDate(v.startDate);
          // DTEND is exclusive, so a one-day event ends the following day.
          const e = icsDate(v.endDate || v.startDate, 1);
          if (s) { start = 'DTSTART;VALUE=DATE:' + s; end = 'DTEND;VALUE=DATE:' + (e > s ? e : icsDate(v.startDate, 1)); }
        } else {
          const s = icsDateTime(v.start), e = icsDateTime(v.end);
          if (s) { start = 'DTSTART:' + s; end = e && e > s ? 'DTEND:' + e : ''; }
        }
        if (!title || !start) return '';
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'SUMMARY:' + escCard(title), start];
        if (end) lines.push(end);
        if (trim(v.location)) lines.push('LOCATION:' + escCard(trim(v.location)));
        if (trim(v.description)) lines.push('DESCRIPTION:' + escCard(trim(v.description)));
        lines.push('END:VEVENT', 'END:VCALENDAR');
        return lines.join('\n');
      },
    },

    phone: {
      label: 'Phone',
      hint: 'Starts a call to this number.',
      fields: [
        { id: 'number', label: 'Phone number', type: 'tel', placeholder: '+1 555 010 0199', span: 2 },
      ],
      build: (v) => (phone(v.number) ? 'tel:' + phone(v.number) : ''),
    },

    email: {
      label: 'Email',
      hint: 'Opens a pre-filled email draft.',
      fields: [
        { id: 'to', label: 'To', type: 'email', placeholder: 'name@example.com', span: 2 },
        { id: 'cc', label: 'Cc', type: 'email' },
        { id: 'bcc', label: 'Bcc', type: 'email' },
        { id: 'subject', label: 'Subject', type: 'text', span: 2 },
        { id: 'body', label: 'Message', type: 'textarea', span: 2 },
      ],
      build(v) {
        if (!trim(v.to)) return '';
        return 'mailto:' + trim(v.to) +
          query([['cc', trim(v.cc)], ['bcc', trim(v.bcc)], ['subject', v.subject], ['body', v.body]]);
      },
    },

    sms: {
      label: 'SMS',
      hint: 'Opens a pre-filled text message.',
      fields: [
        { id: 'number', label: 'Phone number', type: 'tel', placeholder: '+1 555 010 0199', span: 2 },
        { id: 'message', label: 'Message', type: 'textarea', span: 2 },
      ],
      build(v) {
        if (!phone(v.number)) return '';
        return 'SMSTO:' + phone(v.number) + ':' + (v.message || '');
      },
    },

    geo: {
      label: 'Location',
      hint: 'Opens a map at these GPS coordinates.',
      fields: [
        { id: 'lat', label: 'Latitude', type: 'number', placeholder: '42.3601', min: -90, max: 90 },
        { id: 'lng', label: 'Longitude', type: 'number', placeholder: '-71.0589', min: -180, max: 180 },
        {
          id: 'format', label: 'Open with', type: 'select', value: 'geo', span: 2,
          options: [['geo', 'Device’s default maps app (geo: link)'], ['google', 'Google Maps link']],
        },
      ],
      build(v) {
        if (trim(v.lat) === '' || trim(v.lng) === '') return '';
        const lat = Number(v.lat), lng = Number(v.lng);
        if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
        return v.format === 'google'
          ? 'https://www.google.com/maps?q=' + lat + ',' + lng
          : 'geo:' + lat + ',' + lng;
      },
    },

    whatsapp: {
      label: 'WhatsApp',
      hint: 'Opens a WhatsApp chat with this number.',
      fields: [
        { id: 'number', label: 'Phone number with country code', type: 'tel', placeholder: '+1 555 010 0199', span: 2 },
        { id: 'message', label: 'Message', type: 'textarea', span: 2 },
      ],
      build(v) {
        const n = phone(v.number).replace(/\D/g, '');
        return n ? 'https://wa.me/' + n + query([['text', v.message]]) : '';
      },
    },

    crypto: {
      label: 'Crypto',
      hint: 'Opens a wallet with a payment request.',
      fields: [
        {
          id: 'coin', label: 'Currency', type: 'select', value: 'bitcoin',
          options: [['bitcoin', 'Bitcoin'], ['ethereum', 'Ethereum'], ['litecoin', 'Litecoin'], ['bitcoincash', 'Bitcoin Cash'], ['dogecoin', 'Dogecoin']],
        },
        { id: 'amount', label: 'Amount', type: 'number', min: 0, step: 'any' },
        { id: 'address', label: 'Wallet address', type: 'text', span: 2 },
        { id: 'label', label: 'Label', type: 'text', span: 2 },
      ],
      build(v) {
        const addr = trim(v.address);
        if (!addr) return '';
        const amount = Number(v.amount) > 0 ? String(v.amount).trim() : '';
        const key = v.coin === 'ethereum' ? 'value' : 'amount';
        return (v.coin || 'bitcoin') + ':' + addr + query([[key, amount], ['label', trim(v.label)]]);
      },
    },
  };

  const api = { types };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QRPayloads = api;
})(typeof self !== 'undefined' ? self : this);
