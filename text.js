(function (global) {
    function createTextApi(context) {
        const {
            state,
            baseTextDefaults,
            getCurrentScreenshot,
            setTextSetting,
            updateFontPickerPreview,
            formatValue,
            ctx,
            getCanvasDimensions
        } = context;

        function getTextLayoutLanguage(text) {
            if (text.currentLayoutLang) return text.currentLayoutLang;
            if (text.headlineEnabled !== false) return text.currentHeadlineLang || 'en';
            if (text.subheadlineEnabled) return text.currentSubheadlineLang || 'en';
            return text.currentHeadlineLang || text.currentSubheadlineLang || 'en';
        }

        function getTextLanguageSettings(text, lang) {
            if (!text.languageSettings) text.languageSettings = {};
            if (!text.languageSettings[lang]) {
                const sourceLang = text.currentLayoutLang || text.currentHeadlineLang || text.currentSubheadlineLang || 'en';
                const sourceSettings = text.languageSettings[sourceLang];
                text.languageSettings[lang] = {
                    headlineSize: sourceSettings ? sourceSettings.headlineSize : (text.headlineSize || 100),
                    subheadlineSize: sourceSettings ? sourceSettings.subheadlineSize : (text.subheadlineSize || 50),
                    position: sourceSettings ? sourceSettings.position : (text.position || 'top'),
                    offsetY: sourceSettings ? sourceSettings.offsetY : (typeof text.offsetY === 'number' ? text.offsetY : 12),
                    lineHeight: sourceSettings ? sourceSettings.lineHeight : (text.lineHeight || 110)
                };
            }
            return text.languageSettings[lang];
        }

        function getEffectiveLayout(text, lang) {
            if (!text.perLanguageLayout) {
                return {
                    headlineSize: text.headlineSize || 100,
                    subheadlineSize: text.subheadlineSize || 50,
                    position: text.position || 'top',
                    offsetY: typeof text.offsetY === 'number' ? text.offsetY : 12,
                    lineHeight: text.lineHeight || 110
                };
            }
            return getTextLanguageSettings(text, lang);
        }

        function normalizeTextSettings(text) {
            const merged = JSON.parse(JSON.stringify(baseTextDefaults));
            if (text) {
                Object.assign(merged, text);
                if (text.languageSettings) {
                    merged.languageSettings = JSON.parse(JSON.stringify(text.languageSettings));
                }
            }

            merged.headlines = merged.headlines || { en: '' };
            merged.headlineLanguages = merged.headlineLanguages || ['en'];
            merged.currentHeadlineLang = merged.currentHeadlineLang || merged.headlineLanguages[0] || 'en';
            merged.currentLayoutLang = merged.currentLayoutLang || merged.currentHeadlineLang || 'en';

            merged.subheadlines = merged.subheadlines || { en: '' };
            merged.subheadlineLanguages = merged.subheadlineLanguages || ['en'];
            merged.currentSubheadlineLang = merged.currentSubheadlineLang || merged.subheadlineLanguages[0] || 'en';

            if (!merged.languageSettings) merged.languageSettings = {};
            const languages = new Set([...merged.headlineLanguages, ...merged.subheadlineLanguages]);
            if (languages.size === 0) languages.add('en');
            languages.forEach((lang) => {
                getTextLanguageSettings(merged, lang);
            });

            return merged;
        }

        function getText() {
            const screenshot = getCurrentScreenshot();
            if (screenshot) {
                screenshot.text = normalizeTextSettings(screenshot.text);
                return screenshot.text;
            }
            state.defaults.text = normalizeTextSettings(state.defaults.text);
            return state.defaults.text;
        }

        function setTextValue(key, value) {
            setTextSetting(key, value);
        }

        function setTextLanguageValue(key, value, lang = null) {
            const text = getTextSettings();
            if (!text.perLanguageLayout) {
                text[key] = value;
                return;
            }
            const targetLang = lang || getTextLayoutLanguage(text);
            const settings = getTextLanguageSettings(text, targetLang);
            settings[key] = value;
            text.currentLayoutLang = targetLang;
        }

        function getTextSettings() {
            return getText();
        }

        function updateTextUI(text) {
            const headlineLang = text.currentHeadlineLang || 'en';
            const subheadlineLang = text.currentSubheadlineLang || 'en';
            const layoutLang = getTextLayoutLanguage(text);
            const headlineLayout = getEffectiveLayout(text, headlineLang);
            const subheadlineLayout = getEffectiveLayout(text, subheadlineLang);
            const layoutSettings = getEffectiveLayout(text, layoutLang);
            const headlineText = text.headlines ? (text.headlines[headlineLang] || '') : (text.headline || '');
            const subheadlineText = text.subheadlines ? (text.subheadlines[subheadlineLang] || '') : (text.subheadline || '');

            document.getElementById('headline-text').value = headlineText;
            document.getElementById('headline-font').value = text.headlineFont;
            updateFontPickerPreview();
            document.getElementById('headline-size').value = headlineLayout.headlineSize;
            document.getElementById('headline-color').value = text.headlineColor;
            document.getElementById('headline-weight').value = text.headlineWeight;
            document.querySelectorAll('#headline-style button').forEach(btn => {
                const style = btn.dataset.style;
                const key = 'headline' + style.charAt(0).toUpperCase() + style.slice(1);
                btn.classList.toggle('active', text[key] || false);
            });
            document.querySelectorAll('#text-position button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.position === layoutSettings.position);
            });
            document.getElementById('text-offset-y').value = layoutSettings.offsetY;
            document.getElementById('text-offset-y-value').textContent = formatValue(layoutSettings.offsetY) + '%';
            document.getElementById('line-height').value = layoutSettings.lineHeight;
            document.getElementById('line-height-value').textContent = formatValue(layoutSettings.lineHeight) + '%';
            document.getElementById('subheadline-text').value = subheadlineText;
            document.getElementById('subheadline-font').value = text.subheadlineFont || text.headlineFont;
            document.getElementById('subheadline-size').value = subheadlineLayout.subheadlineSize;
            document.getElementById('subheadline-color').value = text.subheadlineColor;
            document.getElementById('subheadline-opacity').value = text.subheadlineOpacity;
            document.getElementById('subheadline-opacity-value').textContent = formatValue(text.subheadlineOpacity) + '%';
            document.getElementById('subheadline-weight').value = text.subheadlineWeight || '400';
            document.querySelectorAll('#subheadline-style button').forEach(btn => {
                const style = btn.dataset.style;
                const key = 'subheadline' + style.charAt(0).toUpperCase() + style.slice(1);
                btn.classList.toggle('active', text[key] || false);
            });
        }

        function loadTextUIFromScreenshot() {
            updateTextUI(getText());
        }

        function loadTextUIFromGlobal() {
            updateTextUI(state.defaults.text);
        }

        function wrapText(targetCtx, text, maxWidth) {
            const lines = [];
            const rawLines = String(text).split(/\r?\n/);

            rawLines.forEach((rawLine) => {
                if (rawLine === '') {
                    lines.push('');
                    return;
                }

                const words = rawLine.split(' ');
                let currentLine = '';

                words.forEach(word => {
                    const testLine = currentLine + (currentLine ? ' ' : '') + word;
                    const metrics = targetCtx.measureText(testLine);

                    if (metrics.width > maxWidth && currentLine) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        currentLine = testLine;
                    }
                });

                if (currentLine) {
                    lines.push(currentLine);
                }
            });

            return lines;
        }

        function parseRichTextMarkup(text, baseStyle = {}) {
            const input = String(text || '');
            const runs = [];
            const stack = [Object.assign({}, baseStyle)];
            const tagRegex = /\[([^[\]]+)\]/g;
            let lastIndex = 0;

            function pushText(part) {
                if (!part) return;
                runs.push({
                    text: part,
                    style: Object.assign({}, stack[stack.length - 1])
                });
            }

            function parseTagContent(raw) {
                const trimmed = raw.trim();
                if (!trimmed) return null;
                if (trimmed === '/' || trimmed.toLowerCase() === 'end') {
                    return { type: 'close' };
                }

                const next = Object.assign({}, stack[stack.length - 1]);
                const tokenRegex = /([a-zA-Z]+)=("[^"]*"|'[^']*'|[^\s]+)|([a-zA-Z]+)/g;
                let match;
                while ((match = tokenRegex.exec(trimmed)) !== null) {
                    if (match[3]) {
                        const flag = match[3].toLowerCase();
                        if (flag === 'b') next.fontWeight = '700';
                        if (flag === 'i') next.italic = true;
                        if (flag === 'u') next.underline = true;
                        if (flag === 's' || flag === 'strike') next.strikethrough = true;
                        continue;
                    }

                    const key = match[1].toLowerCase();
                    let value = match[2] || '';
                    value = value.replace(/^['"]|['"]$/g, '');

                    if (key === 'color' || key === 'c') next.color = value;
                    if (key === 'size' || key === 'fs') next.fontSize = Math.max(1, parseFloat(value) || next.fontSize);
                    if (key === 'weight' || key === 'w') next.fontWeight = String(value);
                    if (key === 'font' || key === 'ff') next.font = value;
                    if (key === 'italic') next.italic = value !== 'false' && value !== '0';
                    if (key === 'underline' || key === 'u') next.underline = value !== 'false' && value !== '0';
                    if (key === 'strikethrough' || key === 'strike' || key === 's') next.strikethrough = value !== 'false' && value !== '0';
                    if (key === 'gradient' || key === 'grad' || key === 'g') {
                        const colors = value.split(',').map(c => c.trim()).filter(Boolean);
                        if (colors.length >= 2) next.gradient = colors;
                    }
                }

                return { type: 'open', style: next };
            }

            let m;
            while ((m = tagRegex.exec(input)) !== null) {
                pushText(input.slice(lastIndex, m.index));
                const parsed = parseTagContent(m[1]);
                if (!parsed) {
                    pushText(m[0]);
                } else if (parsed.type === 'close') {
                    if (stack.length > 1) stack.pop();
                } else {
                    stack.push(parsed.style);
                }
                lastIndex = m.index + m[0].length;
            }
            pushText(input.slice(lastIndex));

            return runs.length ? runs : [{ text: '', style: Object.assign({}, baseStyle) }];
        }

        function setContextFontForStyle(targetCtx, style) {
            const italic = style.italic ? 'italic' : 'normal';
            const weight = style.fontWeight || '400';
            const size = style.fontSize || 16;
            const font = style.font || "-apple-system, BlinkMacSystemFont, 'SF Pro Display'";
            targetCtx.font = `${italic} ${weight} ${size}px ${font}`;
        }

        function measureRichRunText(targetCtx, text, style) {
            setContextFontForStyle(targetCtx, style);
            return targetCtx.measureText(text).width;
        }

        function splitLongTokenByWidth(targetCtx, token, style, maxWidth) {
            const parts = [];
            let current = '';
            for (const ch of Array.from(token)) {
                const test = current + ch;
                const w = measureRichRunText(targetCtx, test, style);
                if (w > maxWidth && current) {
                    parts.push(current);
                    current = ch;
                } else {
                    current = test;
                }
            }
            if (current) parts.push(current);
            return parts;
        }

        function layoutRichTextRuns(targetCtx, runs, maxWidth, lineHeightFactor = 1.05, minLineHeight = 12) {
            const lines = [];
            let line = [];
            let lineWidth = 0;
            let lineMaxSize = minLineHeight;

            function pushLine(forceEmpty = false) {
                if (line.length === 0 && !forceEmpty) return;
                const lineHeight = Math.max(minLineHeight, lineMaxSize * lineHeightFactor);
                lines.push({
                    segments: line,
                    width: lineWidth,
                    maxFontSize: lineMaxSize,
                    lineHeight
                });
                line = [];
                lineWidth = 0;
                lineMaxSize = minLineHeight;
            }

            function appendSegment(text, style) {
                if (!text) return;
                const width = measureRichRunText(targetCtx, text, style);
                if (lineWidth + width <= maxWidth || lineWidth === 0) {
                    line.push({ text, style, width });
                    lineWidth += width;
                    lineMaxSize = Math.max(lineMaxSize, style.fontSize || minLineHeight);
                    return;
                }

                if (/^\s+$/.test(text)) {
                    pushLine(false);
                    return;
                }

                if (width > maxWidth) {
                    const pieces = splitLongTokenByWidth(targetCtx, text, style, maxWidth);
                    pieces.forEach((piece, idx) => {
                        const pieceWidth = measureRichRunText(targetCtx, piece, style);
                        if (lineWidth + pieceWidth > maxWidth && lineWidth > 0) {
                            pushLine(false);
                        }
                        line.push({ text: piece, style, width: pieceWidth });
                        lineWidth += pieceWidth;
                        lineMaxSize = Math.max(lineMaxSize, style.fontSize || minLineHeight);
                        if (idx < pieces.length - 1) pushLine(false);
                    });
                    return;
                }

                pushLine(false);
                line.push({ text, style, width });
                lineWidth += width;
                lineMaxSize = Math.max(lineMaxSize, style.fontSize || minLineHeight);
            }

            runs.forEach(run => {
                const style = run.style || {};
                const parts = String(run.text || '').split('\n');
                parts.forEach((part, idx) => {
                    const tokens = part.match(/\S+|\s+/g) || [''];
                    tokens.forEach(token => appendSegment(token, style));
                    if (idx < parts.length - 1) pushLine(true);
                });
            });
            pushLine(lines.length === 0);

            const maxLineWidth = lines.length ? Math.max(...lines.map(l => l.width)) : 0;
            const totalHeight = lines.reduce((sum, l) => sum + l.lineHeight, 0);
            return { lines, maxLineWidth, totalHeight };
        }

        function createTextGradient(targetCtx, x, y, width, colors) {
            const safeWidth = Math.max(1, width);
            const gradient = targetCtx.createLinearGradient(x, y, x + safeWidth, y);
            const stops = Array.isArray(colors) ? colors : [];
            stops.forEach((color, idx) => {
                const stop = stops.length === 1 ? 0 : (idx / (stops.length - 1));
                gradient.addColorStop(stop, color);
            });
            return gradient;
        }

        function drawRichTextLines(targetCtx, layout, opts = {}) {
            const {
                centerX = 0,
                startY = 0,
                baseColor = '#ffffff',
                textBaseline = 'top',
                useAlpha = 1
            } = opts;

            targetCtx.textAlign = 'left';
            targetCtx.textBaseline = textBaseline;

            let y = startY;
            layout.lines.forEach(line => {
                let x = centerX - line.width / 2;
                line.segments.forEach(seg => {
                    const style = seg.style || {};
                    setContextFontForStyle(targetCtx, style);
                    if (style.gradient && style.gradient.length >= 2) {
                        targetCtx.fillStyle = createTextGradient(targetCtx, x, y, seg.width, style.gradient);
                    } else {
                        targetCtx.fillStyle = style.color || baseColor;
                    }

                    if (useAlpha !== 1) targetCtx.globalAlpha = useAlpha;
                    targetCtx.fillText(seg.text, x, y);
                    if (useAlpha !== 1) targetCtx.globalAlpha = 1;

                    const fontSize = style.fontSize || 16;
                    const lineThickness = Math.max(1.5, fontSize * 0.05);
                    if (style.underline) {
                        targetCtx.fillRect(x, y + fontSize * 0.9, seg.width, lineThickness);
                    }
                    if (style.strikethrough) {
                        targetCtx.fillRect(x, y + fontSize * 0.45, seg.width, lineThickness);
                    }

                    x += seg.width;
                });
                y += line.lineHeight;
            });
        }

        function drawTextToContext(targetCtx, dims, textSettings) {
            const headlineEnabled = textSettings.headlineEnabled !== false;
            const subheadlineEnabled = textSettings.subheadlineEnabled || false;

            const headlineLang = textSettings.currentHeadlineLang || 'en';
            const subheadlineLang = textSettings.currentSubheadlineLang || 'en';
            const layoutLang = getTextLayoutLanguage(textSettings);
            const headlineLayout = getEffectiveLayout(textSettings, headlineLang);
            const subheadlineLayout = getEffectiveLayout(textSettings, subheadlineLang);
            const layoutSettings = getEffectiveLayout(textSettings, layoutLang);

            const headline = headlineEnabled && textSettings.headlines ? (textSettings.headlines[headlineLang] || '') : '';
            const subheadline = subheadlineEnabled && textSettings.subheadlines ? (textSettings.subheadlines[subheadlineLang] || '') : '';

            if (!headline && !subheadline) return;

            const padding = dims.width * 0.08;
            const textY = layoutSettings.position === 'top'
                ? dims.height * (layoutSettings.offsetY / 100)
                : dims.height * (1 - layoutSettings.offsetY / 100);

            const maxWidth = dims.width - padding * 2;
            const isTop = layoutSettings.position === 'top';

            let headlineRich = null;
            if (headline) {
                const headlineRuns = parseRichTextMarkup(headline, {
                    font: textSettings.headlineFont,
                    fontSize: headlineLayout.headlineSize,
                    fontWeight: textSettings.headlineWeight,
                    color: textSettings.headlineColor,
                    italic: textSettings.headlineItalic,
                    underline: textSettings.headlineUnderline,
                    strikethrough: textSettings.headlineStrikethrough
                });
                headlineRich = layoutRichTextRuns(
                    targetCtx,
                    headlineRuns,
                    maxWidth,
                    layoutSettings.lineHeight / 100,
                    headlineLayout.headlineSize
                );
            }

            let subheadlineRich = null;
            if (subheadline) {
                const subheadlineRuns = parseRichTextMarkup(subheadline, {
                    font: textSettings.subheadlineFont || textSettings.headlineFont,
                    fontSize: subheadlineLayout.subheadlineSize,
                    fontWeight: textSettings.subheadlineWeight || '400',
                    color: textSettings.subheadlineColor,
                    italic: textSettings.subheadlineItalic,
                    underline: textSettings.subheadlineUnderline,
                    strikethrough: textSettings.subheadlineStrikethrough
                });
                subheadlineRich = layoutRichTextRuns(
                    targetCtx,
                    subheadlineRuns,
                    maxWidth,
                    1.4,
                    subheadlineLayout.subheadlineSize
                );
            }

            const headlineGap = headlineRich ? (headlineLayout.headlineSize * (layoutSettings.lineHeight / 100) - headlineLayout.headlineSize) : 0;
            let currentY = isTop ? textY : textY - (headlineRich ? headlineRich.totalHeight : 0);

            if (headlineRich) {
                drawRichTextLines(targetCtx, headlineRich, {
                    centerX: dims.width / 2,
                    startY: currentY,
                    baseColor: textSettings.headlineColor,
                    textBaseline: 'top'
                });
                currentY += headlineRich.totalHeight + Math.max(0, headlineGap);
            }

            if (subheadlineRich) {
                drawRichTextLines(targetCtx, subheadlineRich, {
                    centerX: dims.width / 2,
                    startY: currentY,
                    baseColor: textSettings.subheadlineColor,
                    textBaseline: 'top',
                    useAlpha: textSettings.subheadlineOpacity / 100
                });
            }
        }

        function drawText() {
            drawTextToContext(ctx, getCanvasDimensions(), getTextSettings());
        }

        return {
            getText,
            getTextLayoutLanguage,
            getTextLanguageSettings,
            getEffectiveLayout,
            normalizeTextSettings,
            setTextValue,
            setTextLanguageValue,
            getTextSettings,
            loadTextUIFromScreenshot,
            loadTextUIFromGlobal,
            updateTextUI,
            drawTextToContext,
            drawText,
            wrapText,
            parseRichTextMarkup,
            setContextFontForStyle,
            measureRichRunText,
            splitLongTokenByWidth,
            layoutRichTextRuns,
            createTextGradient,
            drawRichTextLines
        };
    }

    global.TextModule = {
        createTextApi
    };
})(window);
