(function () {
  'use strict';

  const TYPES = QRPayloads.types;
  const DEMO_DATA = 'https://example.com';

  const DEFAULT_STYLE = {
    shape: 'square',
    dots: 'square',
    cornerSq: 'square',
    cornerDot: 'square',
    fg: '#000000',
    gradient: false,
    fg2: '#3451b2',
    gradType: 'linear',
    gradRot: 45,
    bg: '#ffffff',
    transparent: false,
    customCorners: false,
    cornerSqColor: '#000000',
    cornerDotColor: '#000000',
    logo: null,
    logoSize: 30,    // % of the code's width
    logoMargin: 1,   // % of the image size
    logoHide: true,
    size: 1024,      // px
    marginPct: 4,    // % of the image size
    ec: 'M',
  };

  const CHIP_OPTIONS = {
    shape: [['square', 'Square'], ['circle', 'Circle']],
    dots: [
      ['square', 'Square'], ['dots', 'Dots'], ['rounded', 'Rounded'],
      ['extra-rounded', 'Extra rounded'], ['classy', 'Classy'], ['classy-rounded', 'Classy rounded'],
    ],
    cornerSq: [['square', 'Square'], ['extra-rounded', 'Rounded'], ['dot', 'Circle']],
    cornerDot: [['square', 'Square'], ['rounded', 'Rounded'], ['dot', 'Circle']],
  };

  const state = {
    type: 'url',
    values: {},          // per-type form values, kept when switching types
    style: Object.assign({}, DEFAULT_STYLE),
    logoName: '',
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const els = {
    typeChips: $('#type-chips'),
    typeHint: $('#type-hint'),
    fields: $('#fields'),
    preview: $('#preview'),
    status: $('#status'),
    warnings: $('#warnings'),
    raw: $('#raw'),
    rawCount: $('#raw-count'),
    logoFile: $('#logo-file'),
    logoName: $('#logo-name'),
    logoRemove: $('#logo-remove'),
    logoBtnText: $('#logo-btn-text'),
    copy: $('#copy'),
  };

  let currentPayload = '';
  let renderTimer = 0;

  /* ---------- Small helpers ---------- */

  function chipGroup(container, name, options, current, onChange) {
    container.replaceChildren();
    options.forEach(([value, label]) => {
      const wrap = document.createElement('label');
      wrap.className = 'chip';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === current;
      input.addEventListener('change', () => onChange(value));
      const text = document.createElement('span');
      text.textContent = label;
      wrap.append(input, text);
      container.append(wrap);
    });
  }

  // The QR library encodes one byte per character, so non-ASCII text is
  // converted to a UTF-8 "binary string" first. Scanners assume UTF-8.
  function utf8BinaryString(str) {
    let out = '';
    new TextEncoder().encode(str).forEach((b) => { out += String.fromCharCode(b); });
    return out;
  }

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  /* ---------- Content form ---------- */

  function valuesFor(type) {
    if (!state.values[type]) {
      const v = {};
      TYPES[type].fields.forEach((f) => {
        v[f.id] = f.value !== undefined ? f.value : f.type === 'checkbox' ? false : '';
      });
      state.values[type] = v;
    }
    return state.values[type];
  }

  function renderFields() {
    const def = TYPES[state.type];
    const values = valuesFor(state.type);
    els.typeHint.textContent = def.hint;
    els.fields.replaceChildren();

    def.fields.forEach((f) => {
      const wrap = document.createElement('label');
      wrap.dataset.field = f.id;
      let input;

      if (f.type === 'checkbox') {
        wrap.className = 'check' + (f.span === 2 ? ' span-2 field' : '');
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!values[f.id];
        wrap.append(input, document.createTextNode(f.label));
        // Checkboxes sit inline rather than under a heading.
        wrap.style.display = 'flex';
      } else {
        wrap.className = 'field' + (f.span === 2 ? ' span-2' : '');
        const caption = document.createElement('span');
        caption.textContent = f.label;
        if (f.type === 'textarea') {
          input = document.createElement('textarea');
        } else if (f.type === 'select') {
          input = document.createElement('select');
          f.options.forEach(([value, label]) => input.append(new Option(label, value)));
        } else {
          input = document.createElement('input');
          input.type = f.type;
          if (f.type === 'number') input.step = f.step || 'any';
          if (f.min !== undefined) input.min = f.min;
          if (f.max !== undefined) input.max = f.max;
        }
        if (f.placeholder) input.placeholder = f.placeholder;
        input.value = values[f.id];
        wrap.append(caption, input);
      }

      input.name = f.id;
      const onChange = () => {
        values[f.id] = input.type === 'checkbox' ? input.checked : input.value;
        applyFieldVisibility();
        scheduleRender();
      };
      input.addEventListener('input', onChange);
      input.addEventListener('change', onChange);
      els.fields.append(wrap);
    });

    applyFieldVisibility();
  }

  function applyFieldVisibility() {
    const values = valuesFor(state.type);
    TYPES[state.type].fields.forEach((f) => {
      if (!f.showIf) return;
      $('[data-field="' + f.id + '"]', els.fields).hidden = !f.showIf(values);
    });
  }

  /* ---------- Design controls ---------- */

  function syncDesignControls() {
    const s = state.style;

    $$('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = s[key];
    });

    $$('[data-chips]').forEach((el) => {
      const key = el.dataset.chips;
      chipGroup(el, key, CHIP_OPTIONS[key], s[key], (value) => {
        s[key] = value;
        scheduleRender();
      });
    });

    syncDesignDependents();
  }

  function syncDesignDependents() {
    const s = state.style;
    const flags = {
      gradient: s.gradient,
      gradLinear: s.gradType === 'linear',
      customCorners: s.customCorners,
      logo: !!s.logo,
    };
    $$('[data-show-if]').forEach((el) => { el.hidden = !flags[el.dataset.showIf]; });
    $$('output[data-for]').forEach((el) => {
      el.textContent = s[el.dataset.for] + (el.dataset.suffix || '');
    });
    $('#bg').disabled = s.transparent;

    els.logoName.textContent = s.logo ? state.logoName : '';
    els.logoRemove.hidden = !s.logo;
    els.logoBtnText.textContent = s.logo ? 'Replace…' : 'Choose image…';
  }

  function bindDesignControls() {
    $$('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      el.addEventListener('input', () => {
        if (el.type === 'checkbox') state.style[key] = el.checked;
        else if (el.type === 'range') state.style[key] = Number(el.value);
        else state.style[key] = el.value;
        syncDesignDependents();
        scheduleRender();
      });
    });

    els.logoFile.addEventListener('change', () => {
      const file = els.logoFile.files[0];
      els.logoFile.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.style.logo = reader.result;
        state.logoName = file.name;
        // A logo covers part of the code; higher error correction keeps it scannable.
        if (state.style.ec === 'L' || state.style.ec === 'M') state.style.ec = 'H';
        syncDesignControls();
        scheduleRender();
      };
      reader.readAsDataURL(file);
    });

    els.logoRemove.addEventListener('click', () => {
      state.style.logo = null;
      state.logoName = '';
      syncDesignControls();
      scheduleRender();
    });

    $('#reset-design').addEventListener('click', () => {
      state.style = Object.assign({}, DEFAULT_STYLE);
      state.logoName = '';
      syncDesignControls();
      scheduleRender();
    });
  }

  /* ---------- QR rendering ---------- */

  function buildOptions(data, overrides) {
    const s = Object.assign({}, state.style, overrides);
    const nonAscii = /[^\x00-\x7f]/.test(data);

    const qrOptions = { errorCorrectionLevel: s.ec };
    if (nonAscii) qrOptions.mode = 'Byte';

    const dotsOptions = { type: s.dots, color: s.fg };
    if (s.gradient) {
      dotsOptions.gradient = {
        type: s.gradType,
        rotation: (s.gradRot * Math.PI) / 180,
        colorStops: [{ offset: 0, color: s.fg }, { offset: 1, color: s.fg2 }],
      };
    }

    // Without their own color the corners inherit the dots' color or gradient.
    const cornersSquareOptions = { type: s.cornerSq };
    const cornersDotOptions = { type: s.cornerDot };
    if (s.customCorners) {
      cornersSquareOptions.color = s.cornerSqColor;
      cornersDotOptions.color = s.cornerDotColor;
    }

    const options = {
      type: 'svg',
      width: s.size,
      height: s.size,
      shape: s.shape,
      data: nonAscii ? utf8BinaryString(data) : data,
      margin: Math.round((s.size * s.marginPct) / 100),
      qrOptions,
      dotsOptions,
      cornersSquareOptions,
      cornersDotOptions,
      backgroundOptions: { color: s.transparent ? 'transparent' : s.bg },
    };

    if (s.logo) {
      options.image = s.logo;
      options.imageOptions = {
        hideBackgroundDots: s.logoHide,
        imageSize: s.logoSize / 100,
        margin: Math.round((s.size * s.logoMargin) / 100),
      };
    }
    return options;
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 80);
  }

  function render() {
    const payload = TYPES[state.type].build(valuesFor(state.type));
    let error = '';

    try {
      const qr = new QRCodeStyling(buildOptions(payload || DEMO_DATA));
      els.preview.replaceChildren();
      qr.append(els.preview);
      // Let CSS scale the preview regardless of the chosen export size.
      const svg = $('svg', els.preview);
      if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); }
    } catch (e) {
      error = 'That’s too much data for a QR code. Shorten the content or lower the error correction.';
      const box = document.createElement('div');
      box.className = 'preview-error';
      box.textContent = 'Too much data';
      els.preview.replaceChildren(box);
    }

    currentPayload = error ? '' : payload;
    els.preview.classList.toggle('is-demo', !payload && !error);

    els.status.classList.toggle('is-error', !!error);
    els.status.textContent = error ||
      (payload ? 'Ready — test it with your phone before printing.' : 'Fill in the content to generate your code.');

    $$('[data-download]').forEach((b) => { b.disabled = !currentPayload; });
    els.copy.disabled = !currentPayload;

    els.raw.textContent = payload || '—';
    els.rawCount.textContent = payload ? '(' + payload.length + ' characters)' : '';

    renderWarnings(!!currentPayload);
  }

  function renderWarnings(active) {
    const s = state.style;
    const warnings = [];

    if (active) {
      const bgLum = luminance(s.transparent ? '#ffffff' : s.bg);
      const fgColors = [s.fg];
      if (s.gradient) fgColors.push(s.fg2);
      if (s.customCorners) fgColors.push(s.cornerSqColor, s.cornerDotColor);
      const fgLums = fgColors.map(luminance);

      const worst = Math.min.apply(null, fgLums.map((l) =>
        (Math.max(l, bgLum) + 0.05) / (Math.min(l, bgLum) + 0.05)));
      if (worst < 3) {
        warnings.push('Low contrast between the code and its background — many scanners will struggle.');
      } else if (fgLums.some((l) => l > bgLum)) {
        warnings.push('Light dots on a dark background don’t scan on some devices. Dark on light is safest.');
      }
      if (s.transparent) {
        warnings.push('With a transparent background, place the code on a light surface.');
      }
      if (s.logo && s.logoHide && (s.ec === 'L' || s.ec === 'M') && s.logoSize > 20) {
        warnings.push('A logo this large needs Quartile or High error correction to scan reliably.');
      }
      if (s.marginPct < 2) {
        warnings.push('Scanners expect an empty margin around the code. Keep some unless you add your own.');
      }
    }

    els.warnings.replaceChildren(...warnings.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
  }

  /* ---------- Export ---------- */

  function exportInstance(extension) {
    // JPEG has no alpha channel, so a transparent background would come out black.
    const overrides = extension === 'jpeg' && state.style.transparent
      ? { transparent: false, bg: '#ffffff' }
      : null;
    return new QRCodeStyling(buildOptions(currentPayload, overrides));
  }

  function flash(button, text) {
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = text;
    setTimeout(() => { button.textContent = original; }, 1600);
  }

  function bindExport() {
    $$('[data-download]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!currentPayload) return;
        const extension = button.dataset.download;
        exportInstance(extension).download({ name: 'qr-code', extension });
      });
    });

    els.copy.addEventListener('click', async () => {
      if (!currentPayload) return;
      try {
        const blob = exportInstance('png').getRawData('png');
        // Passing the promise keeps Safari's user-gesture requirement satisfied.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        flash(els.copy, 'Copied');
      } catch (e) {
        flash(els.copy, 'Copy isn’t supported here');
      }
    });
  }

  /* ---------- Init ---------- */

  chipGroup(
    els.typeChips, 'type',
    Object.keys(TYPES).map((key) => [key, TYPES[key].label]),
    state.type,
    (value) => {
      state.type = value;
      renderFields();
      scheduleRender();
    }
  );

  renderFields();
  bindDesignControls();
  syncDesignControls();
  bindExport();
  render();
})();
