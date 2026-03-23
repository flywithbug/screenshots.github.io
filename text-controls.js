(function (global) {
    function setupTextPanelControls(ctx) {
        const {
            getTextSettings,
            setTextValue,
            setTextLanguageValue,
            updateCanvas,
            formatValue
        } = ctx;

        const perLanguageLayoutToggle = document.getElementById('per-language-layout-toggle');
        if (perLanguageLayoutToggle) {
            perLanguageLayoutToggle.addEventListener('click', function () {
                this.classList.toggle('active');
                const enabled = this.classList.contains('active');
                const text = getTextSettings();
                if (enabled && !text.perLanguageLayout) {
                    // Seed all language settings from current global values.
                    const languages = new Set([...(text.headlineLanguages || ['en']), ...(text.subheadlineLanguages || ['en'])]);
                    if (!text.languageSettings) text.languageSettings = {};
                    languages.forEach(lang => {
                        text.languageSettings[lang] = {
                            headlineSize: text.headlineSize || 100,
                            subheadlineSize: text.subheadlineSize || 50,
                            position: text.position || 'top',
                            offsetY: typeof text.offsetY === 'number' ? text.offsetY : 12,
                            lineHeight: text.lineHeight || 110
                        };
                    });
                }
                text.perLanguageLayout = enabled;
                updateCanvas();
            });
        }

        const headlineToggle = document.getElementById('headline-toggle');
        if (headlineToggle) {
            headlineToggle.addEventListener('click', function () {
                this.classList.toggle('active');
                const enabled = this.classList.contains('active');
                setTextValue('headlineEnabled', enabled);
                const row = this.closest('.toggle-row');
                if (enabled) {
                    if (row) row.classList.remove('collapsed');
                    document.getElementById('headline-options').style.display = 'block';
                } else {
                    if (row) row.classList.add('collapsed');
                    document.getElementById('headline-options').style.display = 'none';
                }
                updateCanvas();
            });
        }

        const subheadlineToggle = document.getElementById('subheadline-toggle');
        if (subheadlineToggle) {
            subheadlineToggle.addEventListener('click', function () {
                this.classList.toggle('active');
                const enabled = this.classList.contains('active');
                setTextValue('subheadlineEnabled', enabled);
                const row = this.closest('.toggle-row');
                if (enabled) {
                    if (row) row.classList.remove('collapsed');
                    document.getElementById('subheadline-options').style.display = 'block';
                } else {
                    if (row) row.classList.add('collapsed');
                    document.getElementById('subheadline-options').style.display = 'none';
                }
                updateCanvas();
            });
        }

        const headlineText = document.getElementById('headline-text');
        if (headlineText) {
            headlineText.addEventListener('input', (e) => {
                const text = getTextSettings();
                if (!text.headlines) text.headlines = { en: '' };
                text.headlines[text.currentHeadlineLang || 'en'] = e.target.value;
                updateCanvas();
            });
        }

        const headlineSize = document.getElementById('headline-size');
        if (headlineSize) {
            headlineSize.addEventListener('input', (e) => {
                const text = getTextSettings();
                const lang = text.currentHeadlineLang || 'en';
                setTextLanguageValue('headlineSize', parseInt(e.target.value) || 100, lang);
                updateCanvas();
            });
        }

        const headlineColor = document.getElementById('headline-color');
        if (headlineColor) {
            headlineColor.addEventListener('input', (e) => {
                setTextValue('headlineColor', e.target.value);
                updateCanvas();
            });
        }

        const headlineWeight = document.getElementById('headline-weight');
        if (headlineWeight) {
            headlineWeight.addEventListener('change', (e) => {
                setTextValue('headlineWeight', e.target.value);
                updateCanvas();
            });
        }

        document.querySelectorAll('#headline-style button').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.style;
                const key = 'headline' + style.charAt(0).toUpperCase() + style.slice(1);
                const text = getTextSettings();
                const newValue = !text[key];
                setTextValue(key, newValue);
                btn.classList.toggle('active', newValue);
                updateCanvas();
            });
        });

        document.querySelectorAll('#text-position button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#text-position button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                setTextLanguageValue('position', btn.dataset.position);
                updateCanvas();
            });
        });

        const textOffsetY = document.getElementById('text-offset-y');
        if (textOffsetY) {
            textOffsetY.addEventListener('input', (e) => {
                setTextLanguageValue('offsetY', parseInt(e.target.value));
                document.getElementById('text-offset-y-value').textContent = formatValue(e.target.value) + '%';
                updateCanvas();
            });
        }

        const lineHeight = document.getElementById('line-height');
        if (lineHeight) {
            lineHeight.addEventListener('input', (e) => {
                setTextLanguageValue('lineHeight', parseInt(e.target.value));
                document.getElementById('line-height-value').textContent = formatValue(e.target.value) + '%';
                updateCanvas();
            });
        }

        const subheadlineText = document.getElementById('subheadline-text');
        if (subheadlineText) {
            subheadlineText.addEventListener('input', (e) => {
                const text = getTextSettings();
                if (!text.subheadlines) text.subheadlines = { en: '' };
                text.subheadlines[text.currentSubheadlineLang || 'en'] = e.target.value;
                updateCanvas();
            });
        }

        const subheadlineSize = document.getElementById('subheadline-size');
        if (subheadlineSize) {
            subheadlineSize.addEventListener('input', (e) => {
                const text = getTextSettings();
                const lang = text.currentSubheadlineLang || 'en';
                setTextLanguageValue('subheadlineSize', parseInt(e.target.value) || 50, lang);
                updateCanvas();
            });
        }

        const subheadlineColor = document.getElementById('subheadline-color');
        if (subheadlineColor) {
            subheadlineColor.addEventListener('input', (e) => {
                setTextValue('subheadlineColor', e.target.value);
                updateCanvas();
            });
        }

        const subheadlineOpacity = document.getElementById('subheadline-opacity');
        if (subheadlineOpacity) {
            subheadlineOpacity.addEventListener('input', (e) => {
                const value = parseInt(e.target.value) || 70;
                setTextValue('subheadlineOpacity', value);
                document.getElementById('subheadline-opacity-value').textContent = formatValue(value) + '%';
                updateCanvas();
            });
        }

        const subheadlineWeight = document.getElementById('subheadline-weight');
        if (subheadlineWeight) {
            subheadlineWeight.addEventListener('change', (e) => {
                setTextValue('subheadlineWeight', e.target.value);
                updateCanvas();
            });
        }

        document.querySelectorAll('#subheadline-style button').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.style;
                const key = 'subheadline' + style.charAt(0).toUpperCase() + style.slice(1);
                const text = getTextSettings();
                const newValue = !text[key];
                setTextValue(key, newValue);
                btn.classList.toggle('active', newValue);
                updateCanvas();
            });
        });
    }

    function setupElementTextControls(ctx) {
        const {
            getSelectedElement,
            setElementProperty,
            updateCanvas,
            updateElementsList,
            state,
            bindSlider
        } = ctx;

        if (typeof bindSlider === 'function') {
            bindSlider('element-font-size', 'fontSize', '', parseInt);
            bindSlider('element-frame-scale', 'frameScale', '%');
        }

        const textInput = document.getElementById('element-text-input');
        if (textInput) {
            textInput.addEventListener('input', () => {
                const el = getSelectedElement();
                if (!el || el.type !== 'text') return;
                if (!el.texts) el.texts = {};
                el.texts[state.currentLanguage] = textInput.value;
                el.text = textInput.value; // sync for backwards compat
                updateCanvas();
                updateElementsList();
            });
        }

        const fontColor = document.getElementById('element-font-color');
        if (fontColor) {
            fontColor.addEventListener('input', () => {
                const el = getSelectedElement();
                if (el && el.type === 'text') setElementProperty(el.id, 'fontColor', fontColor.value);
            });
        }

        const fontWeight = document.getElementById('element-font-weight');
        if (fontWeight) {
            fontWeight.addEventListener('change', () => {
                const el = getSelectedElement();
                if (el && el.type === 'text') setElementProperty(el.id, 'fontWeight', fontWeight.value);
            });
        }

        const italicBtn = document.getElementById('element-italic-btn');
        if (italicBtn) {
            italicBtn.addEventListener('click', () => {
                const el = getSelectedElement();
                if (!el || el.type !== 'text') return;
                setElementProperty(el.id, 'italic', !el.italic);
                italicBtn.classList.toggle('active', !el.italic);
            });
        }

        const frameSelect = document.getElementById('element-frame');
        if (frameSelect) {
            frameSelect.addEventListener('change', () => {
                const el = getSelectedElement();
                if (!el || el.type !== 'text') return;
                setElementProperty(el.id, 'frame', frameSelect.value);
                document.getElementById('element-frame-options').style.display =
                    frameSelect.value !== 'none' ? '' : 'none';
            });
        }

        const frameColor = document.getElementById('element-frame-color');
        const frameColorHex = document.getElementById('element-frame-color-hex');
        if (frameColor) {
            frameColor.addEventListener('input', () => {
                const el = getSelectedElement();
                if (!el || el.type !== 'text') return;
                setElementProperty(el.id, 'frameColor', frameColor.value);
                if (frameColorHex) frameColorHex.value = frameColor.value;
            });
        }
        if (frameColorHex) {
            frameColorHex.addEventListener('change', () => {
                const el = getSelectedElement();
                if (!el || el.type !== 'text') return;
                if (/^#[0-9a-fA-F]{6}$/.test(frameColorHex.value)) {
                    setElementProperty(el.id, 'frameColor', frameColorHex.value);
                    if (frameColor) frameColor.value = frameColorHex.value;
                }
            });
        }

    }

    global.TextControls = {
        setupTextPanelControls,
        setupElementTextControls
    };
})(window);
