// State management
const state = {
    screenshots: [],
    selectedIndex: 0,
    transferTarget: null, // Index of screenshot waiting to receive style transfer
    outputDevice: 'iphone-6.9',
    exportDevices: ['iphone-6.9'],
    currentLanguage: 'en', // Global current language for all text
    projectLanguages: ['en'], // Languages available in this project
    customWidth: 1290,
    customHeight: 2796,
    // Default settings applied to new screenshots
    defaults: {
        background: {
            type: 'gradient',
            gradient: {
                angle: 135,
                stops: [
                    { color: '#667eea', position: 0 },
                    { color: '#764ba2', position: 100 }
                ]
            },
            solid: '#1a1a2e',
            image: null,
            imageSrc: null,
            imageFit: 'cover',
            imageBlur: 0,
            overlayColor: '#000000',
            overlayOpacity: 0,
            noise: false,
            noiseIntensity: 10
        },
        screenshot: {
            scale: 70,
            y: 60,
            x: 50,
            rotation: 0,
            perspective: 0,
            cornerRadius: 24,
            use3D: false,
            device3D: 'iphone',
            rotation3D: { x: 0, y: 0, z: 0 },
            shadow: {
                enabled: true,
                color: '#000000',
                blur: 40,
                opacity: 30,
                x: 0,
                y: 20
            },
            frame: {
                enabled: false,
                color: '#1d1d1f',
                width: 12,
                opacity: 100
            }
        },
        text: {
            headlineEnabled: true,
            headlines: { en: '' },
            headlineLanguages: ['en'],
            currentHeadlineLang: 'en',
            headlineFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
            headlineSize: 100,
            headlineWeight: '600',
            headlineItalic: false,
            headlineUnderline: false,
            headlineStrikethrough: false,
            headlineColor: '#ffffff',
            perLanguageLayout: false,
            languageSettings: {
                en: {
                    headlineSize: 100,
                    subheadlineSize: 50,
                    position: 'top',
                    offsetY: 12,
                    lineHeight: 110
                }
            },
            currentLayoutLang: 'en',
            position: 'top',
            offsetY: 12,
            lineHeight: 110,
            subheadlineEnabled: false,
            subheadlines: { en: '' },
            subheadlineLanguages: ['en'],
            currentSubheadlineLang: 'en',
            subheadlineFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
            subheadlineSize: 50,
            subheadlineWeight: '400',
            subheadlineItalic: false,
            subheadlineUnderline: false,
            subheadlineStrikethrough: false,
            subheadlineColor: '#ffffff',
            subheadlineOpacity: 70
        },
        elements: [],
        popouts: []
    }
};

const baseTextDefaults = JSON.parse(JSON.stringify(state.defaults.text));
let textApi = null;
const DEFAULT_FALLBACK_DEVICE = 'iphone-6.9';

function initTextApi() {
    if (!window.TextModule?.createTextApi) return;
    textApi = window.TextModule.createTextApi({
        state,
        baseTextDefaults,
        getCurrentScreenshot,
        setTextSetting,
        updateFontPickerPreview,
        formatValue,
        ctx,
        getCanvasDimensions
    });
}

function normalizeExportDevices(devices) {
    const validDevices = new Set(
        Array.from(document.querySelectorAll('.output-size-menu .device-option')).map(opt => opt.dataset.device)
    );
    const list = Array.isArray(devices) ? devices : [];
    const normalized = list.filter(device => validDevices.has(device));
    return normalized.length > 0 ? normalized : [normalizeOutputDevice(state.outputDevice)];
}

function normalizeOutputDevice(device) {
    const validDevices = new Set(
        Array.from(document.querySelectorAll('.output-size-menu .device-option')).map(opt => opt.dataset.device)
    );
    const requested = device || 'iphone-6.9';
    if (validDevices.has(requested)) return requested;
    if (requested === 'iphone-6.7' && validDevices.has('iphone-6.9')) return 'iphone-6.9';
    if (validDevices.has('iphone-6.9')) return 'iphone-6.9';
    const first = validDevices.values().next().value;
    return first || 'iphone-6.9';
}

function ensureDevicePrimaryButtons() {
    document.querySelectorAll('.output-size-menu .device-option').forEach(opt => {
        if (opt.querySelector('.device-primary-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'device-primary-btn';
        btn.textContent = 'Set';
        btn.title = 'Set as primary output device';
        opt.appendChild(btn);
    });
}

// Runtime-only state (not persisted)
let selectedElementId = null;
let selectedPopoutId = null;
let draggingElement = null;

// Preload laurel SVG images for element frames
const laurelImages = {};
['laurel-simple-left', 'laurel-detailed-left'].forEach(name => {
    const img = new Image();
    img.src = `img/${name}.svg`;
    laurelImages[name] = img;
});

// Helper functions to get/set current screenshot settings
function getCurrentScreenshot() {
    if (state.screenshots.length === 0) return null;
    return state.screenshots[state.selectedIndex];
}

function isFallbackDevice(device = state.outputDevice) {
    return device === DEFAULT_FALLBACK_DEVICE;
}

function getDeviceOverrideBucket(screenshot, device = state.outputDevice, createIfMissing = false) {
    if (!screenshot || isFallbackDevice(device)) return null;

    if (!screenshot.deviceOverrides) {
        if (!createIfMissing) return null;
        screenshot.deviceOverrides = {};
    }

    if (!screenshot.deviceOverrides[device] && createIfMissing) {
        screenshot.deviceOverrides[device] = {
            localizedImages: {},
            background: hydrateBackground(JSON.parse(JSON.stringify(screenshot.background || state.defaults.background)))
        };
    }

    return screenshot.deviceOverrides[device] || null;
}

function getLocalizedImagesForDevice(screenshot, device = state.outputDevice, createIfMissing = false) {
    if (!screenshot) return null;

    const deviceBucket = getDeviceOverrideBucket(screenshot, device, createIfMissing);
    if (deviceBucket) {
        if (!deviceBucket.localizedImages && createIfMissing) {
            deviceBucket.localizedImages = {};
        }
        return deviceBucket.localizedImages || {};
    }

    if (!screenshot.localizedImages && createIfMissing) {
        screenshot.localizedImages = {};
    }
    return screenshot.localizedImages || {};
}

function getBackgroundForDevice(screenshot, device = state.outputDevice, createIfMissing = false) {
    if (!screenshot) return state.defaults.background;

    const deviceBucket = getDeviceOverrideBucket(screenshot, device, createIfMissing);
    if (deviceBucket) {
        if (!deviceBucket.background && createIfMissing) {
            deviceBucket.background = hydrateBackground(JSON.parse(JSON.stringify(screenshot.background || state.defaults.background)));
        }
        if (deviceBucket.background) return deviceBucket.background;
    }

    return screenshot.background;
}

function getBackground() {
    const screenshot = getCurrentScreenshot();
    return screenshot ? getBackgroundForDevice(screenshot, state.outputDevice, false) : state.defaults.background;
}

function getScreenshotSettings() {
    const screenshot = getCurrentScreenshot();
    return screenshot ? screenshot.screenshot : state.defaults.screenshot;
}

function getText() {
    return textApi.getText();
}

function getTextLayoutLanguage(text) {
    return textApi.getTextLayoutLanguage(text);
}

function getTextLanguageSettings(text, lang) {
    return textApi.getTextLanguageSettings(text, lang);
}

function getEffectiveLayout(text, lang) {
    return textApi.getEffectiveLayout(text, lang);
}

function normalizeTextSettings(text) {
    return textApi.normalizeTextSettings(text);
}

function getElements() {
    const screenshot = getCurrentScreenshot();
    return screenshot ? (screenshot.elements || []) : [];
}

function getSelectedElement() {
    if (!selectedElementId) return null;
    return getElements().find(el => el.id === selectedElementId) || null;
}

function getElementText(el) {
    if (el.texts) {
        return el.texts[state.currentLanguage]
            || el.texts['en']
            || Object.values(el.texts).find(v => v)
            || el.text || '';
    }
    return el.text || '';
}

function setElementProperty(id, key, value) {
    const elements = getElements();
    const el = elements.find(e => e.id === id);
    if (el) {
        el[key] = value;
        updateCanvas();
        updateElementsList();
    }
}

// ===== Popout accessors =====
function getPopouts() {
    const screenshot = getCurrentScreenshot();
    return screenshot ? (screenshot.popouts || []) : [];
}

function getSelectedPopout() {
    if (!selectedPopoutId) return null;
    return getPopouts().find(p => p.id === selectedPopoutId) || null;
}

function setPopoutProperty(id, key, value) {
    const popouts = getPopouts();
    const p = popouts.find(po => po.id === id);
    if (p) {
        if (key.includes('.')) {
            const parts = key.split('.');
            let obj = p;
            for (let i = 0; i < parts.length - 1; i++) {
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
        } else {
            p[key] = value;
        }
        updateCanvas();
        updatePopoutProperties();
    }
}

function addPopout() {
    const screenshot = getCurrentScreenshot();
    if (!screenshot) return;
    const img = getScreenshotImage(screenshot);
    if (!img) return;
    if (!screenshot.popouts) screenshot.popouts = [];
    const p = {
        id: crypto.randomUUID(),
        cropX: 25, cropY: 25, cropWidth: 30, cropHeight: 30,
        x: 70, y: 30,
        width: 30,
        rotation: 0, opacity: 100, cornerRadius: 12,
        shadow: { enabled: true, color: '#000000', blur: 30, opacity: 40, x: 0, y: 15 },
        border: { enabled: true, color: '#ffffff', width: 3, opacity: 100 }
    };
    screenshot.popouts.push(p);
    selectedPopoutId = p.id;
    updateCanvas();
    updatePopoutsList();
    updatePopoutProperties();
}

function deletePopout(id) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot || !screenshot.popouts) return;
    screenshot.popouts = screenshot.popouts.filter(p => p.id !== id);
    if (selectedPopoutId === id) selectedPopoutId = null;
    updateCanvas();
    updatePopoutsList();
    updatePopoutProperties();
}

function movePopout(id, direction) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot || !screenshot.popouts) return;
    const idx = screenshot.popouts.findIndex(p => p.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx < screenshot.popouts.length - 1) {
        [screenshot.popouts[idx], screenshot.popouts[idx + 1]] = [screenshot.popouts[idx + 1], screenshot.popouts[idx]];
    } else if (direction === 'down' && idx > 0) {
        [screenshot.popouts[idx], screenshot.popouts[idx - 1]] = [screenshot.popouts[idx - 1], screenshot.popouts[idx]];
    }
    updateCanvas();
    updatePopoutsList();
}

function addGraphicElement(img, src, name) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot) return;
    if (!screenshot.elements) screenshot.elements = [];
    const el = {
        id: crypto.randomUUID(),
        type: 'graphic',
        x: 50, y: 50,
        width: 20,
        rotation: 0,
        opacity: 100,
        layer: 'above-text',
        image: img,
        src: src,
        name: name || 'Graphic',
        text: '',
        font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
        fontSize: 60,
        fontWeight: '600',
        fontColor: '#ffffff',
        italic: false,
        frame: 'none',
        frameColor: '#ffffff',
        frameScale: 100
    };
    screenshot.elements.push(el);
    selectedElementId = el.id;
    updateCanvas();
    updateElementsList();
    updateElementProperties();
}

function addTextElement() {
    const screenshot = getCurrentScreenshot();
    if (!screenshot) return;
    if (!screenshot.elements) screenshot.elements = [];
    const el = {
        id: crypto.randomUUID(),
        type: 'text',
        x: 50, y: 50,
        width: 40,
        rotation: 0,
        opacity: 100,
        layer: 'above-text',
        image: null,
        src: null,
        name: 'Text',
        text: 'Your Text',
        texts: { [state.currentLanguage]: 'Your Text' },
        font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
        fontSize: 60,
        fontWeight: '600',
        fontColor: '#ffffff',
        italic: false,
        frame: 'none',
        frameColor: '#ffffff',
        frameScale: 100
    };
    screenshot.elements.push(el);
    selectedElementId = el.id;
    updateCanvas();
    updateElementsList();
    updateElementProperties();
}

// ===== Lucide SVG loading & caching =====
const lucideSVGCache = new Map(); // name -> raw SVG text

async function fetchLucideSVG(name) {
    if (lucideSVGCache.has(name)) return lucideSVGCache.get(name);
    const url = `https://unpkg.com/lucide-static@latest/icons/${name}.svg`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch icon: ${name}`);
    const svgText = await resp.text();
    lucideSVGCache.set(name, svgText);
    return svgText;
}

function colorizeLucideSVG(svgText, color, strokeWidth) {
    return svgText
        .replace(/stroke="currentColor"/g, `stroke="${color}"`)
        .replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
}

async function getLucideImage(name, color, strokeWidth) {
    const rawSVG = await fetchLucideSVG(name);
    const colorized = colorizeLucideSVG(rawSVG, color, strokeWidth);
    const blob = new Blob([colorized], { type: 'image/svg+xml' });
    const blobURL = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = blobURL;
    });
}

async function updateIconImage(el) {
    if (el.type !== 'icon') return;
    try {
        el.image = await getLucideImage(el.iconName, el.iconColor, el.iconStrokeWidth);
        updateCanvas();
    } catch (e) {
        console.error('Failed to update icon image:', e);
    }
}

function addEmojiElement(emoji, name) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot) return;
    if (!screenshot.elements) screenshot.elements = [];
    const el = {
        id: crypto.randomUUID(),
        type: 'emoji',
        x: 50, y: 50,
        width: 15,
        rotation: 0,
        opacity: 100,
        layer: 'above-text',
        emoji: emoji,
        name: name || 'Emoji',
        image: null,
        src: null,
        text: '',
        font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
        fontSize: 60,
        fontWeight: '600',
        fontColor: '#ffffff',
        italic: false,
        frame: 'none',
        frameColor: '#ffffff',
        frameScale: 100
    };
    screenshot.elements.push(el);
    selectedElementId = el.id;
    updateCanvas();
    updateElementsList();
    updateElementProperties();
}

async function addIconElement(iconName) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot) return;
    if (!screenshot.elements) screenshot.elements = [];
    const el = {
        id: crypto.randomUUID(),
        type: 'icon',
        x: 50, y: 50,
        width: 15,
        rotation: 0,
        opacity: 100,
        layer: 'above-text',
        iconName: iconName,
        iconColor: '#ffffff',
        iconStrokeWidth: 2,
        iconShadow: { enabled: false, color: '#000000', blur: 20, opacity: 40, x: 0, y: 10 },
        image: null,
        src: null,
        name: iconName,
        text: '',
        font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
        fontSize: 60,
        fontWeight: '600',
        fontColor: '#ffffff',
        italic: false,
        frame: 'none',
        frameColor: '#ffffff',
        frameScale: 100
    };
    screenshot.elements.push(el);
    selectedElementId = el.id;
    updateElementsList();
    updateElementProperties();
    // Async: fetch icon SVG
    try {
        el.image = await getLucideImage(iconName, el.iconColor, el.iconStrokeWidth);
        updateCanvas();
    } catch (e) {
        console.error('Failed to load icon:', e);
    }
    updateCanvas();
}

function deleteElement(id) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot || !screenshot.elements) return;
    screenshot.elements = screenshot.elements.filter(e => e.id !== id);
    if (selectedElementId === id) selectedElementId = null;
    updateCanvas();
    updateElementsList();
    updateElementProperties();
}

function moveElementLayer(id, direction) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot || !screenshot.elements) return;
    const idx = screenshot.elements.findIndex(e => e.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx < screenshot.elements.length - 1) {
        [screenshot.elements[idx], screenshot.elements[idx + 1]] = [screenshot.elements[idx + 1], screenshot.elements[idx]];
    } else if (direction === 'down' && idx > 0) {
        [screenshot.elements[idx], screenshot.elements[idx - 1]] = [screenshot.elements[idx - 1], screenshot.elements[idx]];
    }
    updateCanvas();
    updateElementsList();
}

// Add reset buttons to all slider control rows
function setupSliderResetButtons() {
    document.querySelectorAll('.control-row input[type="range"]').forEach(slider => {
        const row = slider.closest('.control-row');
        if (!row || row.querySelector('.slider-reset-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'slider-reset-btn';
        btn.title = 'Reset to default';
        btn.type = 'button';
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3 6.75"/><polyline points="3 16 3 10 9 10"/></svg>';
        btn.addEventListener('click', () => {
            slider.value = slider.defaultValue;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        row.appendChild(btn);
    });
}

// Format number to at most 1 decimal place
function formatValue(num) {
    const rounded = Math.round(num * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

function setBackground(key, value) {
    const screenshot = getCurrentScreenshot();
    if (screenshot) {
        const targetBackground = getBackgroundForDevice(screenshot, state.outputDevice, true);
        if (key === 'image') {
            targetBackground.image = value;
            targetBackground.imageSrc = value?.src || null;
            return;
        }
        if (key.includes('.')) {
            const parts = key.split('.');
            let obj = targetBackground;
            for (let i = 0; i < parts.length - 1; i++) {
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
        } else {
            targetBackground[key] = value;
        }
    }
}

function setScreenshotSetting(key, value) {
    const screenshot = getCurrentScreenshot();
    if (screenshot) {
        if (key.includes('.')) {
            const parts = key.split('.');
            let obj = screenshot.screenshot;
            for (let i = 0; i < parts.length - 1; i++) {
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
        } else {
            screenshot.screenshot[key] = value;
        }
    }
}

function setTextSetting(key, value) {
    const screenshot = getCurrentScreenshot();
    if (screenshot) {
        screenshot.text[key] = value;
    }
}

function setCurrentScreenshotAsDefault() {
    const screenshot = getCurrentScreenshot();
    if (screenshot) {
        const currentBackground = getBackground();
        state.defaults.background = JSON.parse(JSON.stringify(currentBackground));
        if (!state.defaults.background.imageSrc && currentBackground?.image?.src) {
            state.defaults.background.imageSrc = currentBackground.image.src;
        }
        state.defaults.background.image = null;
        state.defaults.screenshot = JSON.parse(JSON.stringify(screenshot.screenshot));
        state.defaults.text = JSON.parse(JSON.stringify(screenshot.text));
    }
}

function hydrateLocalizedImagesMap(localizedImages) {
    const hydrated = {};
    if (!localizedImages || typeof localizedImages !== 'object') return hydrated;

    Object.keys(localizedImages).forEach(lang => {
        const langData = localizedImages[lang];
        if (!langData?.src) return;

        const img = new Image();
        img.onload = () => updateCanvas();
        img.src = langData.src;
        hydrated[lang] = {
            image: img,
            src: langData.src,
            name: langData.name
        };
    });

    return hydrated;
}

function serializeLocalizedImagesMap(localizedImages) {
    const serialized = {};
    if (!localizedImages || typeof localizedImages !== 'object') return serialized;

    Object.keys(localizedImages).forEach(lang => {
        const langData = localizedImages[lang];
        const src = langData?.src || langData?.image?.src || null;
        if (!src) return;
        serialized[lang] = {
            src,
            name: langData?.name
        };
    });

    return serialized;
}

function hydrateDeviceOverrides(deviceOverrides) {
    const hydrated = {};
    if (!deviceOverrides || typeof deviceOverrides !== 'object') return hydrated;

    Object.keys(deviceOverrides).forEach(device => {
        const bucket = deviceOverrides[device] || {};
        hydrated[device] = {
            localizedImages: hydrateLocalizedImagesMap(bucket.localizedImages),
            background: hydrateBackground(bucket.background || JSON.parse(JSON.stringify(state.defaults.background)))
        };
    });

    return hydrated;
}

function serializeDeviceOverrides(deviceOverrides) {
    const serialized = {};
    if (!deviceOverrides || typeof deviceOverrides !== 'object') return serialized;

    Object.keys(deviceOverrides).forEach(device => {
        const bucket = deviceOverrides[device];
        if (!bucket) return;
        serialized[device] = {
            localizedImages: serializeLocalizedImagesMap(bucket.localizedImages),
            background: {
                ...(bucket.background || state.defaults.background),
                image: null,
                imageSrc: bucket.background?.imageSrc || bucket.background?.image?.src || null
            }
        };
    });

    return serialized;
}

function hydrateScreenshotDeviceData(screenshot) {
    if (!screenshot || typeof screenshot !== 'object') return screenshot;
    screenshot.deviceOverrides = hydrateDeviceOverrides(screenshot.deviceOverrides);
    return screenshot;
}

function hydrateBackground(background) {
    if (!background || typeof background !== 'object') return background;

    if (!background.imageSrc && background.image?.src) {
        background.imageSrc = background.image.src;
    }

    background.image = null;

    if (background.imageSrc) {
        const img = new Image();
        img.onload = () => {
            background.image = img;
            updateCanvas();
        };
        img.src = background.imageSrc;
        background.image = img;
    }

    return background;
}


// Google Fonts configuration
const googleFonts = {
    loaded: new Set(),
    loading: new Set(),
    // Popular fonts that are commonly used for marketing/app store
    popular: [
        'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Raleway',
        'Nunito', 'Playfair Display', 'Oswald', 'Merriweather', 'Source Sans Pro',
        'PT Sans', 'Ubuntu', 'Rubik', 'Work Sans', 'Quicksand', 'Mulish', 'Barlow',
        'DM Sans', 'Manrope', 'Space Grotesk', 'Plus Jakarta Sans', 'Outfit', 'Sora',
        'Lexend', 'Figtree', 'Albert Sans', 'Urbanist', 'Satoshi', 'General Sans',
        'Bebas Neue', 'Anton', 'Archivo', 'Bitter', 'Cabin', 'Crimson Text',
        'Dancing Script', 'Fira Sans', 'Heebo', 'IBM Plex Sans', 'Josefin Sans',
        'Karla', 'Libre Franklin', 'Lora', 'Noto Sans', 'Nunito Sans', 'Pacifico',
        'Permanent Marker', 'Roboto Condensed', 'Roboto Mono', 'Roboto Slab',
        'Shadows Into Light', 'Signika', 'Slabo 27px', 'Source Code Pro', 'Titillium Web',
        'Varela Round', 'Zilla Slab', 'Arimo', 'Barlow Condensed', 'Catamaran',
        'Comfortaa', 'Cormorant Garamond', 'Dosis', 'EB Garamond', 'Exo 2',
        'Fira Code', 'Hind', 'Inconsolata', 'Indie Flower', 'Jost', 'Kanit',
        'Libre Baskerville', 'Maven Pro', 'Mukta', 'Nanum Gothic', 'Noticia Text',
        'Oxygen', 'Philosopher', 'Play', 'Prompt', 'Rajdhani', 'Red Hat Display',
        'Righteous', 'Saira', 'Sen', 'Spectral', 'Teko', 'Vollkorn', 'Yanone Kaffeesatz',
        'Zeyada', 'Amatic SC', 'Archivo Black', 'Asap', 'Assistant', 'Bangers',
        'BioRhyme', 'Cairo', 'Cardo', 'Chivo', 'Concert One', 'Cormorant',
        'Cousine', 'DM Serif Display', 'DM Serif Text', 'Dela Gothic One',
        'El Messiri', 'Encode Sans', 'Eczar', 'Fahkwang', 'Gelasio'
    ],
    // System fonts that don't need loading
    system: [
        { name: 'SF Pro Display', value: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'" },
        { name: 'SF Pro Rounded', value: "'SF Pro Rounded', -apple-system" },
        { name: 'Helvetica Neue', value: "'Helvetica Neue', Helvetica" },
        { name: 'Avenir Next', value: "'Avenir Next', Avenir" },
        { name: 'Georgia', value: "Georgia, serif" },
        { name: 'Arial', value: "Arial, sans-serif" },
        { name: 'Times New Roman', value: "'Times New Roman', serif" },
        { name: 'Courier New', value: "'Courier New', monospace" },
        { name: 'Verdana', value: "Verdana, sans-serif" },
        { name: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" }
    ],
    // Cache for all Google Fonts (loaded on demand)
    allFonts: null
};

// Load a Google Font dynamically
async function loadGoogleFont(fontName) {
    // Check if it's a system font
    const isSystem = googleFonts.system.some(f => f.name === fontName);
    if (isSystem) return;

    // If already loaded, just ensure the current weight is available
    if (googleFonts.loaded.has(fontName)) {
        const text = getTextSettings();
        const weight = text.headlineWeight || '600';
        try {
            await document.fonts.load(`${weight} 16px "${fontName}"`);
        } catch (e) {
            // Font already loaded, weight might not exist but that's ok
        }
        return;
    }

    // If currently loading, wait for it
    if (googleFonts.loading.has(fontName)) {
        // Wait a bit and check again
        await new Promise(resolve => setTimeout(resolve, 100));
        if (googleFonts.loading.has(fontName)) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return;
    }

    googleFonts.loading.add(fontName);

    try {
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700;800;900&display=swap`;
        link.rel = 'stylesheet';

        // Wait for stylesheet to load first
        await new Promise((resolve, reject) => {
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });

        // Wait for the font to actually load with the required weights
        const text = getTextSettings();
        const headlineWeight = text.headlineWeight || '600';
        const subheadlineWeight = text.subheadlineWeight || '400';

        // Load all weights we might need
        await Promise.all([
            document.fonts.load(`400 16px "${fontName}"`),
            document.fonts.load(`${headlineWeight} 16px "${fontName}"`),
            document.fonts.load(`${subheadlineWeight} 16px "${fontName}"`)
        ]);

        googleFonts.loaded.add(fontName);
        googleFonts.loading.delete(fontName);
    } catch (error) {
        console.warn(`Failed to load font: ${fontName}`, error);
        googleFonts.loading.delete(fontName);
    }
}

// Fetch all Google Fonts from the API (cached)
async function fetchAllGoogleFonts() {
    if (googleFonts.allFonts) {
        return googleFonts.allFonts;
    }

    try {
        // Try to fetch from Google Fonts API v2
        // API key is optional - the API works without it but has lower rate limits
        const apiKey = state.settings?.googleFontsApiKey || '';
        const url = new URL('https://www.googleapis.com/webfonts/v1/webfonts');
        url.searchParams.set('sort', 'popularity');
        if (apiKey) {
            url.searchParams.set('key', apiKey);
        }
        
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.items && data.items.length > 0) {
                    // Extract font family names from API response
                    googleFonts.allFonts = data.items.map(font => font.family);
                    console.log(`Loaded ${googleFonts.allFonts.length} fonts from Google Fonts API`);
                    return googleFonts.allFonts;
                }
            } else if (response.status === 429) {
                console.warn('Google Fonts API rate limit reached, using fallback font list');
            } else {
                console.warn(`Google Fonts API returned status ${response.status}, using fallback font list`);
            }
        } catch (apiError) {
            console.warn('Failed to fetch from Google Fonts API, using fallback font list:', apiError);
        }

        // Fallback to curated list of 1000+ popular fonts
        // This list covers the most commonly used fonts on Google Fonts
        googleFonts.allFonts = [
            ...googleFonts.popular,
            'ABeeZee', 'Abel', 'Abhaya Libre', 'Abril Fatface', 'Aclonica', 'Acme',
            'Actor', 'Adamina', 'Advent Pro', 'Aguafina Script', 'Akronim', 'Aladin',
            'Aldrich', 'Alef', 'Alegreya', 'Alegreya Sans', 'Alegreya Sans SC', 'Alex Brush',
            'Alfa Slab One', 'Alice', 'Alike', 'Alike Angular', 'Allan', 'Allerta',
            'Allison', 'Allura', 'Almendra', 'Amaranth', 'Amatic SC', 'Amethysta',
            'Amiko', 'Amiri', 'Amita', 'Anaheim', 'Andada', 'Andika', 'Angkor',
            'Annie Use Your Telescope', 'Anonymous Pro', 'Antic', 'Antic Didone',
            'Antonio', 'Arapey', 'Arbutus', 'Arbutus Slab', 'Architects Daughter',
            'Archivo Narrow', 'Aref Ruqaa', 'Arima Madurai', 'Arvo', 'Asap Condensed',
            'Asar', 'Asset', 'Astloch', 'Asul', 'Athiti', 'Atkinson Hyperlegible',
            'Atomic Age', 'Aubrey', 'Audiowide', 'Autour One', 'Average', 'Average Sans',
            'Averia Gruesa Libre', 'Averia Libre', 'Averia Sans Libre', 'Averia Serif Libre',
            'B612', 'B612 Mono', 'Bad Script', 'Bahiana', 'Bahianita', 'Bai Jamjuree',
            'Baloo', 'Baloo 2', 'Balsamiq Sans', 'Balthazar', 'Baskervville',
            'Battambang', 'Baumans', 'Bellefair', 'Belleza', 'Bellota', 'Bellota Text',
            'BenchNine', 'Bentham', 'Berkshire Swash', 'Beth Ellen', 'Bevan',
            'Big Shoulders Display', 'Big Shoulders Text', 'Bigelow Rules', 'Bigshot One',
            'Bilbo', 'Bilbo Swash Caps', 'Blinker', 'Bodoni Moda', 'Bokor', 'Bonbon',
            'Boogaloo', 'Bowlby One', 'Bowlby One SC', 'Brawler', 'Bree Serif',
            'Brygada 1918', 'Bubblegum Sans', 'Bubbler One', 'Buda', 'Buenard',
            'Bungee', 'Bungee Hairline', 'Bungee Inline', 'Bungee Outline', 'Bungee Shade',
            'Butcherman', 'Butterfly Kids', 'Cabin Condensed', 'Cabin Sketch', 'Caesar Dressing',
            'Cagliostro', 'Caladea', 'Calistoga', 'Calligraffitti', 'Cambay', 'Cambo',
            'Candal', 'Cantarell', 'Cantata One', 'Cantora One', 'Capriola', 'Cardo',
            'Carme', 'Carrois Gothic', 'Carrois Gothic SC', 'Carter One', 'Castoro',
            'Caveat', 'Caveat Brush', 'Cedarville Cursive', 'Ceviche One', 'Chakra Petch',
            'Changa', 'Changa One', 'Chango', 'Charm', 'Charmonman', 'Chathura',
            'Chau Philomene One', 'Chela One', 'Chelsea Market', 'Chenla', 'Cherry Cream Soda',
            'Cherry Swash', 'Chewy', 'Chicle', 'Chilanka', 'Chonburi', 'Cinzel',
            'Cinzel Decorative', 'Clicker Script', 'Coda', 'Coda Caption', 'Codystar',
            'Coiny', 'Combo', 'Comforter', 'Comforter Brush', 'Comic Neue', 'Coming Soon',
            'Commissioner', 'Condiment', 'Content', 'Contrail One', 'Convergence',
            'Cookie', 'Copse', 'Corben', 'Corinthia', 'Cormorant Infant', 'Cormorant SC',
            'Cormorant Unicase', 'Cormorant Upright', 'Courgette', 'Courier Prime',
            'Covered By Your Grace', 'Crafty Girls', 'Creepster', 'Crete Round',
            'Crimson Pro', 'Croissant One', 'Crushed', 'Cuprum', 'Cute Font',
            'Cutive', 'Cutive Mono', 'Damion', 'Dangrek', 'Darker Grotesque',
            'David Libre', 'Dawning of a New Day', 'Days One', 'Dekko', 'Delius',
            'Delius Swash Caps', 'Delius Unicase', 'Della Respira', 'Denk One',
            'Devonshire', 'Dhurjati', 'Didact Gothic', 'Diplomata', 'Diplomata SC',
            'Do Hyeon', 'Dokdo', 'Domine', 'Donegal One', 'Dongle', 'Doppio One',
            'Dorsa', 'Droid Sans', 'Droid Sans Mono', 'Droid Serif', 'Duru Sans',
            'Dynalight', 'Eagle Lake', 'East Sea Dokdo', 'Eater', 'Economica',
            'Eczar', 'Edu NSW ACT Foundation', 'Edu QLD Beginner', 'Edu SA Beginner',
            'Edu TAS Beginner', 'Edu VIC WA NT Beginner', 'Electrolize', 'Elsie',
            'Elsie Swash Caps', 'Emblema One', 'Emilys Candy', 'Encode Sans Condensed',
            'Encode Sans Expanded', 'Encode Sans Semi Condensed', 'Encode Sans Semi Expanded',
            'Engagement', 'Englebert', 'Enriqueta', 'Ephesis', 'Epilogue', 'Erica One',
            'Esteban', 'Estonia', 'Euphoria Script', 'Ewert', 'Exo', 'Expletus Sans',
            'Explora', 'Fahkwang', 'Fanwood Text', 'Farro', 'Farsan', 'Fascinate',
            'Fascinate Inline', 'Faster One', 'Fasthand', 'Fauna One', 'Faustina',
            'Federant', 'Federo', 'Felipa', 'Fenix', 'Festive', 'Finger Paint',
            'Fira Sans Condensed', 'Fira Sans Extra Condensed', 'Fjalla One', 'Fjord One',
            'Flamenco', 'Flavors', 'Fleur De Leah', 'Flow Block', 'Flow Circular',
            'Flow Rounded', 'Fondamento', 'Fontdiner Swanky', 'Forum', 'Francois One',
            'Frank Ruhl Libre', 'Fraunces', 'Freckle Face', 'Fredericka the Great',
            'Fredoka', 'Fredoka One', 'Freehand', 'Fresca', 'Frijole', 'Fruktur',
            'Fugaz One', 'Fuggles', 'Fuzzy Bubbles', 'GFS Didot', 'GFS Neohellenic',
            'Gabriela', 'Gaegu', 'Gafata', 'Galada', 'Galdeano', 'Galindo', 'Gamja Flower',
            'Gayathri', 'Gelasio', 'Gemunu Libre', 'Genos', 'Gentium Basic', 'Gentium Book Basic',
            'Gentium Book Plus', 'Gentium Plus', 'Geo', 'Georama', 'Geostar', 'Geostar Fill',
            'Germania One', 'Gideon Roman', 'Gidugu', 'Gilda Display', 'Girassol',
            'Give You Glory', 'Glass Antiqua', 'Glegoo', 'Gloria Hallelujah', 'Glory',
            'Gluten', 'Goblin One', 'Gochi Hand', 'Goldman', 'Gorditas', 'Gothic A1',
            'Gotu', 'Goudy Bookletter 1911', 'Gowun Batang', 'Gowun Dodum', 'Graduate',
            'Grand Hotel', 'Grandstander', 'Grape Nuts', 'Gravitas One', 'Great Vibes',
            'Grechen Fuemen', 'Grenze', 'Grenze Gotisch', 'Grey Qo', 'Griffy', 'Gruppo',
            'Gudea', 'Gugi', 'Gupter', 'Gurajada', 'Gwendolyn', 'Habibi', 'Hachi Maru Pop',
            'Hahmlet', 'Halant', 'Hammersmith One', 'Hanalei', 'Hanalei Fill', 'Handlee',
            'Hanuman', 'Happy Monkey', 'Harmattan', 'Headland One', 'Hepta Slab',
            'Herr Von Muellerhoff', 'Hi Melody', 'Hina Mincho', 'Hind Guntur', 'Hind Madurai',
            'Hind Siliguri', 'Hind Vadodara', 'Holtwood One SC', 'Homemade Apple', 'Homenaje',
            'Hubballi', 'Hurricane', 'IBM Plex Mono', 'IBM Plex Sans Condensed', 'IBM Plex Serif',
            'IM Fell DW Pica', 'IM Fell DW Pica SC', 'IM Fell Double Pica', 'IM Fell Double Pica SC',
            'IM Fell English', 'IM Fell English SC', 'IM Fell French Canon', 'IM Fell French Canon SC',
            'IM Fell Great Primer', 'IM Fell Great Primer SC', 'Ibarra Real Nova', 'Iceberg',
            'Iceland', 'Imbue', 'Imperial Script', 'Imprima', 'Inconsolata', 'Inder', 'Ingrid Darling',
            'Inika', 'Inknut Antiqua', 'Inria Sans', 'Inria Serif', 'Inspiration', 'Inter Tight',
            'Irish Grover', 'Island Moments', 'Istok Web', 'Italiana', 'Italianno', 'Itim',
            'Jacques Francois', 'Jacques Francois Shadow', 'Jaldi', 'JetBrains Mono', 'Jim Nightshade',
            'Joan', 'Jockey One', 'Jolly Lodger', 'Jomhuria', 'Jomolhari', 'Josefin Slab',
            'Joti One', 'Jua', 'Judson', 'Julee', 'Julius Sans One', 'Junge', 'Jura',
            'Just Another Hand', 'Just Me Again Down Here', 'K2D', 'Kadwa', 'Kaisei Decol',
            'Kaisei HarunoUmi', 'Kaisei Opti', 'Kaisei Tokumin', 'Kalam', 'Kameron', 'Kanit',
            'Kantumruy', 'Kantumruy Pro', 'Karantina', 'Karla', 'Karma', 'Katibeh', 'Kaushan Script',
            'Kavivanar', 'Kavoon', 'Kdam Thmor Pro', 'Keania One', 'Kelly Slab', 'Kenia',
            'Khand', 'Khmer', 'Khula', 'Kings', 'Kirang Haerang', 'Kite One', 'Kiwi Maru',
            'Klee One', 'Knewave', 'KoHo', 'Kodchasan', 'Koh Santepheap', 'Kolker Brush',
            'Kosugi', 'Kosugi Maru', 'Kotta One', 'Koulen', 'Kranky', 'Kreon', 'Kristi',
            'Krona One', 'Krub', 'Kufam', 'Kulim Park', 'Kumar One', 'Kumar One Outline',
            'Kumbh Sans', 'Kurale', 'La Belle Aurore', 'Lacquer', 'Laila', 'Lakki Reddy',
            'Lalezar', 'Lancelot', 'Langar', 'Lateef', 'League Gothic', 'League Script',
            'League Spartan', 'Leckerli One', 'Ledger', 'Lekton', 'Lemon', 'Lemonada',
            'Lexend Deca', 'Lexend Exa', 'Lexend Giga', 'Lexend Mega', 'Lexend Peta',
            'Lexend Tera', 'Lexend Zetta', 'Libre Barcode 128', 'Libre Barcode 128 Text',
            'Libre Barcode 39', 'Libre Barcode 39 Extended', 'Libre Barcode 39 Extended Text',
            'Libre Barcode 39 Text', 'Libre Barcode EAN13 Text', 'Libre Bodoni', 'Libre Caslon Display',
            'Libre Caslon Text', 'Life Savers', 'Lilita One', 'Lily Script One', 'Limelight',
            'Linden Hill', 'Literata', 'Liu Jian Mao Cao', 'Livvic', 'Lobster', 'Lobster Two',
            'Londrina Outline', 'Londrina Shadow', 'Londrina Sketch', 'Londrina Solid',
            'Long Cang', 'Lora', 'Love Light', 'Love Ya Like A Sister', 'Loved by the King',
            'Lovers Quarrel', 'Luckiest Guy', 'Lusitana', 'Lustria', 'Luxurious Roman',
            'Luxurious Script', 'M PLUS 1', 'M PLUS 1 Code', 'M PLUS 1p', 'M PLUS 2',
            'M PLUS Code Latin', 'M PLUS Rounded 1c', 'Ma Shan Zheng', 'Macondo', 'Macondo Swash Caps',
            'Mada', 'Magra', 'Maiden Orange', 'Maitree', 'Major Mono Display', 'Mako', 'Mali',
            'Mallanna', 'Mandali', 'Manjari', 'Mansalva', 'Manuale', 'Marcellus', 'Marcellus SC',
            'Marck Script', 'Margarine', 'Markazi Text', 'Marko One', 'Marmelad', 'Martel',
            'Martel Sans', 'Marvel', 'Mate', 'Mate SC', 'Material Icons', 'Material Icons Outlined',
            'Material Icons Round', 'Material Icons Sharp', 'Material Icons Two Tone', 'Material Symbols Outlined',
            'Material Symbols Rounded', 'Material Symbols Sharp', 'Maven Pro', 'McLaren', 'Mea Culpa',
            'Meddon', 'MedievalSharp', 'Medula One', 'Meera Inimai', 'Megrim', 'Meie Script',
            'Meow Script', 'Merienda', 'Merienda One', 'Merriweather Sans', 'Metal', 'Metal Mania',
            'Metamorphous', 'Metrophobic', 'Michroma', 'Milonga', 'Miltonian', 'Miltonian Tattoo',
            'Mina', 'Miniver', 'Miriam Libre', 'Mirza', 'Miss Fajardose', 'Mitr', 'Mochiy Pop One',
            'Mochiy Pop P One', 'Modak', 'Modern Antiqua', 'Mogra', 'Mohave', 'Molengo', 'Molle',
            'Monda', 'Monofett', 'Monoton', 'Monsieur La Doulaise', 'Montaga', 'Montagu Slab',
            'MonteCarlo', 'Montez', 'Montserrat Alternates', 'Montserrat Subrayada', 'Moo Lah Lah',
            'Moon Dance', 'Moul', 'Moulpali', 'Mountains of Christmas', 'Mouse Memoirs', 'Mr Bedfort',
            'Mr Dafoe', 'Mr De Haviland', 'Mrs Saint Delafield', 'Mrs Sheppards', 'Ms Madi', 'Mukta Mahee',
            'Mukta Malar', 'Mukta Vaani', 'Muli', 'Murecho', 'MuseoModerno', 'My Soul', 'Mystery Quest',
            'NTR', 'Nanum Brush Script', 'Nanum Gothic Coding', 'Nanum Myeongjo', 'Nanum Pen Script',
            'Neonderthaw', 'Nerko One', 'Neucha', 'Neuton', 'New Rocker', 'New Tegomin', 'News Cycle',
            'Newsreader', 'Niconne', 'Niramit', 'Nixie One', 'Nobile', 'Nokora', 'Norican', 'Nosifer',
            'Notable', 'Nothing You Could Do', 'Noticia Text', 'Noto Color Emoji', 'Noto Emoji',
            'Noto Kufi Arabic', 'Noto Music', 'Noto Naskh Arabic', 'Noto Nastaliq Urdu', 'Noto Rashi Hebrew',
            'Noto Sans Arabic', 'Noto Sans Bengali', 'Noto Sans Devanagari', 'Noto Sans Display',
            'Noto Sans Georgian', 'Noto Sans Hebrew', 'Noto Sans HK', 'Noto Sans JP', 'Noto Sans KR',
            'Noto Sans Mono', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans Thai', 'Noto Serif',
            'Noto Serif Bengali', 'Noto Serif Devanagari', 'Noto Serif Display', 'Noto Serif Georgian',
            'Noto Serif Hebrew', 'Noto Serif JP', 'Noto Serif KR', 'Noto Serif SC', 'Noto Serif TC',
            'Noto Serif Thai', 'Nova Cut', 'Nova Flat', 'Nova Mono', 'Nova Oval', 'Nova Round',
            'Nova Script', 'Nova Slim', 'Nova Square', 'Numans', 'Nunito', 'Nunito Sans', 'Nuosu SIL',
            'Odibee Sans', 'Odor Mean Chey', 'Offside', 'Oi', 'Old Standard TT', 'Oldenburg', 'Ole',
            'Oleo Script', 'Oleo Script Swash Caps', 'Oooh Baby', 'Open Sans Condensed', 'Oranienbaum',
            'Orbit', 'Orbitron', 'Oregano', 'Orelega One', 'Orienta', 'Original Surfer', 'Oswald',
            'Otomanopee One', 'Outfit', 'Over the Rainbow', 'Overlock', 'Overlock SC', 'Overpass',
            'Overpass Mono', 'Ovo', 'Oxanium', 'Oxygen Mono', 'PT Mono', 'PT Sans Caption',
            'PT Sans Narrow', 'PT Serif', 'PT Serif Caption', 'Pacifico', 'Padauk', 'Padyakke Expanded One',
            'Palanquin', 'Palanquin Dark', 'Palette Mosaic', 'Pangolin', 'Paprika', 'Parisienne',
            'Passero One', 'Passion One', 'Passions Conflict', 'Pathway Gothic One', 'Patrick Hand',
            'Patrick Hand SC', 'Pattaya', 'Patua One', 'Pavanam', 'Paytone One', 'Peddana',
            'Peralta', 'Permanent Marker', 'Petemoss', 'Petit Formal Script', 'Petrona', 'Phetsarath',
            'Philosopher', 'Piazzolla', 'Piedra', 'Pinyon Script', 'Pirata One', 'Plaster', 'Play',
            'Playball', 'Playfair Display SC', 'Podkova', 'Poiret One', 'Poller One', 'Poly', 'Pompiere',
            'Pontano Sans', 'Poor Story', 'Poppins', 'Port Lligat Sans', 'Port Lligat Slab', 'Potta One',
            'Pragati Narrow', 'Praise', 'Prata', 'Preahvihear', 'Press Start 2P', 'Pridi', 'Princess Sofia',
            'Prociono', 'Prompt', 'Prosto One', 'Proza Libre', 'Public Sans', 'Puppies Play', 'Puritan',
            'Purple Purse', 'Qahiri', 'Quando', 'Quantico', 'Quattrocento', 'Quattrocento Sans', 'Questrial',
            'Quicksand', 'Quintessential', 'Qwigley', 'Qwitcher Grypen', 'Racing Sans One', 'Radio Canada',
            'Radley', 'Rajdhani', 'Rakkas', 'Raleway Dots', 'Ramabhadra', 'Ramaraja', 'Rambla', 'Rammetto One',
            'Rampart One', 'Ranchers', 'Rancho', 'Ranga', 'Rasa', 'Rationale', 'Ravi Prakash', 'Readex Pro',
            'Recursive', 'Red Hat Mono', 'Red Hat Text', 'Red Rose', 'Redacted', 'Redacted Script', 'Redressed',
            'Reem Kufi', 'Reenie Beanie', 'Reggae One', 'Revalia', 'Rhodium Libre', 'Ribeye', 'Ribeye Marrow',
            'Righteous', 'Risque', 'Road Rage', 'Roboto Flex', 'Rochester', 'Rock Salt', 'RocknRoll One',
            'Rokkitt', 'Romanesco', 'Ropa Sans', 'Rosario', 'Rosarivo', 'Rouge Script', 'Rowdies', 'Rozha One',
            'Rubik Beastly', 'Rubik Bubbles', 'Rubik Burned', 'Rubik Dirt', 'Rubik Distressed', 'Rubik Glitch',
            'Rubik Marker Hatch', 'Rubik Maze', 'Rubik Microbe', 'Rubik Mono One', 'Rubik Moonrocks',
            'Rubik Puddles', 'Rubik Wet Paint', 'Ruda', 'Rufina', 'Ruge Boogie', 'Ruluko', 'Rum Raisin',
            'Ruslan Display', 'Russo One', 'Ruthie', 'Rye', 'STIX Two Math', 'STIX Two Text', 'Sacramento',
            'Sahitya', 'Sail', 'Saira Condensed', 'Saira Extra Condensed', 'Saira Semi Condensed', 'Saira Stencil One',
            'Salsa', 'Sanchez', 'Sancreek', 'Sansita', 'Sansita Swashed', 'Sarabun', 'Sarala', 'Sarina', 'Sarpanch',
            'Sassy Frass', 'Satisfy', 'Sawarabi Gothic', 'Sawarabi Mincho', 'Scada', 'Scheherazade New', 'Schoolbell',
            'Scope One', 'Seaweed Script', 'Secular One', 'Sedgwick Ave', 'Sedgwick Ave Display', 'Sen',
            'Send Flowers', 'Sevillana', 'Seymour One', 'Shadows Into Light Two', 'Shalimar', 'Shanti',
            'Share', 'Share Tech', 'Share Tech Mono', 'Shippori Antique', 'Shippori Antique B1', 'Shippori Mincho',
            'Shippori Mincho B1', 'Shizuru', 'Shojumaru', 'Short Stack', 'Shrikhand', 'Siemreap', 'Sigmar One',
            'Signika Negative', 'Silkscreen', 'Simonetta', 'Single Day', 'Sintony', 'Sirin Stencil', 'Six Caps',
            'Skranji', 'Slabo 13px', 'Slackey', 'Smokum', 'Smooch', 'Smooch Sans', 'Smythe', 'Sniglet',
            'Snippet', 'Snowburst One', 'Sofadi One', 'Sofia', 'Sofia Sans', 'Sofia Sans Condensed',
            'Sofia Sans Extra Condensed', 'Sofia Sans Semi Condensed', 'Solitreo', 'Solway', 'Song Myung',
            'Sophia', 'Sora', 'Sorts Mill Goudy', 'Source Code Pro', 'Source Sans 3', 'Source Serif 4',
            'Source Serif Pro', 'Space Mono', 'Spartan', 'Special Elite', 'Spectral SC', 'Spicy Rice',
            'Spinnaker', 'Spirax', 'Splash', 'Spline Sans', 'Spline Sans Mono', 'Squada One', 'Square Peg',
            'Sree Krushnadevaraya', 'Sriracha', 'Srisakdi', 'Staatliches', 'Stalemate', 'Stalinist One',
            'Stardos Stencil', 'Stick', 'Stick No Bills', 'Stint Ultra Condensed', 'Stint Ultra Expanded',
            'Stoke', 'Strait', 'Style Script', 'Stylish', 'Sue Ellen Francisco', 'Suez One', 'Sulphur Point',
            'Sumana', 'Sunflower', 'Sunshiney', 'Supermercado One', 'Sura', 'Suranna', 'Suravaram', 'Suwannaphum',
            'Swanky and Moo Moo', 'Syncopate', 'Syne', 'Syne Mono', 'Syne Tactile', 'Tajawal', 'Tangerine',
            'Tapestry', 'Taprom', 'Tauri', 'Taviraj', 'Teko', 'Telex', 'Tenali Ramakrishna', 'Tenor Sans',
            'Text Me One', 'Texturina', 'Thasadith', 'The Girl Next Door', 'The Nautigal', 'Tienne', 'Tillana',
            'Tilt Neon', 'Tilt Prism', 'Tilt Warp', 'Timmana', 'Tinos', 'Tiro Bangla', 'Tiro Devanagari Hindi',
            'Tiro Devanagari Marathi', 'Tiro Devanagari Sanskrit', 'Tiro Gurmukhi', 'Tiro Kannada', 'Tiro Tamil',
            'Tiro Telugu', 'Titan One', 'Trade Winds', 'Train One', 'Trirong', 'Trispace', 'Trocchi',
            'Trochut', 'Truculenta', 'Trykker', 'Tulpen One', 'Turret Road', 'Twinkle Star', 'Ubuntu Condensed',
            'Ubuntu Mono', 'Uchen', 'Ultra', 'Uncial Antiqua', 'Underdog', 'Unica One', 'UnifrakturCook',
            'UnifrakturMaguntia', 'Unkempt', 'Unlock', 'Unna', 'Updock', 'Urbanist', 'Varta', 'Vast Shadow',
            'Vazirmatn', 'Vesper Libre', 'Viaoda Libre', 'Vibes', 'Vibur', 'Vidaloka', 'Viga', 'Voces',
            'Volkhov', 'Vollkorn SC', 'Voltaire', 'Vujahday Script', 'Waiting for the Sunrise', 'Wallpoet',
            'Walter Turncoat', 'Warnes', 'Water Brush', 'Waterfall', 'Wellfleet', 'Wendy One', 'Whisper',
            'WindSong', 'Wire One', 'Wix Madefor Display', 'Wix Madefor Text', 'Work Sans', 'Xanh Mono',
            'Yaldevi', 'Yanone Kaffeesatz', 'Yantramanav', 'Yatra One', 'Yellowtail', 'Yeon Sung', 'Yeseva One',
            'Yesteryear', 'Yomogi', 'Yrsa', 'Ysabeau', 'Ysabeau Infant', 'Ysabeau Office', 'Ysabeau SC',
            'Yuji Boku', 'Yuji Hentaigana Akari', 'Yuji Hentaigana Akebono', 'Yuji Mai', 'Yuji Syuku',
            'Yusei Magic', 'ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou', 'ZCOOL XiaoWei', 'Zen Antique',
            'Zen Antique Soft', 'Zen Dots', 'Zen Kaku Gothic Antique', 'Zen Kaku Gothic New', 'Zen Kurenaido',
            'Zen Loop', 'Zen Maru Gothic', 'Zen Old Mincho', 'Zen Tokyo Zoo', 'Zeyada', 'Zhi Mang Xing',
            'Zilla Slab Highlight'
        ];
        // Remove duplicates
        googleFonts.allFonts = [...new Set(googleFonts.allFonts)].sort();
        return googleFonts.allFonts;
    } catch (error) {
        console.error('Failed to load font list:', error);
        return googleFonts.popular;
    }
}

// Font picker state - separate state for each picker
const fontPickerState = {
    headline: { category: 'popular', search: '' },
    subheadline: { category: 'popular', search: '' },
    element: { category: 'popular', search: '' }
};

// Initialize all font pickers
function initFontPicker() {
    initSingleFontPicker('headline', {
        picker: 'font-picker',
        trigger: 'font-picker-trigger',
        dropdown: 'font-picker-dropdown',
        search: 'font-search',
        list: 'font-picker-list',
        preview: 'font-picker-preview',
        hidden: 'headline-font',
        stateKey: 'headlineFont'
    });

    initSingleFontPicker('subheadline', {
        picker: 'subheadline-font-picker',
        trigger: 'subheadline-font-picker-trigger',
        dropdown: 'subheadline-font-picker-dropdown',
        search: 'subheadline-font-search',
        list: 'subheadline-font-picker-list',
        preview: 'subheadline-font-picker-preview',
        hidden: 'subheadline-font',
        stateKey: 'subheadlineFont'
    });

    initSingleFontPicker('element', {
        picker: 'element-font-picker',
        trigger: 'element-font-picker-trigger',
        dropdown: 'element-font-picker-dropdown',
        search: 'element-font-search',
        list: 'element-font-picker-list',
        preview: 'element-font-picker-preview',
        hidden: 'element-font',
        stateKey: 'font',
        getFont: () => { const el = getSelectedElement(); return el ? el.font : ''; },
        setFont: (value) => { if (selectedElementId) setElementProperty(selectedElementId, 'font', value); }
    });
}

// Initialize a single font picker instance
function initSingleFontPicker(pickerId, ids) {
    const trigger = document.getElementById(ids.trigger);
    const dropdown = document.getElementById(ids.dropdown);
    const searchInput = document.getElementById(ids.search);
    const picker = document.getElementById(ids.picker);

    if (!trigger || !dropdown) return;

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other font picker dropdowns
        document.querySelectorAll('.font-picker-dropdown.open').forEach(d => {
            if (d.id !== ids.dropdown) d.classList.remove('open');
        });
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
            searchInput.focus();
            renderFontList(pickerId, ids);
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest(`#${ids.picker}`)) {
            dropdown.classList.remove('open');
        }
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        fontPickerState[pickerId].search = e.target.value.toLowerCase();
        renderFontList(pickerId, ids);
    });

    // Prevent dropdown close when clicking inside
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Category buttons
    const categoryButtons = picker.querySelectorAll('.font-category');
    categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fontPickerState[pickerId].category = btn.dataset.category;
            renderFontList(pickerId, ids);
        });
    });

    // Initial render
    renderFontList(pickerId, ids);
}

// Render the font list for a specific picker
async function renderFontList(pickerId, ids) {
    const fontList = document.getElementById(ids.list);
    if (!fontList) return;

    const pickerState = fontPickerState[pickerId];
    let fonts = [];
    const currentFont = ids.getFont ? ids.getFont() : getTextSettings()[ids.stateKey];

    if (pickerState.category === 'system') {
        fonts = googleFonts.system.map(f => ({
            name: f.name,
            value: f.value,
            category: 'system'
        }));
    } else if (pickerState.category === 'popular') {
        fonts = googleFonts.popular.map(name => ({
            name,
            value: `'${name}', sans-serif`,
            category: 'google'
        }));
    } else {
        // All fonts
        const allFonts = await fetchAllGoogleFonts();
        fonts = [
            ...googleFonts.system.map(f => ({
                name: f.name,
                value: f.value,
                category: 'system'
            })),
            ...allFonts.map(name => ({
                name,
                value: `'${name}', sans-serif`,
                category: 'google'
            }))
        ];
    }

    // Filter by search
    if (pickerState.search) {
        fonts = fonts.filter(f => f.name.toLowerCase().includes(pickerState.search));
    }

    // Limit to prevent performance issues
    const displayFonts = fonts.slice(0, 100);

    if (displayFonts.length === 0) {
        fontList.innerHTML = '<div class="font-picker-empty">No fonts found</div>';
        return;
    }

    fontList.innerHTML = displayFonts.map(font => {
        const isSelected = currentFont && (currentFont.includes(font.name) || currentFont === font.value);
        const isLoaded = font.category === 'system' || googleFonts.loaded.has(font.name);
        const isLoading = googleFonts.loading.has(font.name);

        return `
            <div class="font-option ${isSelected ? 'selected' : ''}"
                 data-font-name="${font.name}"
                 data-font-value="${font.value}"
                 data-font-category="${font.category}">
                <span class="font-option-name" style="font-family: ${isLoaded ? font.value : 'inherit'}">${font.name}</span>
                ${isLoading ? '<span class="font-option-loading">Loading...</span>' :
                `<span class="font-option-category">${font.category}</span>`}
            </div>
        `;
    }).join('');

    // Add click handlers
    fontList.querySelectorAll('.font-option').forEach(option => {
        option.addEventListener('click', async () => {
            const fontName = option.dataset.fontName;
            const fontValue = option.dataset.fontValue;
            const fontCategory = option.dataset.fontCategory;

            // Load Google Font if needed
            if (fontCategory === 'google') {
                option.querySelector('.font-option-category').textContent = 'Loading...';
                option.querySelector('.font-option-category').classList.add('font-option-loading');
                await loadGoogleFont(fontName);
                option.querySelector('.font-option-name').style.fontFamily = fontValue;
                option.querySelector('.font-option-category').textContent = 'google';
                option.querySelector('.font-option-category').classList.remove('font-option-loading');
            }

            // Update state
            document.getElementById(ids.hidden).value = fontValue;
            if (ids.setFont) {
                ids.setFont(fontValue);
            } else {
                setTextValue(ids.stateKey, fontValue);
            }

            // Update preview
            const preview = document.getElementById(ids.preview);
            preview.textContent = fontName;
            preview.style.fontFamily = fontValue;

            // Update selection in list
            fontList.querySelectorAll('.font-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            // Close dropdown
            document.getElementById(ids.dropdown).classList.remove('open');

            updateCanvas();
        });

        // Preload font on hover for better UX
        option.addEventListener('mouseenter', () => {
            const fontName = option.dataset.fontName;
            const fontCategory = option.dataset.fontCategory;
            if (fontCategory === 'google' && !googleFonts.loaded.has(fontName)) {
                loadGoogleFont(fontName).then(() => {
                    option.querySelector('.font-option-name').style.fontFamily = option.dataset.fontValue;
                });
            }
        });
    });
}

// Update font picker preview from state
function updateFontPickerPreview() {
    updateSingleFontPickerPreview('headline-font', 'font-picker-preview', 'headlineFont');
    updateSingleFontPickerPreview('subheadline-font', 'subheadline-font-picker-preview', 'subheadlineFont');
}

function updateSingleFontPickerPreview(hiddenId, previewId, stateKey) {
    const preview = document.getElementById(previewId);
    const hiddenInput = document.getElementById(hiddenId);
    if (!preview || !hiddenInput) return;

    const text = getTextSettings();
    const fontValue = text[stateKey];
    if (!fontValue) return;

    hiddenInput.value = fontValue;

    // Extract font name from value
    let fontName = 'SF Pro Display';
    const systemFont = googleFonts.system.find(f => f.value === fontValue);
    if (systemFont) {
        fontName = systemFont.name;
    } else {
        // Try to extract from Google Font value like "'Roboto', sans-serif"
        const match = fontValue.match(/'([^']+)'/);
        if (match) {
            fontName = match[1];
            // Load the font if it's a Google Font
            loadGoogleFont(fontName);
        }
    }

    preview.textContent = fontName;
    preview.style.fontFamily = fontValue;
}

function updateElementFontPickerPreview(el) {
    const preview = document.getElementById('element-font-picker-preview');
    const hiddenInput = document.getElementById('element-font');
    if (!preview || !hiddenInput || !el) return;

    const fontValue = el.font;
    if (!fontValue) return;

    hiddenInput.value = fontValue;

    let fontName = 'SF Pro Display';
    const systemFont = googleFonts.system.find(f => f.value === fontValue);
    if (systemFont) {
        fontName = systemFont.name;
    } else {
        const match = fontValue.match(/'([^']+)'/);
        if (match) {
            fontName = match[1];
            loadGoogleFont(fontName);
        }
    }

    preview.textContent = fontName;
    preview.style.fontFamily = fontValue;
}

// Device dimensions
const deviceDimensions = {
    'iphone-6.9': { width: 1320, height: 2868 },
    'iphone-6.5': { width: 1284, height: 2778 },
    'iphone-5.5': { width: 1242, height: 2208 },
    'ipad-12.9': { width: 2048, height: 2732 },
    'ipad-11': { width: 1668, height: 2388 },
    'android-phone': { width: 1080, height: 1920 },
    'android-phone-hd': { width: 1440, height: 2560 },
    'android-tablet-7': { width: 1200, height: 1920 },
    'android-tablet-10': { width: 1600, height: 2560 },
    'web-og': { width: 1200, height: 630 },
    'web-twitter': { width: 1200, height: 675 },
    'web-hero': { width: 1920, height: 1080 },
    'web-feature': { width: 1024, height: 500 }
};

// DOM elements
const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');
const canvasLeft = document.getElementById('preview-canvas-left');
const ctxLeft = canvasLeft.getContext('2d');
const canvasRight = document.getElementById('preview-canvas-right');
const ctxRight = canvasRight.getContext('2d');
const canvasFarLeft = document.getElementById('preview-canvas-far-left');
const ctxFarLeft = canvasFarLeft.getContext('2d');
const canvasFarRight = document.getElementById('preview-canvas-far-right');
const ctxFarRight = canvasFarRight.getContext('2d');
const sidePreviewLeft = document.getElementById('side-preview-left');
const sidePreviewRight = document.getElementById('side-preview-right');
const sidePreviewFarLeft = document.getElementById('side-preview-far-left');
const sidePreviewFarRight = document.getElementById('side-preview-far-right');
const previewStrip = document.querySelector('.preview-strip');
const canvasWrapper = document.getElementById('canvas-wrapper');

let isSliding = false;
let skipSidePreviewRender = false;  // Flag to skip re-rendering side previews after pre-render

// Two-finger horizontal swipe to navigate between screenshots
let swipeAccumulator = 0;
const SWIPE_THRESHOLD = 50; // Minimum accumulated delta to trigger navigation

// Prevent browser back/forward gesture on the entire canvas area
canvasWrapper.addEventListener('wheel', (e) => {
    // Prevent horizontal scroll from triggering browser back/forward
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
    }
}, { passive: false });

previewStrip.addEventListener('wheel', (e) => {
    // Only handle horizontal scrolling (two-finger swipe on trackpad)
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

    e.preventDefault();
    e.stopPropagation();

    if (isSliding) return;
    if (state.screenshots.length <= 1) return;

    swipeAccumulator += e.deltaX;

    if (swipeAccumulator > SWIPE_THRESHOLD) {
        // Swipe left = go to next screenshot
        const nextIndex = state.selectedIndex + 1;
        if (nextIndex < state.screenshots.length) {
            slideToScreenshot(nextIndex, 'right');
        }
        swipeAccumulator = 0;
    } else if (swipeAccumulator < -SWIPE_THRESHOLD) {
        // Swipe right = go to previous screenshot
        const prevIndex = state.selectedIndex - 1;
        if (prevIndex >= 0) {
            slideToScreenshot(prevIndex, 'left');
        }
        swipeAccumulator = 0;
    }
}, { passive: false });
let suppressSwitchModelUpdate = false;  // Flag to suppress updateCanvas from switchPhoneModel
const fileInput = document.getElementById('file-input');
const projectImportInput = document.getElementById('project-import-input');
const screenshotList = document.getElementById('screenshot-list');
const noScreenshot = document.getElementById('no-screenshot');

// IndexedDB for larger storage (can store hundreds of MB vs localStorage's 5-10MB)
let db = null;
const DB_NAME = 'AppStoreScreenshotGenerator';
const DB_VERSION = 2;
const PROJECTS_STORE = 'projects';
const META_STORE = 'meta';
const STATE_BACKUP_KEY_PREFIX = 'appscreen_state_backup_v1_';

let currentProjectId = 'default';
let projects = [{ id: 'default', name: 'Default Project', screenshotCount: 0 }];

function getStateBackupKey(projectId) {
    return `${STATE_BACKUP_KEY_PREFIX}${projectId}`;
}

function writeStateBackup(projectId, stateToSave) {
    try {
        localStorage.setItem(getStateBackupKey(projectId), JSON.stringify({
            savedAt: Date.now(),
            data: stateToSave
        }));
    } catch (e) {
        // localStorage may be full for very large projects; keep this best-effort.
    }
}

function readStateBackup(projectId) {
    try {
        const raw = localStorage.getItem(getStateBackupKey(projectId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.data || typeof parsed.data !== 'object') return null;
        return parsed.data;
    } catch (e) {
        return null;
    }
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                // Continue without database
                resolve(null);
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Delete old store if exists (from version 1)
                if (database.objectStoreNames.contains('state')) {
                    database.deleteObjectStore('state');
                }

                // Create projects store
                if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
                    database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
                }

                // Create meta store for project list and current project
                if (!database.objectStoreNames.contains(META_STORE)) {
                    database.createObjectStore(META_STORE, { keyPath: 'key' });
                }
            };

            request.onblocked = () => {
                console.warn('Database upgrade blocked. Please close other tabs.');
                resolve(null);
            };
        } catch (e) {
            console.error('Failed to open IndexedDB:', e);
            resolve(null);
        }
    });
}

// Load project list and current project
async function loadProjectsMeta() {
    if (!db) return;

    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([META_STORE], 'readonly');
            const store = transaction.objectStore(META_STORE);

            const projectsReq = store.get('projects');
            const currentReq = store.get('currentProject');

            transaction.oncomplete = () => {
                if (projectsReq.result) {
                    projects = projectsReq.result.value;
                }
                if (currentReq.result) {
                    currentProjectId = currentReq.result.value;
                }
                updateProjectSelector();
                resolve();
            };

            transaction.onerror = () => resolve();
        } catch (e) {
            resolve();
        }
    });
}

// Save project list and current project
function saveProjectsMeta() {
    if (!db) return;

    try {
        const transaction = db.transaction([META_STORE], 'readwrite');
        const store = transaction.objectStore(META_STORE);
        store.put({ key: 'projects', value: projects });
        store.put({ key: 'currentProject', value: currentProjectId });
    } catch (e) {
        console.error('Error saving projects meta:', e);
    }
}

// Update project selector dropdown
function updateProjectSelector() {
    const menu = document.getElementById('project-menu');
    menu.innerHTML = '';

    // Find current project
    const currentProject = projects.find(p => p.id === currentProjectId) || projects[0];

    // Update trigger display - always use actual state for current project
    document.getElementById('project-trigger-name').textContent = currentProject.name;
    const count = state.screenshots.length;
    document.getElementById('project-trigger-meta').textContent = `${count} screenshot${count !== 1 ? 's' : ''}`;

    // Build menu options
    projects.forEach(project => {
        const option = document.createElement('div');
        option.className = 'project-option' + (project.id === currentProjectId ? ' selected' : '');
        option.dataset.projectId = project.id;

        const screenshotCount = project.id === currentProjectId ? state.screenshots.length : (project.screenshotCount || 0);

        option.innerHTML = `
            <span class="project-option-name">${project.name}</span>
            <span class="project-option-meta">${screenshotCount} screenshot${screenshotCount !== 1 ? 's' : ''}</span>
        `;

        option.addEventListener('click', (e) => {
            e.stopPropagation();
            if (project.id !== currentProjectId) {
                switchProject(project.id);
            }
            document.getElementById('project-dropdown').classList.remove('open');
        });

        menu.appendChild(option);
    });
}

// Initialize
async function init() {
    try {
        await openDatabase();
        await loadProjectsMeta();
        await loadState();
        syncUIWithState();
        updateCanvas();
    } catch (e) {
        console.error('Initialization error:', e);
        // Continue with defaults
        syncUIWithState();
        updateCanvas();
    }
}

// Set up event listeners immediately (don't wait for async init)
function initSync() {
    initTextApi();
    setupEventListeners();
    setupElementEventListeners();
    setupPopoutEventListeners();
    setupSliderResetButtons();
    initFontPicker();
    updateGradientStopsUI();
    updateCanvas();
    // Then load saved data asynchronously
    init();
}

// Best-effort flush on page lifecycle transitions (especially quick refresh).
window.addEventListener('pagehide', () => {
    saveState();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        saveState();
    }
});

// Save state to IndexedDB for current project
function buildSerializableProjectState(projectId = currentProjectId) {
    // Convert screenshots to base64 for storage, including per-screenshot settings and localized images
    const screenshotsToSave = state.screenshots.map(s => {
        const localizedImages = serializeLocalizedImagesMap(s.localizedImages);

        return {
            src: s.image?.src || '', // Legacy compatibility
            name: s.name,
            exportName: s.exportName || '',
            deviceType: s.deviceType,
            localizedImages: localizedImages,
            deviceOverrides: serializeDeviceOverrides(s.deviceOverrides),
            background: {
                ...s.background,
                image: null,
                imageSrc: s.background?.imageSrc || s.background?.image?.src || null
            },
            screenshot: s.screenshot,
            text: s.text,
            elements: (s.elements || []).map(el => ({
                ...el,
                image: undefined // Don't serialize Image objects
            })),
            popouts: s.popouts || [],
            overrides: s.overrides
        };
    });

    return {
        id: projectId,
        formatVersion: 2, // Version 2: new 3D positioning formula
        screenshots: screenshotsToSave,
        selectedIndex: state.selectedIndex,
        outputDevice: state.outputDevice,
        exportDevices: state.exportDevices,
        customWidth: state.customWidth,
        customHeight: state.customHeight,
        currentLanguage: state.currentLanguage,
        projectLanguages: state.projectLanguages,
        defaults: {
            ...state.defaults,
            background: {
                ...state.defaults.background,
                image: null,
                imageSrc: state.defaults.background?.imageSrc || state.defaults.background?.image?.src || null
            }
        }
    };
}

let saveChain = Promise.resolve();
let isHydratingProjectState = false;

function isSnapshotConsistent(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.screenshots)) return false;
    const count = snapshot.screenshots.length;
    const index = typeof snapshot.selectedIndex === 'number' ? snapshot.selectedIndex : 0;
    if (count === 0) {
        return index === 0;
    }
    return index >= 0 && index < count;
}

function persistCurrentState(stateToSave) {
    if (!db) return Promise.resolve();

    // Keep project screenshot count in sync with current state.
    const project = projects.find(p => p.id === currentProjectId);
    if (project) {
        project.screenshotCount = stateToSave.screenshots.length;
    }

    return new Promise((resolve, reject) => {
        try {
            // Persist project data + metadata atomically to avoid refresh-time mismatch.
            const transaction = db.transaction([PROJECTS_STORE, META_STORE], 'readwrite');
            const projectStore = transaction.objectStore(PROJECTS_STORE);
            const metaStore = transaction.objectStore(META_STORE);

            projectStore.put(stateToSave);
            metaStore.put({ key: 'projects', value: projects });
            metaStore.put({ key: 'currentProject', value: currentProjectId });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('State transaction failed'));
            transaction.onabort = () => reject(transaction.error || new Error('State transaction aborted'));
        } catch (e) {
            reject(e);
        }
    });
}

function saveState() {
    const snapshot = buildSerializableProjectState(currentProjectId);
    if (isHydratingProjectState || !isSnapshotConsistent(snapshot)) {
        return saveChain;
    }

    writeStateBackup(currentProjectId, snapshot);
    if (!db) return Promise.resolve();

    saveChain = saveChain
        .catch(() => {
            // Keep chain alive after prior failures.
        })
        .then(() => persistCurrentState(snapshot))
        .catch((e) => {
            console.error('Error saving state:', e);
        });

    return saveChain;
}

// Migrate 3D positions from old formula to new formula
// Old: xOffset = ((x-50)/50)*2, yOffset = -((y-50)/50)*3
// New: xOffset = ((x-50)/50)*(1-scale)*0.9, yOffset = -((y-50)/50)*(1-scale)*2
function migrate3DPosition(screenshotSettings) {
    if (!screenshotSettings?.use3D) return; // Only migrate 3D screenshots

    const scale = (screenshotSettings.scale || 70) / 100;
    const oldX = screenshotSettings.x ?? 50;
    const oldY = screenshotSettings.y ?? 50;

    // Convert old position to new position that produces same visual offset
    // newX = 50 + (oldX - 50) * oldFactor / newFactor
    const xFactor = 2 / ((1 - scale) * 0.9);
    const yFactor = 3 / ((1 - scale) * 2);

    screenshotSettings.x = Math.max(0, Math.min(100, 50 + (oldX - 50) * xFactor));
    screenshotSettings.y = Math.max(0, Math.min(100, 50 + (oldY - 50) * yFactor));
}

// Reconstruct Image objects for graphic/icon elements from saved data
function reconstructElementImages(elements) {
    if (!elements || !Array.isArray(elements)) return [];
    return elements.map(el => {
        const restored = { ...el };
        if (el.type === 'graphic' && el.src) {
            const img = new Image();
            img.src = el.src;
            restored.image = img;
        } else if (el.type === 'icon' && el.iconName) {
            // Async fetch; image will be null initially, then updateCanvas() when ready
            getLucideImage(el.iconName, el.iconColor || '#ffffff', el.iconStrokeWidth || 2)
                .then(img => {
                    restored.image = img;
                    updateCanvas();
                })
                .catch(e => console.error('Failed to reconstruct icon:', e));
        }
        return restored;
    });
}

// Load state from IndexedDB for current project
function loadState() {
    if (!db) return Promise.resolve();

    return new Promise((resolve) => {
        isHydratingProjectState = true;
        try {
            const transaction = db.transaction([PROJECTS_STORE], 'readonly');
            const store = transaction.objectStore(PROJECTS_STORE);
            const request = store.get(currentProjectId);

            request.onsuccess = () => {
                let parsed = request.result;
                if (!parsed) {
                    parsed = readStateBackup(currentProjectId);
                    if (parsed) {
                        console.warn('Recovered project state from local backup after IndexedDB miss:', currentProjectId);
                    }
                }
                if (parsed) {
                    // Check if this is an old-style project (no per-screenshot settings)
                    const isOldFormat = !parsed.defaults && (parsed.background || parsed.screenshot || parsed.text);
                    const hasScreenshotsWithoutSettings = parsed.screenshots?.some(s => !s.background && !s.screenshot && !s.text);
                    const needsMigration = isOldFormat || hasScreenshotsWithoutSettings;

                    // Check if we need to migrate 3D positions (formatVersion < 2)
                    const needs3DMigration = !parsed.formatVersion || parsed.formatVersion < 2;

                    // Load screenshots with their per-screenshot settings
                    state.screenshots = [];

                    // Build migrated settings from old format if needed
                    let migratedBackground = state.defaults.background;
                    let migratedScreenshot = state.defaults.screenshot;
                    let migratedText = state.defaults.text;

                    if (isOldFormat) {
                        if (parsed.background) {
                            migratedBackground = {
                                type: parsed.background.type || 'gradient',
                                gradient: parsed.background.gradient || state.defaults.background.gradient,
                                solid: parsed.background.solid || state.defaults.background.solid,
                                image: null,
                                imageSrc: parsed.background.imageSrc || null,
                                imageFit: parsed.background.imageFit || 'cover',
                                imageBlur: parsed.background.imageBlur || 0,
                                overlayColor: parsed.background.overlayColor || '#000000',
                                overlayOpacity: parsed.background.overlayOpacity || 0,
                                noise: parsed.background.noise || false,
                                noiseIntensity: parsed.background.noiseIntensity || 10
                            };
                        }
                        if (parsed.screenshot) {
                            migratedScreenshot = { ...state.defaults.screenshot, ...parsed.screenshot };
                        }
                        if (parsed.text) {
                            migratedText = { ...state.defaults.text, ...parsed.text };
                        }
                    }

                    if (parsed.screenshots && parsed.screenshots.length > 0) {
                        let loadedCount = 0;
                        const totalToLoad = parsed.screenshots.length;

                        parsed.screenshots.forEach((s, index) => {
                            // Check if we have new localized format or old single-image format
                            const hasLocalizedImages = s.localizedImages && Object.keys(s.localizedImages).length > 0;

                            if (!hasLocalizedImages && !s.src) {
                                // Blank screen (no image)
                                const screenshotSettings = s.screenshot || JSON.parse(JSON.stringify(migratedScreenshot));
                                if (needs3DMigration) {
                                    migrate3DPosition(screenshotSettings);
                                }
                                state.screenshots[index] = {
                                    image: null,
                                    name: s.name || 'Blank Screen',
                                    exportName: s.exportName || '',
                                    deviceType: s.deviceType,
                                    localizedImages: {},
                                    background: hydrateBackground(s.background || JSON.parse(JSON.stringify(migratedBackground))),
                                    screenshot: screenshotSettings,
                                    text: s.text || JSON.parse(JSON.stringify(migratedText)),
                                    elements: reconstructElementImages(s.elements),
                                    popouts: s.popouts || [],
                                    deviceOverrides: s.deviceOverrides || {},
                                    overrides: s.overrides || {}
                                };
                                loadedCount++;
                                checkAllLoaded();
                            } else if (hasLocalizedImages) {
                                // New format: load all localized images
                                const langKeys = Object.keys(s.localizedImages);
                                let langLoadedCount = 0;
                                const localizedImages = {};

                                langKeys.forEach(lang => {
                                    const langData = s.localizedImages[lang];
                                    if (langData?.src) {
                                        const langImg = new Image();
                                        langImg.onload = () => {
                                            localizedImages[lang] = {
                                                image: langImg,
                                                src: langData.src,
                                                name: langData.name || s.name
                                            };
                                            langLoadedCount++;

                                            if (langLoadedCount === langKeys.length) {
                                                // All language versions loaded
                                                const firstLang = langKeys[0];
                                                const screenshotSettings = s.screenshot || JSON.parse(JSON.stringify(migratedScreenshot));
                                                if (needs3DMigration) {
                                                    migrate3DPosition(screenshotSettings);
                                                }
                                                state.screenshots[index] = {
                                                    image: localizedImages[firstLang]?.image, // Legacy compat
                                                    name: s.name,
                                                    exportName: s.exportName || '',
                                                    deviceType: s.deviceType,
                                                    localizedImages: localizedImages,
                                                    background: hydrateBackground(s.background || JSON.parse(JSON.stringify(migratedBackground))),
                                                    screenshot: screenshotSettings,
                                                    text: s.text || JSON.parse(JSON.stringify(migratedText)),
                                                    elements: reconstructElementImages(s.elements),
                                                    popouts: s.popouts || [],
                                                    deviceOverrides: s.deviceOverrides || {},
                                                    overrides: s.overrides || {}
                                                };
                                                loadedCount++;
                                                checkAllLoaded();
                                            }
                                        };
                                        langImg.onerror = () => {
                                            langLoadedCount++;
                                            if (langLoadedCount === langKeys.length) {
                                                const firstLang = langKeys.find(key => localizedImages[key]) || langKeys[0];
                                                const screenshotSettings = s.screenshot || JSON.parse(JSON.stringify(migratedScreenshot));
                                                if (needs3DMigration) {
                                                    migrate3DPosition(screenshotSettings);
                                                }
                                                state.screenshots[index] = {
                                                    image: localizedImages[firstLang]?.image || null,
                                                    name: s.name || 'Screenshot',
                                                    exportName: s.exportName || '',
                                                    deviceType: s.deviceType,
                                                    localizedImages: localizedImages,
                                                    background: hydrateBackground(s.background || JSON.parse(JSON.stringify(migratedBackground))),
                                                    screenshot: screenshotSettings,
                                                    text: s.text || JSON.parse(JSON.stringify(migratedText)),
                                                    elements: reconstructElementImages(s.elements),
                                                    popouts: s.popouts || [],
                                                    deviceOverrides: s.deviceOverrides || {},
                                                    overrides: s.overrides || {}
                                                };
                                                loadedCount++;
                                                checkAllLoaded();
                                            }
                                        };
                                        langImg.src = langData.src;
                                    } else {
                                        langLoadedCount++;
                                        if (langLoadedCount === langKeys.length) {
                                            loadedCount++;
                                            checkAllLoaded();
                                        }
                                    }
                                });
                            } else {
                                // Old format: migrate to localized images
                                const img = new Image();
                                img.onload = () => {
                                    // Detect language from filename, default to 'en'
                                    const detectedLang = typeof detectLanguageFromFilename === 'function'
                                        ? detectLanguageFromFilename(s.name || '')
                                        : 'en';

                                    const localizedImages = {};
                                    localizedImages[detectedLang] = {
                                        image: img,
                                        src: s.src,
                                        name: s.name
                                    };

                                    const screenshotSettings = s.screenshot || JSON.parse(JSON.stringify(migratedScreenshot));
                                    if (needs3DMigration) {
                                        migrate3DPosition(screenshotSettings);
                                    }
                                    state.screenshots[index] = {
                                        image: img,
                                        name: s.name,
                                        exportName: s.exportName || '',
                                        deviceType: s.deviceType,
                                        localizedImages: localizedImages,
                                        background: hydrateBackground(s.background || JSON.parse(JSON.stringify(migratedBackground))),
                                        screenshot: screenshotSettings,
                                        text: s.text || JSON.parse(JSON.stringify(migratedText)),
                                        elements: reconstructElementImages(s.elements),
                                        popouts: s.popouts || [],
                                        deviceOverrides: s.deviceOverrides || {},
                                        overrides: s.overrides || {}
                                    };
                                    loadedCount++;
                                    checkAllLoaded();
                                };
                                img.onerror = () => {
                                    const screenshotSettings = s.screenshot || JSON.parse(JSON.stringify(migratedScreenshot));
                                    if (needs3DMigration) {
                                        migrate3DPosition(screenshotSettings);
                                    }
                                    state.screenshots[index] = {
                                        image: null,
                                        name: s.name || 'Screenshot',
                                        exportName: s.exportName || '',
                                        deviceType: s.deviceType,
                                        localizedImages: {},
                                        background: hydrateBackground(s.background || JSON.parse(JSON.stringify(migratedBackground))),
                                        screenshot: screenshotSettings,
                                        text: s.text || JSON.parse(JSON.stringify(migratedText)),
                                        elements: reconstructElementImages(s.elements),
                                        popouts: s.popouts || [],
                                        deviceOverrides: s.deviceOverrides || {},
                                        overrides: s.overrides || {}
                                    };
                                    loadedCount++;
                                    checkAllLoaded();
                                };
                                img.src = s.src;
                            }
                        });

                        function checkAllLoaded() {
                            if (loadedCount === totalToLoad) {
                                state.screenshots = state.screenshots.map(hydrateScreenshotDeviceData);
                                updateScreenshotList();
                                syncUIWithState();
                                updateGradientStopsUI();
                                updateCanvas();
                                isHydratingProjectState = false;

                                if (needsMigration && parsed.screenshots.length > 0) {
                                    showMigrationPrompt();
                                }
                            }
                        }
                    } else {
                        // No screenshots - still need to update UI
                        updateScreenshotList();
                        syncUIWithState();
                        updateGradientStopsUI();
                        updateCanvas();
                        isHydratingProjectState = false;
                    }

                    state.selectedIndex = parsed.selectedIndex || 0;
                    state.outputDevice = normalizeOutputDevice(parsed.outputDevice || 'iphone-6.9');
                    state.exportDevices = normalizeExportDevices(parsed.exportDevices || [state.outputDevice]);
                    state.customWidth = parsed.customWidth || 1320;
                    state.customHeight = parsed.customHeight || 2868;

                    // Load global language settings
                    state.currentLanguage = parsed.currentLanguage || 'en';
                    state.projectLanguages = parsed.projectLanguages || ['en'];

                    // Load defaults (new format) or use migrated settings
                    if (parsed.defaults) {
                        state.defaults = parsed.defaults;
                        if (!state.defaults.background) {
                            state.defaults.background = {
                                type: 'gradient',
                                gradient: {
                                    angle: 135,
                                    stops: [
                                        { color: '#667eea', position: 0 },
                                        { color: '#764ba2', position: 100 }
                                    ]
                                },
                                solid: '#1a1a2e',
                                image: null,
                                imageSrc: null,
                                imageFit: 'cover',
                                imageBlur: 0,
                                overlayColor: '#000000',
                                overlayOpacity: 0,
                                noise: false,
                                noiseIntensity: 10
                            };
                        }
                        state.defaults.background = hydrateBackground(state.defaults.background);
                        // Ensure elements array exists (may be missing from older saves)
                        if (!state.defaults.elements) state.defaults.elements = [];
                    } else {
                        state.defaults.background = migratedBackground;
                        state.defaults.screenshot = migratedScreenshot;
                        state.defaults.text = migratedText;
                    }
                } else {
                    // New project, reset to defaults
                    resetStateToDefaults();
                    updateScreenshotList();
                    isHydratingProjectState = false;
                }
                if (!parsed || !parsed.screenshots || parsed.screenshots.length === 0) {
                    isHydratingProjectState = false;
                }
                resolve();
            };

            request.onerror = () => {
                console.error('Error loading state:', request.error);
                isHydratingProjectState = false;
                resolve();
            };
        } catch (e) {
            console.error('Error loading state:', e);
            isHydratingProjectState = false;
            resolve();
        }
    });
}

// Show migration prompt for old-style projects
function showMigrationPrompt() {
    const modal = document.getElementById('migration-modal');
    if (modal) {
        modal.classList.add('visible');
    }
}

function hideMigrationPrompt() {
    const modal = document.getElementById('migration-modal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

function convertProject() {
    // Project is already converted in memory, just save it
    saveState();
    hideMigrationPrompt();
}

// Reset state to defaults (without clearing storage)
function resetStateToDefaults() {
    state.screenshots = [];
    state.selectedIndex = 0;
    state.outputDevice = 'iphone-6.9';
    state.exportDevices = ['iphone-6.9'];
    state.customWidth = 1320;
    state.customHeight = 2868;
    state.currentLanguage = 'en';
    state.projectLanguages = ['en'];
    state.defaults = {
        background: {
            type: 'gradient',
            gradient: {
                angle: 135,
                stops: [
                    { color: '#667eea', position: 0 },
                    { color: '#764ba2', position: 100 }
                ]
            },
            solid: '#1a1a2e',
            image: null,
            imageSrc: null,
            imageFit: 'cover',
            imageBlur: 0,
            overlayColor: '#000000',
            overlayOpacity: 0,
            noise: false,
            noiseIntensity: 10
        },
        screenshot: {
            scale: 70,
            y: 60,
            x: 50,
            rotation: 0,
            perspective: 0,
            cornerRadius: 24,
            shadow: {
                enabled: true,
                color: '#000000',
                blur: 40,
                opacity: 30,
                x: 0,
                y: 20
            },
            frame: {
                enabled: false,
                color: '#1d1d1f',
                width: 12,
                opacity: 100
            }
        },
        text: {
            headlineEnabled: true,
            headlines: { en: '' },
            headlineLanguages: ['en'],
            currentHeadlineLang: 'en',
            headlineFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
            headlineSize: 100,
            headlineWeight: '600',
            headlineItalic: false,
            headlineUnderline: false,
            headlineStrikethrough: false,
            headlineColor: '#ffffff',
            perLanguageLayout: false,
            languageSettings: {
                en: {
                    headlineSize: 100,
                    subheadlineSize: 50,
                    position: 'top',
                    offsetY: 12,
                    lineHeight: 110
                }
            },
            currentLayoutLang: 'en',
            position: 'top',
            offsetY: 12,
            lineHeight: 110,
            subheadlineEnabled: false,
            subheadlines: { en: '' },
            subheadlineLanguages: ['en'],
            currentSubheadlineLang: 'en',
            subheadlineFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'",
            subheadlineSize: 50,
            subheadlineWeight: '400',
            subheadlineItalic: false,
            subheadlineUnderline: false,
            subheadlineStrikethrough: false,
            subheadlineColor: '#ffffff',
            subheadlineOpacity: 70
        }
    };
}

// Switch to a different project
async function switchProject(projectId) {
    // Save current project first
    await saveState();

    currentProjectId = projectId;
    saveProjectsMeta();

    // Reset and load new project
    resetStateToDefaults();
    await loadState();

    syncUIWithState();
    updateScreenshotList();
    updateGradientStopsUI();
    updateProjectSelector();
    updateCanvas();
}

// Create a new project
async function createProject(name) {
    const id = 'project_' + Date.now();
    projects.push({ id, name, screenshotCount: 0 });
    saveProjectsMeta();
    await switchProject(id);
    updateProjectSelector();
}

// Rename current project
function renameProject(newName) {
    const project = projects.find(p => p.id === currentProjectId);
    if (project) {
        project.name = newName;
        saveProjectsMeta();
        updateProjectSelector();
    }
}

// Delete current project
async function deleteProject() {
    if (projects.length <= 1) {
        await showAppAlert('Cannot delete the only project', 'info');
        return;
    }

    // Remove from projects list
    const index = projects.findIndex(p => p.id === currentProjectId);
    if (index > -1) {
        projects.splice(index, 1);
    }

    // Delete from IndexedDB
    if (db) {
        const transaction = db.transaction([PROJECTS_STORE], 'readwrite');
        const store = transaction.objectStore(PROJECTS_STORE);
        store.delete(currentProjectId);
    }

    // Switch to first available project
    saveProjectsMeta();
    await switchProject(projects[0].id);
    updateProjectSelector();
}

async function duplicateProject(sourceProjectId, customName) {
    if (!db) return;

    const transaction = db.transaction([PROJECTS_STORE], 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.get(sourceProjectId);

    return new Promise((resolve) => {
        request.onsuccess = async () => {
            const projectData = request.result;
            if (!projectData) {
                await showAppAlert('Could not read project data', 'error');
                resolve();
                return;
            }

            const newId = 'project_' + Date.now();
            const sourceProject = projects.find(p => p.id === sourceProjectId);
            const newName = customName || (sourceProject ? sourceProject.name : 'Project') + ' (Copy)';

            const clonedData = JSON.parse(JSON.stringify(projectData));
            clonedData.id = newId;

            projects.push({ id: newId, name: newName, screenshotCount: clonedData.screenshots?.length || 0 });
            saveProjectsMeta();

            const writeTransaction = db.transaction([PROJECTS_STORE], 'readwrite');
            const writeStore = writeTransaction.objectStore(PROJECTS_STORE);
            writeStore.put(clonedData);

            writeTransaction.oncomplete = async () => {
                await switchProject(newId);
                updateProjectSelector();
                resolve();
            };
        };
    });
}

function sanitizeProjectExportFilename(name) {
    return (name || 'project')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '-')
        .replace(/_+/g, '_')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .toLowerCase() || 'project';
}

function getUniqueProjectName(baseName) {
    const trimmed = (baseName || 'Imported Project').trim() || 'Imported Project';
    const existing = new Set(projects.map(p => p.name.toLowerCase()));
    if (!existing.has(trimmed.toLowerCase())) return trimmed;
    let counter = 2;
    while (existing.has(`${trimmed} (${counter})`.toLowerCase())) {
        counter++;
    }
    return `${trimmed} (${counter})`;
}

async function readProjectFromStore(projectId) {
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction([PROJECTS_STORE], 'readonly');
            const store = tx.objectStore(PROJECTS_STORE);
            const req = store.get(projectId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

async function exportProject() {
    const currentProject = projects.find(p => p.id === currentProjectId);
    if (!currentProject) return;

    // Persist current in-memory edits first so export is always up-to-date.
    await saveState();

    const stored = await readProjectFromStore(currentProjectId);
    const projectData = stored || buildSerializableProjectState(currentProjectId);
    const exportPayload = {
        schema: 'appscreen-project',
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
            name: currentProject.name,
            screenshotCount: projectData.screenshots?.length || 0
        },
        data: projectData
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${sanitizeProjectExportFilename(currentProject.name)}.appscreen-project.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

async function importProjectFromData(parsedData, fallbackName = 'Imported Project') {
    if (!db) {
        await showAppAlert('Project import requires IndexedDB support.', 'error');
        return;
    }

    const maybeWrapped = parsedData && typeof parsedData === 'object' ? parsedData : null;
    const isWrapped = maybeWrapped?.schema === 'appscreen-project' && maybeWrapped?.data;
    const importedData = isWrapped ? maybeWrapped.data : maybeWrapped;

    if (!importedData || !Array.isArray(importedData.screenshots)) {
        await showAppAlert('Invalid project file format.', 'error');
        return;
    }

    const importedName = (isWrapped ? maybeWrapped?.project?.name : null) || fallbackName;
    const newName = getUniqueProjectName(importedName);
    const newId = 'project_' + Date.now();

    const clonedData = JSON.parse(JSON.stringify(importedData));
    clonedData.id = newId;
    if (!clonedData.formatVersion) clonedData.formatVersion = 2;
    if (!Array.isArray(clonedData.projectLanguages) || clonedData.projectLanguages.length === 0) {
        clonedData.projectLanguages = ['en'];
    }
    if (!clonedData.currentLanguage) {
        clonedData.currentLanguage = clonedData.projectLanguages[0];
    }
    if (!Array.isArray(clonedData.exportDevices) || clonedData.exportDevices.length === 0) {
        clonedData.exportDevices = [clonedData.outputDevice || 'iphone-6.9'];
    }

    try {
        await new Promise((resolve, reject) => {
            try {
                const tx = db.transaction([PROJECTS_STORE], 'readwrite');
                const store = tx.objectStore(PROJECTS_STORE);
                store.put(clonedData);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error || new Error('Failed to import project'));
                tx.onabort = () => reject(tx.error || new Error('Import transaction aborted'));
            } catch (e) {
                reject(e);
            }
        });

        projects.push({
            id: newId,
            name: newName,
            screenshotCount: clonedData.screenshots.length
        });
        saveProjectsMeta();

        await switchProject(newId);
        updateProjectSelector();
    } catch (error) {
        console.error('Project import transaction failed:', error);
        await showAppAlert('Failed to import project data.', 'error');
    }
}

async function importProjectFromFileContent(fileContent, fallbackName = 'Imported Project') {
    try {
        const parsed = JSON.parse(fileContent);
        await importProjectFromData(parsed, fallbackName);
    } catch (error) {
        console.error('Failed to import project:', error);
        await showAppAlert('Failed to parse project file. Please choose a valid JSON export.', 'error');
    }
}

async function importProjectFromTauri() {
    if (!window.__TAURI__) return;
    try {
        const selected = await window.__TAURI__.dialog.open({
            multiple: false,
            filters: [{ name: 'Project JSON', extensions: ['json'] }]
        });
        if (!selected) return;
        const filePath = Array.isArray(selected) ? selected[0] : selected;
        const bytes = await window.__TAURI__.fs.readFile(filePath);
        const content = new TextDecoder().decode(new Uint8Array(bytes));
        const filename = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Imported Project';
        await importProjectFromFileContent(content, filename);
    } catch (error) {
        console.error('Tauri project import error:', error);
        await showAppAlert('Failed to import project file.', 'error');
    }
}

async function importProjectFromInput(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
        const content = await file.text();
        const fallbackName = (file.name || 'Imported Project').replace(/\.[^.]+$/, '');
        await importProjectFromFileContent(content, fallbackName);
    } catch (error) {
        console.error('Project file read error:', error);
        await showAppAlert('Failed to read project file.', 'error');
    }
}

function importProject() {
    if (window.__TAURI__) {
        importProjectFromTauri();
        return;
    }
    projectImportInput?.click();
}

function duplicateScreenshot(index) {
    const original = state.screenshots[index];
    if (!original) return;

    const clone = JSON.parse(JSON.stringify({
        name: original.name,
        exportName: original.exportName || '',
        deviceType: original.deviceType,
        background: original.background,
        screenshot: original.screenshot,
        text: original.text,
        overrides: original.overrides,
        deviceOverrides: serializeDeviceOverrides(original.deviceOverrides)
    }));

    const nameParts = clone.name.split('.');
    if (nameParts.length > 1) {
        const ext = nameParts.pop();
        clone.name = nameParts.join('.') + ' (Copy).' + ext;
    } else {
        clone.name = clone.name + ' (Copy)';
    }

    clone.localizedImages = {};
    if (original.localizedImages) {
        Object.keys(original.localizedImages).forEach(lang => {
            const langData = original.localizedImages[lang];
            if (langData?.src) {
                const img = new Image();
                img.src = langData.src;
                clone.localizedImages[lang] = {
                    image: img,
                    src: langData.src,
                    name: langData.name
                };
            }
        });
    }

    if (original.image?.src) {
        const img = new Image();
        img.src = original.image.src;
        clone.image = img;
    }
    clone.deviceOverrides = hydrateDeviceOverrides(clone.deviceOverrides);

    state.screenshots.splice(index + 1, 0, clone);
    state.selectedIndex = index + 1;

    updateScreenshotList();
    syncUIWithState();
    updateGradientStopsUI();
    updateCanvas();
}

// Populate frame color swatches for the given device and highlight the active one
function updateFrameColorSwatches(deviceType, activeColorId) {
    const container = document.getElementById('frame-color-swatches');
    if (!container) return;

    const presets = typeof frameColorPresets !== 'undefined' ? frameColorPresets[deviceType] : null;
    if (!presets) {
        container.innerHTML = '';
        return;
    }

    // Default to first preset if none specified
    if (!activeColorId) activeColorId = presets[0].id;

    container.innerHTML = presets.map(p =>
        `<div class="frame-color-swatch${p.id === activeColorId ? ' active' : ''}" ` +
        `data-color-id="${p.id}" title="${p.label}" ` +
        `style="background: ${p.swatch}"></div>`
    ).join('');

    // Attach click handlers
    container.querySelectorAll('.frame-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            const colorId = swatch.dataset.colorId;
            container.querySelectorAll('.frame-color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');

            setScreenshotSetting('frameColor', colorId);

            if (typeof setPhoneFrameColor === 'function') {
                setPhoneFrameColor(colorId, deviceType);
            }

            updateCanvas();
        });
    });
}

// Sync UI controls with current state
function syncUIWithState() {
    // Update language button
    updateLanguageButton();

    state.outputDevice = normalizeOutputDevice(state.outputDevice);
    state.exportDevices = normalizeExportDevices(state.exportDevices);

    // Device selector dropdown
    document.querySelectorAll('.output-size-menu .device-option').forEach(opt => {
        const isInExportSelection = state.exportDevices.includes(opt.dataset.device);
        const isPrimary = opt.dataset.device === state.outputDevice;
        opt.classList.toggle('selected', isInExportSelection);
        opt.classList.toggle('primary-selected', isPrimary);
        const primaryBtn = opt.querySelector('.device-primary-btn');
        if (primaryBtn) {
            primaryBtn.classList.toggle('active', isPrimary);
            primaryBtn.textContent = isPrimary ? 'Primary' : 'Set';
            primaryBtn.disabled = isPrimary;
        }
    });

    // Update dropdown trigger text
    const selectedOption = document.querySelector(`.output-size-menu .device-option[data-device="${state.outputDevice}"]`);
    if (selectedOption) {
        const selectedCount = state.exportDevices.length;
        const selectedName = selectedOption.querySelector('.device-option-name').textContent;
        document.getElementById('output-size-name').textContent = selectedCount > 1 ? `${selectedCount} Platforms` : selectedName;
        if (state.outputDevice === 'custom') {
            document.getElementById('output-size-dims').textContent = `${state.customWidth} × ${state.customHeight}`;
        } else {
            document.getElementById('output-size-dims').textContent = selectedOption.querySelector('.device-option-size').textContent;
        }
    }

    // Show/hide custom inputs
    const customInputs = document.getElementById('custom-size-inputs');
    customInputs.classList.toggle('visible', state.outputDevice === 'custom');
    document.getElementById('custom-width').value = state.customWidth;
    document.getElementById('custom-height').value = state.customHeight;

    // Get current screenshot's settings
    const bg = getBackground();
    const ss = getScreenshotSettings();
    const txt = getText();

    // Background type
    document.querySelectorAll('#bg-type-selector button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === bg.type);
    });
    document.getElementById('gradient-options').style.display = bg.type === 'gradient' ? 'block' : 'none';
    document.getElementById('solid-options').style.display = bg.type === 'solid' ? 'block' : 'none';
    document.getElementById('image-options').style.display = bg.type === 'image' ? 'block' : 'none';

    // Gradient
    document.getElementById('gradient-angle').value = bg.gradient.angle;
    document.getElementById('gradient-angle-value').textContent = formatValue(bg.gradient.angle) + '°';
    updateGradientStopsUI();

    // Solid color
    document.getElementById('solid-color').value = bg.solid;
    document.getElementById('solid-color-hex').value = bg.solid;

    // Image background
    document.getElementById('bg-image-fit').value = bg.imageFit;
    document.getElementById('bg-blur').value = bg.imageBlur;
    document.getElementById('bg-blur-value').textContent = formatValue(bg.imageBlur) + 'px';
    document.getElementById('bg-overlay-color').value = bg.overlayColor;
    document.getElementById('bg-overlay-hex').value = bg.overlayColor;
    document.getElementById('bg-overlay-opacity').value = bg.overlayOpacity;
    document.getElementById('bg-overlay-opacity-value').textContent = formatValue(bg.overlayOpacity) + '%';
    const bgPreview = document.getElementById('bg-image-preview');
    const bgPreviewSrc = bg.imageSrc || bg.image?.src || '';
    if (bgPreviewSrc) {
        bgPreview.src = bgPreviewSrc;
        bgPreview.style.display = 'block';
    } else {
        bgPreview.removeAttribute('src');
        bgPreview.style.display = 'none';
    }

    // Noise
    document.getElementById('noise-toggle').classList.toggle('active', bg.noise);
    document.getElementById('noise-intensity').value = bg.noiseIntensity;
    document.getElementById('noise-intensity-value').textContent = formatValue(bg.noiseIntensity) + '%';

    // Screenshot settings
    document.getElementById('screenshot-scale').value = ss.scale;
    document.getElementById('screenshot-scale-value').textContent = formatValue(ss.scale) + '%';
    document.getElementById('screenshot-y').value = ss.y;
    document.getElementById('screenshot-y-value').textContent = formatValue(ss.y) + '%';
    document.getElementById('screenshot-x').value = ss.x;
    document.getElementById('screenshot-x-value').textContent = formatValue(ss.x) + '%';
    document.getElementById('corner-radius').value = ss.cornerRadius;
    document.getElementById('corner-radius-value').textContent = formatValue(ss.cornerRadius) + 'px';
    document.getElementById('screenshot-rotation').value = ss.rotation;
    document.getElementById('screenshot-rotation-value').textContent = formatValue(ss.rotation) + '°';

    // Shadow
    document.getElementById('shadow-toggle').classList.toggle('active', ss.shadow.enabled);
    document.getElementById('shadow-color').value = ss.shadow.color;
    document.getElementById('shadow-color-hex').value = ss.shadow.color;
    document.getElementById('shadow-blur').value = ss.shadow.blur;
    document.getElementById('shadow-blur-value').textContent = formatValue(ss.shadow.blur) + 'px';
    document.getElementById('shadow-opacity').value = ss.shadow.opacity;
    document.getElementById('shadow-opacity-value').textContent = formatValue(ss.shadow.opacity) + '%';
    document.getElementById('shadow-x').value = ss.shadow.x;
    document.getElementById('shadow-x-value').textContent = formatValue(ss.shadow.x) + 'px';
    document.getElementById('shadow-y').value = ss.shadow.y;
    document.getElementById('shadow-y-value').textContent = formatValue(ss.shadow.y) + 'px';

    // Frame/Border
    document.getElementById('frame-toggle').classList.toggle('active', ss.frame.enabled);
    document.getElementById('frame-color').value = ss.frame.color;
    document.getElementById('frame-color-hex').value = ss.frame.color;
    document.getElementById('frame-width').value = ss.frame.width;
    document.getElementById('frame-width-value').textContent = formatValue(ss.frame.width) + 'px';
    document.getElementById('frame-opacity').value = ss.frame.opacity;
    document.getElementById('frame-opacity-value').textContent = formatValue(ss.frame.opacity) + '%';

    // Text
    const headlineLang = txt.currentHeadlineLang || 'en';
    const subheadlineLang = txt.currentSubheadlineLang || 'en';
    const layoutLang = getTextLayoutLanguage(txt);
    const headlineLayout = getEffectiveLayout(txt, headlineLang);
    const subheadlineLayout = getEffectiveLayout(txt, subheadlineLang);
    const layoutSettings = getEffectiveLayout(txt, layoutLang);
    const currentHeadline = txt.headlines ? (txt.headlines[headlineLang] || '') : (txt.headline || '');
    document.getElementById('headline-text').value = currentHeadline;
    document.getElementById('headline-font').value = txt.headlineFont;
    updateFontPickerPreview();
    document.getElementById('headline-size').value = headlineLayout.headlineSize;
    document.getElementById('headline-color').value = txt.headlineColor;
    document.getElementById('headline-weight').value = txt.headlineWeight;
    // Sync text style buttons
    document.querySelectorAll('#headline-style button').forEach(btn => {
        const style = btn.dataset.style;
        const key = 'headline' + style.charAt(0).toUpperCase() + style.slice(1);
        btn.classList.toggle('active', txt[key] || false);
    });
    document.querySelectorAll('#text-position button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.position === layoutSettings.position);
    });
    document.getElementById('text-offset-y').value = layoutSettings.offsetY;
    document.getElementById('text-offset-y-value').textContent = formatValue(layoutSettings.offsetY) + '%';
    document.getElementById('line-height').value = layoutSettings.lineHeight;
    document.getElementById('line-height-value').textContent = formatValue(layoutSettings.lineHeight) + '%';
    const currentSubheadline = txt.subheadlines ? (txt.subheadlines[subheadlineLang] || '') : (txt.subheadline || '');
    document.getElementById('subheadline-text').value = currentSubheadline;
    document.getElementById('subheadline-font').value = txt.subheadlineFont || txt.headlineFont;
    document.getElementById('subheadline-size').value = subheadlineLayout.subheadlineSize;
    document.getElementById('subheadline-color').value = txt.subheadlineColor;
    document.getElementById('subheadline-opacity').value = txt.subheadlineOpacity;
    document.getElementById('subheadline-opacity-value').textContent = formatValue(txt.subheadlineOpacity) + '%';
    document.getElementById('subheadline-weight').value = txt.subheadlineWeight || '400';
    // Sync subheadline style buttons
    document.querySelectorAll('#subheadline-style button').forEach(btn => {
        const style = btn.dataset.style;
        const key = 'subheadline' + style.charAt(0).toUpperCase() + style.slice(1);
        btn.classList.toggle('active', txt[key] || false);
    });

    // Per-language layout toggle
    document.getElementById('per-language-layout-toggle').classList.toggle('active', txt.perLanguageLayout || false);

    // Headline/Subheadline toggles
    const headlineEnabled = txt.headlineEnabled !== false; // default true for backwards compatibility
    const subheadlineEnabled = txt.subheadlineEnabled || false;
    document.getElementById('headline-toggle').classList.toggle('active', headlineEnabled);
    document.getElementById('subheadline-toggle').classList.toggle('active', subheadlineEnabled);

    // Language UIs
    updateHeadlineLanguageUI();
    updateSubheadlineLanguageUI();

    // 3D mode
    const use3D = ss.use3D || false;
    const device3D = ss.device3D || 'iphone';
    const rotation3D = ss.rotation3D || { x: 0, y: 0, z: 0 };
    document.querySelectorAll('#device-type-selector button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === (use3D ? '3d' : '2d'));
    });
    document.querySelectorAll('#device-3d-selector button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.model === device3D);
    });
    updateFrameColorSwatches(device3D, ss.frameColor);
    document.getElementById('rotation-3d-options').style.display = use3D ? 'block' : 'none';
    document.getElementById('rotation-3d-x').value = rotation3D.x;
    document.getElementById('rotation-3d-x-value').textContent = formatValue(rotation3D.x) + '°';
    document.getElementById('rotation-3d-y').value = rotation3D.y;
    document.getElementById('rotation-3d-y-value').textContent = formatValue(rotation3D.y) + '°';
    document.getElementById('rotation-3d-z').value = rotation3D.z;
    document.getElementById('rotation-3d-z-value').textContent = formatValue(rotation3D.z) + '°';

    // Hide 2D-only settings in 3D mode, show 3D tip
    document.getElementById('2d-only-settings').style.display = use3D ? 'none' : 'block';
    document.getElementById('position-presets-section').style.display = use3D ? 'none' : 'block';
    document.getElementById('frame-color-section').style.display = use3D ? 'block' : 'none';
    document.getElementById('3d-tip').style.display = use3D ? 'flex' : 'none';

    // Show/hide 3D renderer and switch model if needed
    if (typeof showThreeJS === 'function') {
        showThreeJS(use3D);
    }
    if (use3D && typeof switchPhoneModel === 'function') {
        switchPhoneModel(device3D);
    }

    // Elements
    selectedElementId = null;
    updateElementsList();
    updateElementProperties();

    // Popouts
    selectedPopoutId = null;
    updatePopoutsList();
    updatePopoutProperties();
}

// ===== Elements Tab UI =====

function updateElementsList() {
    const listEl = document.getElementById('elements-list');
    const emptyEl = document.getElementById('elements-empty');
    if (!listEl) return;

    const elements = getElements();

    // Remove old items (keep the empty message)
    listEl.querySelectorAll('.element-item').forEach(el => el.remove());

    if (elements.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    elements.forEach(el => {
        const item = document.createElement('div');
        item.className = 'element-item' + (el.id === selectedElementId ? ' selected' : '');
        item.dataset.elementId = el.id;

        const layerLabels = {
            'behind-screenshot': 'Behind',
            'above-screenshot': 'Middle',
            'above-text': 'Front'
        };

        let thumbContent;
        if (el.type === 'graphic' && el.image) {
            thumbContent = `<img src="${el.image.src}" alt="${el.name}">`;
        } else if (el.type === 'emoji') {
            thumbContent = `<span class="emoji-thumb">${el.emoji}</span>`;
        } else if (el.type === 'icon' && el.image) {
            thumbContent = `<img src="${el.image.src}" alt="${el.name}" style="padding: 4px; filter: var(--icon-thumb-filter, none);">`;
        } else {
            thumbContent = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
            </svg>`;
        }

        item.innerHTML = `
            <div class="element-item-thumb">${thumbContent}</div>
            <div class="element-item-info">
                <div class="element-item-name">${el.type === 'text' ? (getElementText(el) || 'Text') : el.type === 'emoji' ? `${el.emoji} ${el.name}` : el.name}</div>
                <div class="element-item-layer">${layerLabels[el.layer] || el.layer}</div>
            </div>
            <div class="element-item-actions">
                <button class="element-item-btn" data-action="move-up" title="Move up">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="18 15 12 9 6 15"/>
                    </svg>
                </button>
                <button class="element-item-btn" data-action="move-down" title="Move down">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <button class="element-item-btn danger" data-action="delete" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;

        // Click to select
        item.addEventListener('click', (e) => {
            if (e.target.closest('.element-item-btn')) return;
            selectedElementId = el.id;
            updateElementsList();
            updateElementProperties();
        });

        // Action buttons
        item.querySelectorAll('.element-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'delete') deleteElement(el.id);
                else if (action === 'move-up') moveElementLayer(el.id, 'up');
                else if (action === 'move-down') moveElementLayer(el.id, 'down');
            });
        });

        listEl.appendChild(item);
    });
}

function updateElementProperties() {
    const propsEl = document.getElementById('element-properties');
    if (!propsEl) return;

    const el = getSelectedElement();
    if (!el) {
        propsEl.style.display = 'none';
        return;
    }

    propsEl.style.display = '';
    const titleMap = { text: 'Text Element', emoji: `${el.emoji} Emoji`, icon: `Icon: ${el.name}`, graphic: el.name || 'Graphic' };
    document.getElementById('element-properties-title').textContent = titleMap[el.type] || el.name || 'Element';

    document.getElementById('element-layer').value = el.layer;
    document.getElementById('element-x').value = el.x;
    document.getElementById('element-x-value').textContent = formatValue(el.x) + '%';
    document.getElementById('element-y').value = el.y;
    document.getElementById('element-y-value').textContent = formatValue(el.y) + '%';
    document.getElementById('element-width').value = el.width;
    document.getElementById('element-width-value').textContent = formatValue(el.width) + '%';
    document.getElementById('element-rotation').value = el.rotation;
    document.getElementById('element-rotation-value').textContent = formatValue(el.rotation) + '°';
    document.getElementById('element-opacity').value = el.opacity;
    document.getElementById('element-opacity-value').textContent = formatValue(el.opacity) + '%';

    // Type-specific properties
    const textProps = document.getElementById('element-text-properties');
    const iconProps = document.getElementById('element-icon-properties');

    // Hide all type-specific panels first
    textProps.style.display = 'none';
    if (iconProps) iconProps.style.display = 'none';

    if (el.type === 'text') {
        textProps.style.display = '';
        document.getElementById('element-text-input').value = getElementText(el);
        document.getElementById('element-font').value = el.font;
        updateElementFontPickerPreview(el);
        document.getElementById('element-font-size').value = el.fontSize;
        document.getElementById('element-font-color').value = el.fontColor;
        document.getElementById('element-font-weight').value = el.fontWeight;
        document.getElementById('element-italic-btn').classList.toggle('active', el.italic);
        document.getElementById('element-frame').value = el.frame || 'none';
        const frameOpts = document.getElementById('element-frame-options');
        frameOpts.style.display = el.frame && el.frame !== 'none' ? '' : 'none';
        if (el.frame && el.frame !== 'none') {
            document.getElementById('element-frame-color').value = el.frameColor;
            document.getElementById('element-frame-color-hex').value = el.frameColor;
            document.getElementById('element-frame-scale').value = el.frameScale;
            document.getElementById('element-frame-scale-value').textContent = formatValue(el.frameScale) + '%';
        }
    } else if (el.type === 'icon' && iconProps) {
        iconProps.style.display = '';
        document.getElementById('element-icon-color').value = el.iconColor || '#ffffff';
        document.getElementById('element-icon-color-hex').value = el.iconColor || '#ffffff';
        document.getElementById('element-icon-stroke-width').value = el.iconStrokeWidth || 2;
        document.getElementById('element-icon-stroke-width-value').textContent = el.iconStrokeWidth || 2;
        // Shadow
        const shadow = el.iconShadow || { enabled: false, color: '#000000', blur: 20, opacity: 40, x: 0, y: 10 };
        const shadowToggle = document.getElementById('element-icon-shadow-toggle');
        const shadowOpts = document.getElementById('element-icon-shadow-options');
        const shadowRow = shadowToggle?.closest('.toggle-row');
        if (shadowToggle) shadowToggle.classList.toggle('active', shadow.enabled);
        if (shadowRow) shadowRow.classList.toggle('collapsed', !shadow.enabled);
        if (shadowOpts) shadowOpts.style.display = shadow.enabled ? '' : 'none';
        document.getElementById('element-icon-shadow-color').value = shadow.color;
        document.getElementById('element-icon-shadow-color-hex').value = shadow.color;
        document.getElementById('element-icon-shadow-blur').value = shadow.blur;
        document.getElementById('element-icon-shadow-blur-value').textContent = shadow.blur + 'px';
        document.getElementById('element-icon-shadow-opacity').value = shadow.opacity;
        document.getElementById('element-icon-shadow-opacity-value').textContent = shadow.opacity + '%';
        document.getElementById('element-icon-shadow-x').value = shadow.x;
        document.getElementById('element-icon-shadow-x-value').textContent = shadow.x + 'px';
        document.getElementById('element-icon-shadow-y').value = shadow.y;
        document.getElementById('element-icon-shadow-y-value').textContent = shadow.y + 'px';
    }
}

function setupElementEventListeners() {
    // Add Graphic button
    const addGraphicBtn = document.getElementById('add-graphic-btn');
    const graphicInput = document.getElementById('element-graphic-input');
    if (addGraphicBtn && graphicInput) {
        addGraphicBtn.addEventListener('click', () => graphicInput.click());
        graphicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    addGraphicElement(img, ev.target.result, file.name);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            graphicInput.value = '';
        });
    }

    // Add Text button
    const addTextBtn = document.getElementById('add-text-element-btn');
    if (addTextBtn) {
        addTextBtn.addEventListener('click', () => addTextElement());
    }

    // Add Emoji button
    const addEmojiBtn = document.getElementById('add-emoji-btn');
    if (addEmojiBtn) {
        addEmojiBtn.addEventListener('click', () => showEmojiPicker());
    }

    // Add Icon button
    const addIconBtn = document.getElementById('add-icon-btn');
    if (addIconBtn) {
        addIconBtn.addEventListener('click', () => showIconPicker());
    }

    // Icon color picker
    const iconColor = document.getElementById('element-icon-color');
    const iconColorHex = document.getElementById('element-icon-color-hex');
    if (iconColor) {
        iconColor.addEventListener('input', () => {
            const el = getSelectedElement();
            if (el && el.type === 'icon') {
                el.iconColor = iconColor.value;
                if (iconColorHex) iconColorHex.value = iconColor.value;
                updateIconImage(el);
            }
        });
    }
    if (iconColorHex) {
        iconColorHex.addEventListener('change', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(iconColorHex.value)) {
                const el = getSelectedElement();
                if (el && el.type === 'icon') {
                    el.iconColor = iconColorHex.value;
                    if (iconColor) iconColor.value = iconColorHex.value;
                    updateIconImage(el);
                }
            }
        });
    }

    // Icon stroke width
    const iconStroke = document.getElementById('element-icon-stroke-width');
    const iconStrokeVal = document.getElementById('element-icon-stroke-width-value');
    if (iconStroke) {
        iconStroke.addEventListener('input', () => {
            const val = parseFloat(iconStroke.value);
            if (iconStrokeVal) iconStrokeVal.textContent = val;
            const el = getSelectedElement();
            if (el && el.type === 'icon') {
                el.iconStrokeWidth = val;
                updateIconImage(el);
            }
        });
    }

    // Icon shadow toggle
    const iconShadowToggle = document.getElementById('element-icon-shadow-toggle');
    if (iconShadowToggle) {
        iconShadowToggle.addEventListener('click', () => {
            const el = getSelectedElement();
            if (!el || el.type !== 'icon') return;
            if (!el.iconShadow) el.iconShadow = { enabled: false, color: '#000000', blur: 20, opacity: 40, x: 0, y: 10 };
            el.iconShadow.enabled = !el.iconShadow.enabled;
            updateElementProperties();
            updateCanvas();
        });
    }

    // Icon shadow property helpers
    const bindIconShadow = (inputId, prop, suffix) => {
        const input = document.getElementById(inputId);
        const valEl = document.getElementById(inputId + '-value');
        if (!input) return;
        input.addEventListener('input', () => {
            const el = getSelectedElement();
            if (!el || el.type !== 'icon' || !el.iconShadow) return;
            el.iconShadow[prop] = parseFloat(input.value);
            if (valEl) valEl.textContent = input.value + suffix;
            updateCanvas();
        });
    };
    bindIconShadow('element-icon-shadow-blur', 'blur', 'px');
    bindIconShadow('element-icon-shadow-opacity', 'opacity', '%');
    bindIconShadow('element-icon-shadow-x', 'x', 'px');
    bindIconShadow('element-icon-shadow-y', 'y', 'px');

    // Icon shadow color
    const iconShadowColor = document.getElementById('element-icon-shadow-color');
    const iconShadowColorHex = document.getElementById('element-icon-shadow-color-hex');
    if (iconShadowColor) {
        iconShadowColor.addEventListener('input', () => {
            const el = getSelectedElement();
            if (el?.type === 'icon' && el.iconShadow) {
                el.iconShadow.color = iconShadowColor.value;
                if (iconShadowColorHex) iconShadowColorHex.value = iconShadowColor.value;
                updateCanvas();
            }
        });
    }
    if (iconShadowColorHex) {
        iconShadowColorHex.addEventListener('change', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(iconShadowColorHex.value)) {
                const el = getSelectedElement();
                if (el?.type === 'icon' && el.iconShadow) {
                    el.iconShadow.color = iconShadowColorHex.value;
                    if (iconShadowColor) iconShadowColor.value = iconShadowColorHex.value;
                    updateCanvas();
                }
            }
        });
    }

    // Property sliders
    const bindSlider = (id, prop, suffix, parser) => {
        const input = document.getElementById(id);
        const valueEl = document.getElementById(id + '-value');
        if (!input) return;
        input.addEventListener('input', () => {
            const val = parser ? parser(input.value) : parseFloat(input.value);
            if (valueEl) valueEl.textContent = formatValue(val) + suffix;
            if (selectedElementId) setElementProperty(selectedElementId, prop, val);
        });
    };

    bindSlider('element-x', 'x', '%');
    bindSlider('element-y', 'y', '%');
    bindSlider('element-width', 'width', '%');
    bindSlider('element-rotation', 'rotation', '°');
    bindSlider('element-opacity', 'opacity', '%');

    // Layer dropdown
    const layerSelect = document.getElementById('element-layer');
    if (layerSelect) {
        layerSelect.addEventListener('change', () => {
            if (selectedElementId) {
                setElementProperty(selectedElementId, 'layer', layerSelect.value);
            }
        });
    }

    if (window.TextControls?.setupElementTextControls) {
        window.TextControls.setupElementTextControls({
            getSelectedElement,
            setElementProperty,
            updateCanvas,
            updateElementsList,
            formatValue,
            state,
            bindSlider
        });
    }

    // Canvas drag interaction for elements
    setupElementCanvasDrag();
}

function setupElementCanvasDrag() {
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const previewCanvas = document.getElementById('preview-canvas');
    if (!previewCanvas) return;

    // Snap guides state
    const SNAP_THRESHOLD = 1.5; // percentage units (of canvas width/height)
    let activeSnapGuides = { x: null, y: null }; // which guides are active

    function getCanvasCoords(e) {
        const rect = previewCanvas.getBoundingClientRect();
        const scaleX = previewCanvas.width / rect.width;
        const scaleY = previewCanvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function snapToGuides(x, y) {
        const snapped = { x, y };
        activeSnapGuides = { x: null, y: null };

        // Snap to horizontal center (x = 50%)
        if (Math.abs(x - 50) < SNAP_THRESHOLD) {
            snapped.x = 50;
            activeSnapGuides.x = 50;
        }

        // Snap to vertical middle (y = 50%)
        if (Math.abs(y - 50) < SNAP_THRESHOLD) {
            snapped.y = 50;
            activeSnapGuides.y = 50;
        }

        return snapped;
    }

    function hitTestPopouts(canvasX, canvasY) {
        const popouts = getPopouts();
        const dims = getCanvasDimensions();
        const screenshot = getCurrentScreenshot();
        if (!screenshot) return null;
        const img = getScreenshotImage(screenshot);
        if (!img) return null;

        // Test in reverse order (topmost first)
        for (let i = popouts.length - 1; i >= 0; i--) {
            const p = popouts[i];
            const cx = dims.width * (p.x / 100);
            const cy = dims.height * (p.y / 100);
            const displayW = dims.width * (p.width / 100);
            const sw = (p.cropWidth / 100) * img.width;
            const sh = (p.cropHeight / 100) * img.height;
            const cropAspect = sh / sw;
            const displayH = displayW * cropAspect;
            const halfW = displayW / 2;
            const halfH = displayH / 2;

            if (canvasX >= cx - halfW && canvasX <= cx + halfW &&
                canvasY >= cy - halfH && canvasY <= cy + halfH) {
                return p;
            }
        }
        return null;
    }

    function hitTestElements(canvasX, canvasY) {
        const elements = getElements();
        const dims = getCanvasDimensions();
        // Test in reverse order (topmost first)
        const layers = ['above-text', 'above-screenshot', 'behind-screenshot'];
        for (const layer of layers) {
            const layerEls = elements.filter(el => el.layer === layer).reverse();
            for (const el of layerEls) {
                const cx = dims.width * (el.x / 100);
                const cy = dims.height * (el.y / 100);
                const elWidth = dims.width * (el.width / 100);
                let elHeight;

                if (el.type === 'emoji' || el.type === 'icon') {
                    elHeight = elWidth; // square bounding box
                } else if (el.type === 'graphic' && el.image) {
                    elHeight = elWidth * (el.image.height / el.image.width);
                } else {
                    elHeight = el.fontSize * 1.5;
                }

                // Simple bounding box hit test (ignoring rotation for simplicity)
                const halfW = elWidth / 2;
                const halfH = elHeight / 2;

                if (canvasX >= cx - halfW && canvasX <= cx + halfW &&
                    canvasY >= cy - halfH && canvasY <= cy + halfH) {
                    return el;
                }
            }
        }
        return null;
    }

    function applyDragMove(coords) {
        const dx = coords.x - draggingElement.startX;
        const dy = coords.y - draggingElement.startY;
        const rawX = draggingElement.origX + (dx / draggingElement.dims.width) * 100;
        const rawY = draggingElement.origY + (dy / draggingElement.dims.height) * 100;

        const clamped = {
            x: Math.max(0, Math.min(100, rawX)),
            y: Math.max(0, Math.min(100, rawY))
        };
        const snapped = snapToGuides(clamped.x, clamped.y);

        if (draggingElement.isPopout) {
            const p = getPopouts().find(po => po.id === draggingElement.id);
            if (p) {
                p.x = snapped.x;
                p.y = snapped.y;
                updateCanvas();
                drawSnapGuides();
                updatePopoutProperties();
            }
        } else {
            const el = getElements().find(e => e.id === draggingElement.id);
            if (el) {
                el.x = snapped.x;
                el.y = snapped.y;
                updateCanvas();
                drawSnapGuides();
                updateElementProperties();
            }
        }
    }

    function clearDrag() {
        if (draggingElement) {
            draggingElement = null;
            activeSnapGuides = { x: null, y: null };
            canvasWrapper.classList.remove('element-dragging');
            updateCanvas(); // redraw without guides
        }
    }

    previewCanvas.addEventListener('mousedown', (e) => {
        const coords = getCanvasCoords(e);

        // Check popouts first (they render on top of elements above-screenshot)
        const popoutHit = hitTestPopouts(coords.x, coords.y);
        if (popoutHit) {
            e.preventDefault();
            e.stopPropagation();
            const dims = getCanvasDimensions();
            draggingElement = {
                id: popoutHit.id,
                startX: coords.x,
                startY: coords.y,
                origX: popoutHit.x,
                origY: popoutHit.y,
                dims: dims,
                isPopout: true
            };
            selectedPopoutId = popoutHit.id;
            selectedElementId = null;
            updatePopoutsList();
            updatePopoutProperties();
            updateElementsList();
            updateElementProperties();
            canvasWrapper.classList.add('element-dragging');

            const popoutsTab = document.querySelector('.tab[data-tab="popouts"]');
            if (popoutsTab && !popoutsTab.classList.contains('active')) {
                popoutsTab.click();
            }
            return;
        }

        const hit = hitTestElements(coords.x, coords.y);
        if (hit) {
            e.preventDefault();
            e.stopPropagation();
            const dims = getCanvasDimensions();
            draggingElement = {
                id: hit.id,
                startX: coords.x,
                startY: coords.y,
                origX: hit.x,
                origY: hit.y,
                dims: dims,
                isPopout: false
            };
            selectedElementId = hit.id;
            selectedPopoutId = null;
            updateElementsList();
            updateElementProperties();
            updatePopoutsList();
            updatePopoutProperties();
            canvasWrapper.classList.add('element-dragging');

            const elementsTab = document.querySelector('.tab[data-tab="elements"]');
            if (elementsTab && !elementsTab.classList.contains('active')) {
                elementsTab.click();
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!draggingElement) {
            // Hover detection
            const coords = getCanvasCoords(e);
            const popoutHit = hitTestPopouts(coords.x, coords.y);
            const hit = popoutHit || hitTestElements(coords.x, coords.y);
            canvasWrapper.classList.toggle('element-hover', !!hit);
            return;
        }
        e.preventDefault();
        applyDragMove(getCanvasCoords(e));
    });

    window.addEventListener('mouseup', () => clearDrag());

    // Touch support
    previewCanvas.addEventListener('touchstart', (e) => {
        const coords = getCanvasCoords(e);

        const popoutHit = hitTestPopouts(coords.x, coords.y);
        if (popoutHit) {
            e.preventDefault();
            const dims = getCanvasDimensions();
            draggingElement = {
                id: popoutHit.id,
                startX: coords.x,
                startY: coords.y,
                origX: popoutHit.x,
                origY: popoutHit.y,
                dims: dims,
                isPopout: true
            };
            selectedPopoutId = popoutHit.id;
            selectedElementId = null;
            updatePopoutsList();
            updatePopoutProperties();
            return;
        }

        const hit = hitTestElements(coords.x, coords.y);
        if (hit) {
            e.preventDefault();
            const dims = getCanvasDimensions();
            draggingElement = {
                id: hit.id,
                startX: coords.x,
                startY: coords.y,
                origX: hit.x,
                origY: hit.y,
                dims: dims,
                isPopout: false
            };
            selectedElementId = hit.id;
            updateElementsList();
            updateElementProperties();
        }
    }, { passive: false });

    previewCanvas.addEventListener('touchmove', (e) => {
        if (!draggingElement) return;
        e.preventDefault();
        applyDragMove(getCanvasCoords(e));
    }, { passive: false });

    previewCanvas.addEventListener('touchend', () => clearDrag());
}

// Draw snap guide lines over the canvas when dragging near center/middle
function drawSnapGuides() {
    if (!draggingElement) return;

    const el = getSelectedElement();
    if (!el) return;

    const dims = getCanvasDimensions();
    // Scale relative to canvas so guides stay visible in the scaled-down preview
    const scale = dims.width / 400;

    ctx.save();
    ctx.strokeStyle = 'rgba(120, 170, 255, 0.45)';
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.setLineDash([12 * scale, 8 * scale]);

    // Vertical center line (x = 50%)
    if (Math.abs(el.x - 50) < 0.01) {
        const lineX = Math.round(dims.width * 0.5);
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, dims.height);
        ctx.stroke();
    }

    // Horizontal middle line (y = 50%)
    if (Math.abs(el.y - 50) < 0.01) {
        const lineY = Math.round(dims.height * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(dims.width, lineY);
        ctx.stroke();
    }

    ctx.restore();
}

// ===== Popouts Tab UI =====

function updatePopoutsList() {
    const listEl = document.getElementById('popouts-list');
    const emptyEl = document.getElementById('popouts-empty');
    const addBtn = document.getElementById('add-popout-btn');
    if (!listEl) return;

    const popouts = getPopouts();
    const screenshot = getCurrentScreenshot();
    const hasImage = screenshot && getScreenshotImage(screenshot);

    // Disable add button when no screenshot image
    if (addBtn) {
        addBtn.disabled = !hasImage;
        addBtn.style.opacity = hasImage ? '' : '0.4';
    }

    // Remove old items
    listEl.querySelectorAll('.popout-item').forEach(el => el.remove());

    if (popouts.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    popouts.forEach((p, idx) => {
        const item = document.createElement('div');
        item.className = 'popout-item' + (p.id === selectedPopoutId ? ' selected' : '');
        item.dataset.popoutId = p.id;

        // Generate crop preview thumbnail
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 28;
        thumbCanvas.height = 28;
        const thumbCtx = thumbCanvas.getContext('2d');
        const img = hasImage ? getScreenshotImage(screenshot) : null;
        if (img) {
            const sx = (p.cropX / 100) * img.width;
            const sy = (p.cropY / 100) * img.height;
            const sw = (p.cropWidth / 100) * img.width;
            const sh = (p.cropHeight / 100) * img.height;
            thumbCtx.drawImage(img, sx, sy, sw, sh, 0, 0, 28, 28);
        }

        item.innerHTML = `
            <div class="popout-item-thumb"></div>
            <div class="popout-item-info">
                <div class="popout-item-name">Popout ${idx + 1}</div>
                <div class="popout-item-crop">${Math.round(p.cropWidth)}% × ${Math.round(p.cropHeight)}%</div>
            </div>
            <div class="popout-item-actions">
                <button class="element-item-btn" data-action="move-up" title="Move up">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="18 15 12 9 6 15"/>
                    </svg>
                </button>
                <button class="element-item-btn" data-action="move-down" title="Move down">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <button class="element-item-btn danger" data-action="delete" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;

        // Insert thumbnail canvas
        const thumbHolder = item.querySelector('.popout-item-thumb');
        if (thumbHolder) thumbHolder.appendChild(thumbCanvas);

        item.addEventListener('click', (e) => {
            if (e.target.closest('.element-item-btn')) return;
            selectedPopoutId = p.id;
            updatePopoutsList();
            updatePopoutProperties();
        });

        item.querySelectorAll('.element-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'delete') deletePopout(p.id);
                else if (action === 'move-up') movePopout(p.id, 'up');
                else if (action === 'move-down') movePopout(p.id, 'down');
            });
        });

        listEl.appendChild(item);
    });
}

function updatePopoutProperties() {
    const propsEl = document.getElementById('popout-properties');
    if (!propsEl) return;

    const p = getSelectedPopout();
    if (!p) {
        propsEl.style.display = 'none';
        return;
    }
    propsEl.style.display = '';

    // Crop region
    document.getElementById('popout-crop-x').value = p.cropX;
    document.getElementById('popout-crop-x-value').textContent = formatValue(p.cropX) + '%';
    document.getElementById('popout-crop-y').value = p.cropY;
    document.getElementById('popout-crop-y-value').textContent = formatValue(p.cropY) + '%';
    document.getElementById('popout-crop-width').value = p.cropWidth;
    document.getElementById('popout-crop-width-value').textContent = formatValue(p.cropWidth) + '%';
    document.getElementById('popout-crop-height').value = p.cropHeight;
    document.getElementById('popout-crop-height-value').textContent = formatValue(p.cropHeight) + '%';

    // Display
    document.getElementById('popout-x').value = p.x;
    document.getElementById('popout-x-value').textContent = formatValue(p.x) + '%';
    document.getElementById('popout-y').value = p.y;
    document.getElementById('popout-y-value').textContent = formatValue(p.y) + '%';
    document.getElementById('popout-width').value = p.width;
    document.getElementById('popout-width-value').textContent = formatValue(p.width) + '%';
    document.getElementById('popout-rotation').value = p.rotation;
    document.getElementById('popout-rotation-value').textContent = formatValue(p.rotation) + '°';
    document.getElementById('popout-opacity').value = p.opacity;
    document.getElementById('popout-opacity-value').textContent = formatValue(p.opacity) + '%';
    document.getElementById('popout-corner-radius').value = p.cornerRadius;
    document.getElementById('popout-corner-radius-value').textContent = formatValue(p.cornerRadius) + 'px';

    // Shadow
    const shadow = p.shadow || { enabled: false, color: '#000000', blur: 30, opacity: 40, x: 0, y: 15 };
    document.getElementById('popout-shadow-toggle').classList.toggle('active', shadow.enabled);
    const shadowRow = document.getElementById('popout-shadow-toggle')?.closest('.toggle-row');
    if (shadowRow) shadowRow.classList.toggle('collapsed', !shadow.enabled);
    document.getElementById('popout-shadow-options').style.display = shadow.enabled ? '' : 'none';
    document.getElementById('popout-shadow-color').value = shadow.color;
    document.getElementById('popout-shadow-color-hex').value = shadow.color;
    document.getElementById('popout-shadow-blur').value = shadow.blur;
    document.getElementById('popout-shadow-blur-value').textContent = formatValue(shadow.blur) + 'px';
    document.getElementById('popout-shadow-opacity').value = shadow.opacity;
    document.getElementById('popout-shadow-opacity-value').textContent = formatValue(shadow.opacity) + '%';
    document.getElementById('popout-shadow-x').value = shadow.x;
    document.getElementById('popout-shadow-x-value').textContent = formatValue(shadow.x) + 'px';
    document.getElementById('popout-shadow-y').value = shadow.y;
    document.getElementById('popout-shadow-y-value').textContent = formatValue(shadow.y) + 'px';

    // Border
    const border = p.border || { enabled: false, color: '#ffffff', width: 3, opacity: 100 };
    document.getElementById('popout-border-toggle').classList.toggle('active', border.enabled);
    const borderRow = document.getElementById('popout-border-toggle')?.closest('.toggle-row');
    if (borderRow) borderRow.classList.toggle('collapsed', !border.enabled);
    document.getElementById('popout-border-options').style.display = border.enabled ? '' : 'none';
    document.getElementById('popout-border-color').value = border.color;
    document.getElementById('popout-border-color-hex').value = border.color;
    document.getElementById('popout-border-width').value = border.width;
    document.getElementById('popout-border-width-value').textContent = formatValue(border.width) + 'px';
    document.getElementById('popout-border-opacity').value = border.opacity;
    document.getElementById('popout-border-opacity-value').textContent = formatValue(border.opacity) + '%';

    // Update crop preview
    updateCropPreview();
}

// Compute image-fit layout within the crop preview canvas (letterboxed)
function getCropPreviewLayout(previewCanvas, img) {
    const w = previewCanvas.width;
    const h = previewCanvas.height;
    const imgAspect = img.width / img.height;
    const canvasAspect = w / h;
    let drawW, drawH, drawX, drawY;
    if (imgAspect > canvasAspect) {
        drawW = w;
        drawH = w / imgAspect;
        drawX = 0;
        drawY = (h - drawH) / 2;
    } else {
        drawH = h;
        drawW = h * imgAspect;
        drawX = (w - drawW) / 2;
        drawY = 0;
    }
    return { drawX, drawY, drawW, drawH };
}

function updateCropPreview() {
    const previewCanvas = document.getElementById('popout-crop-preview');
    if (!previewCanvas) return;
    const p = getSelectedPopout();
    const screenshot = getCurrentScreenshot();
    if (!p || !screenshot) return;
    const img = getScreenshotImage(screenshot);
    if (!img) return;

    // Resize canvas to match sidebar width while keeping image aspect
    const containerWidth = previewCanvas.parentElement?.clientWidth || 280;
    const imgAspect = img.width / img.height;
    const canvasW = containerWidth * 2; // 2x for retina
    const canvasH = Math.round(canvasW / imgAspect);
    previewCanvas.width = canvasW;
    previewCanvas.height = canvasH;
    previewCanvas.style.width = containerWidth + 'px';
    previewCanvas.style.height = Math.round(containerWidth / imgAspect) + 'px';

    const ctx2 = previewCanvas.getContext('2d');
    const layout = getCropPreviewLayout(previewCanvas, img);
    const { drawX, drawY, drawW, drawH } = layout;

    ctx2.clearRect(0, 0, canvasW, canvasH);

    // Draw full image
    ctx2.drawImage(img, drawX, drawY, drawW, drawH);

    // Dim overlay outside crop region
    const rx = drawX + (p.cropX / 100) * drawW;
    const ry = drawY + (p.cropY / 100) * drawH;
    const rw = (p.cropWidth / 100) * drawW;
    const rh = (p.cropHeight / 100) * drawH;

    ctx2.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx2.fillRect(0, 0, canvasW, canvasH);

    // Clear crop region to show undimmed image
    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(rx, ry, rw, rh);
    ctx2.clip();
    ctx2.clearRect(rx, ry, rw, rh);
    ctx2.drawImage(img, drawX, drawY, drawW, drawH);
    ctx2.restore();

    // Crop border
    ctx2.strokeStyle = 'rgba(10, 132, 255, 0.9)';
    ctx2.lineWidth = 2;
    ctx2.strokeRect(rx, ry, rw, rh);

    // Corner handles (vector editor style)
    const handleSize = 8;
    const handles = [
        { x: rx, y: ry },                     // top-left
        { x: rx + rw, y: ry },                // top-right
        { x: rx, y: ry + rh },                // bottom-left
        { x: rx + rw, y: ry + rh },           // bottom-right
    ];
    // Edge midpoint handles
    const midHandles = [
        { x: rx + rw / 2, y: ry },            // top-center
        { x: rx + rw / 2, y: ry + rh },       // bottom-center
        { x: rx, y: ry + rh / 2 },            // left-center
        { x: rx + rw, y: ry + rh / 2 },       // right-center
    ];

    ctx2.fillStyle = '#ffffff';
    ctx2.strokeStyle = 'rgba(10, 132, 255, 1)';
    ctx2.lineWidth = 1.5;
    [...handles, ...midHandles].forEach(h => {
        ctx2.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        ctx2.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    });
}

// ===== Interactive crop preview drag =====
let cropDragState = null;

function setupCropPreviewDrag() {
    const previewCanvas = document.getElementById('popout-crop-preview');
    if (!previewCanvas) return;

    function getCropCanvasCoords(e) {
        const rect = previewCanvas.getBoundingClientRect();
        const scaleX = previewCanvas.width / rect.width;
        const scaleY = previewCanvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function hitTestCropHandle(coords) {
        const p = getSelectedPopout();
        const screenshot = getCurrentScreenshot();
        if (!p || !screenshot) return null;
        const img = getScreenshotImage(screenshot);
        if (!img) return null;

        const layout = getCropPreviewLayout(previewCanvas, img);
        const { drawX, drawY, drawW, drawH } = layout;
        const rx = drawX + (p.cropX / 100) * drawW;
        const ry = drawY + (p.cropY / 100) * drawH;
        const rw = (p.cropWidth / 100) * drawW;
        const rh = (p.cropHeight / 100) * drawH;

        const hitR = 12; // hit radius
        const tests = [
            { x: rx, y: ry, handle: 'top-left' },
            { x: rx + rw, y: ry, handle: 'top-right' },
            { x: rx, y: ry + rh, handle: 'bottom-left' },
            { x: rx + rw, y: ry + rh, handle: 'bottom-right' },
            { x: rx + rw / 2, y: ry, handle: 'top' },
            { x: rx + rw / 2, y: ry + rh, handle: 'bottom' },
            { x: rx, y: ry + rh / 2, handle: 'left' },
            { x: rx + rw, y: ry + rh / 2, handle: 'right' },
        ];
        for (const t of tests) {
            if (Math.abs(coords.x - t.x) < hitR && Math.abs(coords.y - t.y) < hitR) {
                return t.handle;
            }
        }
        // Check if inside the crop region (move)
        if (coords.x >= rx && coords.x <= rx + rw && coords.y >= ry && coords.y <= ry + rh) {
            return 'move';
        }
        return null;
    }

    function startCropDrag(e) {
        const coords = getCropCanvasCoords(e);
        const handle = hitTestCropHandle(coords);
        if (!handle) return;

        e.preventDefault();
        const p = getSelectedPopout();
        if (!p) return;
        cropDragState = {
            handle,
            startX: coords.x,
            startY: coords.y,
            origCropX: p.cropX,
            origCropY: p.cropY,
            origCropW: p.cropWidth,
            origCropH: p.cropHeight
        };
    }

    function moveCropDrag(e) {
        if (!cropDragState) {
            // Update cursor based on hover
            const coords = getCropCanvasCoords(e);
            const handle = hitTestCropHandle(coords);
            const cursorMap = {
                'top-left': 'nwse-resize', 'bottom-right': 'nwse-resize',
                'top-right': 'nesw-resize', 'bottom-left': 'nesw-resize',
                'top': 'ns-resize', 'bottom': 'ns-resize',
                'left': 'ew-resize', 'right': 'ew-resize',
                'move': 'move'
            };
            previewCanvas.style.cursor = cursorMap[handle] || 'default';
            return;
        }
        e.preventDefault();
        const coords = getCropCanvasCoords(e);
        const p = getSelectedPopout();
        const screenshot = getCurrentScreenshot();
        if (!p || !screenshot) return;
        const img = getScreenshotImage(screenshot);
        if (!img) return;

        const layout = getCropPreviewLayout(previewCanvas, img);
        const { drawW, drawH } = layout;

        // Convert pixel delta to percentage
        const dxPct = ((coords.x - cropDragState.startX) / drawW) * 100;
        const dyPct = ((coords.y - cropDragState.startY) / drawH) * 100;
        const h = cropDragState.handle;
        const orig = cropDragState;

        let newX = orig.origCropX, newY = orig.origCropY;
        let newW = orig.origCropW, newH = orig.origCropH;

        if (h === 'move') {
            newX = Math.max(0, Math.min(100 - newW, orig.origCropX + dxPct));
            newY = Math.max(0, Math.min(100 - newH, orig.origCropY + dyPct));
        } else {
            if (h.includes('left')) { newX = orig.origCropX + dxPct; newW = orig.origCropW - dxPct; }
            if (h.includes('right') || h === 'right') { newW = orig.origCropW + dxPct; }
            if (h.includes('top')) { newY = orig.origCropY + dyPct; newH = orig.origCropH - dyPct; }
            if (h.includes('bottom') || h === 'bottom') { newH = orig.origCropH + dyPct; }

            // Enforce minimums
            if (newW < 5) { if (h.includes('left')) newX = orig.origCropX + orig.origCropW - 5; newW = 5; }
            if (newH < 5) { if (h.includes('top')) newY = orig.origCropY + orig.origCropH - 5; newH = 5; }

            // Clamp to canvas bounds
            newX = Math.max(0, newX);
            newY = Math.max(0, newY);
            if (newX + newW > 100) newW = 100 - newX;
            if (newY + newH > 100) newH = 100 - newY;
        }

        p.cropX = newX;
        p.cropY = newY;
        p.cropWidth = newW;
        p.cropHeight = newH;
        updateCropPreview();
        updatePopoutProperties();
        updateCanvas();
    }

    function endCropDrag() {
        cropDragState = null;
    }

    previewCanvas.addEventListener('mousedown', startCropDrag);
    window.addEventListener('mousemove', moveCropDrag);
    window.addEventListener('mouseup', endCropDrag);
    previewCanvas.addEventListener('touchstart', startCropDrag, { passive: false });
    previewCanvas.addEventListener('touchmove', (e) => { if (cropDragState) moveCropDrag(e); }, { passive: false });
    previewCanvas.addEventListener('touchend', endCropDrag);
}

function setupPopoutEventListeners() {
    // Add Popout button
    const addBtn = document.getElementById('add-popout-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addPopout());
    }

    // Crop sliders
    const bindPopoutSlider = (id, key, suffix) => {
        const input = document.getElementById(id);
        const valueEl = document.getElementById(id + '-value');
        if (!input) return;
        input.addEventListener('input', () => {
            const val = parseFloat(input.value);
            if (valueEl) valueEl.textContent = formatValue(val) + suffix;
            if (selectedPopoutId) setPopoutProperty(selectedPopoutId, key, val);
            if (key.startsWith('crop')) updateCropPreview();
        });
    };

    bindPopoutSlider('popout-crop-x', 'cropX', '%');
    bindPopoutSlider('popout-crop-y', 'cropY', '%');
    bindPopoutSlider('popout-crop-width', 'cropWidth', '%');
    bindPopoutSlider('popout-crop-height', 'cropHeight', '%');
    bindPopoutSlider('popout-x', 'x', '%');
    bindPopoutSlider('popout-y', 'y', '%');
    bindPopoutSlider('popout-width', 'width', '%');
    bindPopoutSlider('popout-rotation', 'rotation', '°');
    bindPopoutSlider('popout-opacity', 'opacity', '%');
    bindPopoutSlider('popout-corner-radius', 'cornerRadius', 'px');

    // Shadow toggle
    const shadowToggle = document.getElementById('popout-shadow-toggle');
    if (shadowToggle) {
        shadowToggle.addEventListener('click', () => {
            const p = getSelectedPopout();
            if (!p) return;
            p.shadow.enabled = !p.shadow.enabled;
            updatePopoutProperties();
            updateCanvas();
        });
    }

    // Shadow properties
    const bindPopoutShadow = (inputId, prop, suffix) => {
        const input = document.getElementById(inputId);
        const valEl = document.getElementById(inputId + '-value');
        if (!input) return;
        input.addEventListener('input', () => {
            const p = getSelectedPopout();
            if (!p) return;
            p.shadow[prop] = parseFloat(input.value);
            if (valEl) valEl.textContent = formatValue(parseFloat(input.value)) + suffix;
            updateCanvas();
        });
    };
    bindPopoutShadow('popout-shadow-blur', 'blur', 'px');
    bindPopoutShadow('popout-shadow-opacity', 'opacity', '%');
    bindPopoutShadow('popout-shadow-x', 'x', 'px');
    bindPopoutShadow('popout-shadow-y', 'y', 'px');

    // Shadow color
    const shadowColor = document.getElementById('popout-shadow-color');
    const shadowColorHex = document.getElementById('popout-shadow-color-hex');
    if (shadowColor) {
        shadowColor.addEventListener('input', () => {
            const p = getSelectedPopout();
            if (p) { p.shadow.color = shadowColor.value; if (shadowColorHex) shadowColorHex.value = shadowColor.value; updateCanvas(); }
        });
    }
    if (shadowColorHex) {
        shadowColorHex.addEventListener('change', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(shadowColorHex.value)) {
                const p = getSelectedPopout();
                if (p) { p.shadow.color = shadowColorHex.value; if (shadowColor) shadowColor.value = shadowColorHex.value; updateCanvas(); }
            }
        });
    }

    // Border toggle
    const borderToggle = document.getElementById('popout-border-toggle');
    if (borderToggle) {
        borderToggle.addEventListener('click', () => {
            const p = getSelectedPopout();
            if (!p) return;
            p.border.enabled = !p.border.enabled;
            updatePopoutProperties();
            updateCanvas();
        });
    }

    // Border properties
    const bindPopoutBorder = (inputId, prop, suffix) => {
        const input = document.getElementById(inputId);
        const valEl = document.getElementById(inputId + '-value');
        if (!input) return;
        input.addEventListener('input', () => {
            const p = getSelectedPopout();
            if (!p) return;
            p.border[prop] = parseFloat(input.value);
            if (valEl) valEl.textContent = formatValue(parseFloat(input.value)) + suffix;
            updateCanvas();
        });
    };
    bindPopoutBorder('popout-border-width', 'width', 'px');
    bindPopoutBorder('popout-border-opacity', 'opacity', '%');

    // Border color
    const borderColor = document.getElementById('popout-border-color');
    const borderColorHex = document.getElementById('popout-border-color-hex');
    if (borderColor) {
        borderColor.addEventListener('input', () => {
            const p = getSelectedPopout();
            if (p) { p.border.color = borderColor.value; if (borderColorHex) borderColorHex.value = borderColor.value; updateCanvas(); }
        });
    }
    if (borderColorHex) {
        borderColorHex.addEventListener('change', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(borderColorHex.value)) {
                const p = getSelectedPopout();
                if (p) { p.border.color = borderColorHex.value; if (borderColor) borderColor.value = borderColorHex.value; updateCanvas(); }
            }
        });
    }

    // Interactive crop preview drag handles
    setupCropPreviewDrag();
}

function setupEventListeners() {
    // Collapsible toggle rows
    document.querySelectorAll('.toggle-row.collapsible').forEach(row => {
        row.addEventListener('click', (e) => {
            // Don't collapse when clicking the toggle switch itself
            if (e.target.closest('.toggle')) return;

            const targetId = row.dataset.target;
            const target = document.getElementById(targetId);
            if (target) {
                row.classList.toggle('collapsed');
                target.style.display = row.classList.contains('collapsed') ? 'none' : 'block';
            }
        });
    });

    // File upload
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // Add screenshots button
    document.getElementById('add-screenshots-btn').addEventListener('click', () => fileInput.click());

    // Add blank screen button
    document.getElementById('add-blank-btn').addEventListener('click', () => {
        createNewScreenshot(null, null, 'Blank Screen', null, state.outputDevice);
        state.selectedIndex = state.screenshots.length - 1;
        updateScreenshotList();
        syncUIWithState();
        updateGradientStopsUI();
        updateCanvas();
    });

    // Make the entire sidebar content area a drop zone
    const sidebarContent = screenshotList.closest('.sidebar-content');
    sidebarContent.addEventListener('dragover', (e) => {
        // Only handle file drops, not internal screenshot reordering
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            sidebarContent.classList.add('drop-active');
        }
    });
    sidebarContent.addEventListener('dragleave', (e) => {
        // Only remove class if leaving the area entirely
        if (!sidebarContent.contains(e.relatedTarget)) {
            sidebarContent.classList.remove('drop-active');
        }
    });
    sidebarContent.addEventListener('drop', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            sidebarContent.classList.remove('drop-active');
            handleFiles(e.dataTransfer.files);
        }
    });

    // Set as Default button (commented out)
    // document.getElementById('set-as-default-btn').addEventListener('click', () => {
    //     if (state.screenshots.length === 0) return;
    //     setCurrentScreenshotAsDefault();
    //     // Show brief confirmation
    //     const btn = document.getElementById('set-as-default-btn');
    //     const originalText = btn.textContent;
    //     btn.textContent = 'Saved!';
    //     btn.style.borderColor = 'var(--accent)';
    //     btn.style.color = 'var(--accent)';
    //     setTimeout(() => {
    //         btn.textContent = originalText;
    //         btn.style.borderColor = '';
    //         btn.style.color = '';
    //     }, 1500);
    // });

    // Project dropdown
    const projectDropdown = document.getElementById('project-dropdown');
    const projectTrigger = document.getElementById('project-trigger');

    projectTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        projectDropdown.classList.toggle('open');
        // Close output size dropdown if open
        document.getElementById('output-size-dropdown').classList.remove('open');
    });

    // Close project dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!projectDropdown.contains(e.target)) {
            projectDropdown.classList.remove('open');
        }
    });

    document.getElementById('new-project-btn').addEventListener('click', () => {
        document.getElementById('project-modal-title').textContent = 'New Project';
        document.getElementById('project-name-input').value = '';
        document.getElementById('project-modal-confirm').textContent = 'Create';
        document.getElementById('project-modal').dataset.mode = 'new';

        const duplicateGroup = document.getElementById('duplicate-from-group');
        const duplicateSelect = document.getElementById('duplicate-from-select');
        if (projects.length > 0) {
            duplicateGroup.style.display = 'block';
            duplicateSelect.innerHTML = '<option value="">None (empty project)</option>';
            projects.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.name + (p.screenshotCount ? ` (${p.screenshotCount} screenshots)` : '');
                duplicateSelect.appendChild(option);
            });
        } else {
            duplicateGroup.style.display = 'none';
        }

        document.getElementById('project-modal').classList.add('visible');
        document.getElementById('project-name-input').focus();
    });

    document.getElementById('export-project-btn').addEventListener('click', () => {
        exportProject();
    });

    document.getElementById('import-project-btn').addEventListener('click', () => {
        importProject();
    });

    projectImportInput?.addEventListener('change', importProjectFromInput);

    document.getElementById('duplicate-from-select').addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
            const selectedProject = projects.find(p => p.id === selectedId);
            if (selectedProject) {
                document.getElementById('project-name-input').value = selectedProject.name + ' (Copy)';
            }
        } else {
            document.getElementById('project-name-input').value = '';
        }
    });

    document.getElementById('rename-project-btn').addEventListener('click', () => {
        const project = projects.find(p => p.id === currentProjectId);
        document.getElementById('project-modal-title').textContent = 'Rename Project';
        document.getElementById('project-name-input').value = project ? project.name : '';
        document.getElementById('project-modal-confirm').textContent = 'Rename';
        document.getElementById('project-modal').dataset.mode = 'rename';
        document.getElementById('duplicate-from-group').style.display = 'none';
        document.getElementById('project-modal').classList.add('visible');
        document.getElementById('project-name-input').focus();
    });

    document.getElementById('delete-project-btn').addEventListener('click', async () => {
        if (projects.length <= 1) {
            await showAppAlert('Cannot delete the only project', 'info');
            return;
        }
        const project = projects.find(p => p.id === currentProjectId);
        document.getElementById('delete-project-message').textContent =
            `Are you sure you want to delete "${project ? project.name : 'this project'}"? This cannot be undone.`;
        document.getElementById('delete-project-modal').classList.add('visible');
    });

    // Project modal buttons
    document.getElementById('project-modal-cancel').addEventListener('click', () => {
        document.getElementById('project-modal').classList.remove('visible');
    });

    document.getElementById('project-modal-confirm').addEventListener('click', async () => {
        const name = document.getElementById('project-name-input').value.trim();
        if (!name) {
            await showAppAlert('Please enter a project name', 'info');
            return;
        }

        const mode = document.getElementById('project-modal').dataset.mode;
        if (mode === 'new') {
            const duplicateFromId = document.getElementById('duplicate-from-select').value;
            if (duplicateFromId) {
                await duplicateProject(duplicateFromId, name);
            } else {
                createProject(name);
            }
        } else if (mode === 'rename') {
            renameProject(name);
        }

        document.getElementById('project-modal').classList.remove('visible');
    });

    document.getElementById('project-name-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('project-modal-confirm').click();
        }
    });

    // Delete project modal buttons
    document.getElementById('delete-project-cancel').addEventListener('click', () => {
        document.getElementById('delete-project-modal').classList.remove('visible');
    });

    document.getElementById('delete-project-confirm').addEventListener('click', () => {
        deleteProject();
        document.getElementById('delete-project-modal').classList.remove('visible');
    });

    // Apply style to all modal buttons
    document.getElementById('apply-style-cancel').addEventListener('click', () => {
        document.getElementById('apply-style-modal').classList.remove('visible');
    });

    document.getElementById('apply-style-confirm').addEventListener('click', () => {
        applyStyleToAll();
        document.getElementById('apply-style-modal').classList.remove('visible');
    });

    // Close modals on overlay click
    document.getElementById('project-modal').addEventListener('click', (e) => {
        if (e.target.id === 'project-modal') {
            document.getElementById('project-modal').classList.remove('visible');
        }
    });

    document.getElementById('delete-project-modal').addEventListener('click', (e) => {
        if (e.target.id === 'delete-project-modal') {
            document.getElementById('delete-project-modal').classList.remove('visible');
        }
    });

    document.getElementById('apply-style-modal').addEventListener('click', (e) => {
        if (e.target.id === 'apply-style-modal') {
            document.getElementById('apply-style-modal').classList.remove('visible');
        }
    });

    // Language picker events
    document.getElementById('language-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const menu = document.getElementById('language-menu');
        menu.classList.toggle('visible');
        if (menu.classList.contains('visible')) {
            // Position menu below button using fixed positioning
            const rect = btn.getBoundingClientRect();
            menu.style.top = (rect.bottom + 4) + 'px';
            menu.style.left = rect.left + 'px';
            updateLanguageMenu();
        }
    });

    // Close language menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.language-picker')) {
            document.getElementById('language-menu').classList.remove('visible');
        }
    });

    // Edit Languages button
    document.getElementById('edit-languages-btn').addEventListener('click', () => {
        openLanguagesModal();
    });

    // Translate All button
    document.getElementById('translate-all-btn').addEventListener('click', () => {
        document.getElementById('language-menu').classList.remove('visible');
        translateAllText();
    });

    // Magical Titles button (in header)
    document.getElementById('magical-titles-btn').addEventListener('click', () => {
        dismissMagicalTitlesTooltip();
        showMagicalTitlesDialog();
    });

    // Magical Titles modal events
    document.getElementById('magical-titles-cancel').addEventListener('click', hideMagicalTitlesDialog);
    document.getElementById('magical-titles-confirm').addEventListener('click', generateMagicalTitles);
    document.getElementById('magical-titles-modal').addEventListener('click', (e) => {
        if (e.target.id === 'magical-titles-modal') hideMagicalTitlesDialog();
    });

    // Languages modal events
    document.getElementById('languages-modal-close').addEventListener('click', closeLanguagesModal);
    document.getElementById('languages-modal-done').addEventListener('click', closeLanguagesModal);
    document.getElementById('languages-modal').addEventListener('click', (e) => {
        if (e.target.id === 'languages-modal') closeLanguagesModal();
    });

    document.getElementById('add-language-select').addEventListener('change', (e) => {
        if (e.target.value) {
            addProjectLanguage(e.target.value);
            e.target.value = '';
        }
    });
    document.getElementById('add-language-mode-select').addEventListener('change', (e) => {
        handleAddLanguageModeChange(e.target.value);
    });
    document.getElementById('add-language-select-all-btn').addEventListener('click', () => {
        selectAllAddLanguageOptions();
    });
    document.getElementById('add-language-apply-btn').addEventListener('click', () => {
        addSelectedProjectLanguages();
    });
    document.getElementById('add-language-all-btn').addEventListener('click', () => {
        addAllProjectLanguages();
    });

    // Screenshot translations modal events
    document.getElementById('screenshot-translations-modal-close').addEventListener('click', closeScreenshotTranslationsModal);
    document.getElementById('screenshot-translations-modal-done').addEventListener('click', closeScreenshotTranslationsModal);
    document.getElementById('screenshot-translations-modal').addEventListener('click', (e) => {
        if (e.target.id === 'screenshot-translations-modal') closeScreenshotTranslationsModal();
    });
    document.getElementById('translation-file-input').addEventListener('change', handleTranslationFileSelect);

    // Export language modal events
    document.getElementById('export-current-only').addEventListener('click', () => {
        closeExportLanguageDialog('current');
    });
    document.getElementById('export-all-languages').addEventListener('click', () => {
        closeExportLanguageDialog('all');
    });
    document.getElementById('export-language-modal-cancel').addEventListener('click', () => {
        closeExportLanguageDialog(null);
    });
    document.getElementById('export-language-modal').addEventListener('click', (e) => {
        if (e.target.id === 'export-language-modal') closeExportLanguageDialog(null);
    });

    // Duplicate screenshot dialog
    initDuplicateDialogListeners();
    document.getElementById('duplicate-screenshot-modal').addEventListener('click', (e) => {
        if (e.target.id === 'duplicate-screenshot-modal') closeDuplicateDialog('ignore');
    });

    // Translate button events
    document.getElementById('translate-headline-btn').addEventListener('click', () => {
        openTranslateModal('headline');
    });

    document.getElementById('translate-subheadline-btn').addEventListener('click', () => {
        openTranslateModal('subheadline');
    });

    document.getElementById('translate-element-btn').addEventListener('click', () => {
        openTranslateModal('element');
    });

    document.getElementById('translate-source-lang').addEventListener('change', (e) => {
        updateTranslateSourcePreview();
    });

    document.getElementById('translate-modal-cancel').addEventListener('click', () => {
        document.getElementById('translate-modal').classList.remove('visible');
    });

    document.getElementById('translate-modal-apply').addEventListener('click', () => {
        applyTranslations();
        document.getElementById('translate-modal').classList.remove('visible');
    });

    document.getElementById('ai-translate-btn').addEventListener('click', () => {
        aiTranslateAll();
    });

    document.getElementById('translate-modal').addEventListener('click', (e) => {
        if (e.target.id === 'translate-modal') {
            document.getElementById('translate-modal').classList.remove('visible');
        }
    });

    // About modal
    document.getElementById('about-btn').addEventListener('click', () => {
        document.getElementById('about-modal').classList.add('visible');
    });

    document.getElementById('about-modal-close').addEventListener('click', () => {
        document.getElementById('about-modal').classList.remove('visible');
    });

    document.getElementById('about-modal').addEventListener('click', (e) => {
        if (e.target.id === 'about-modal') {
            document.getElementById('about-modal').classList.remove('visible');
        }
    });

    // Settings modal
    document.getElementById('settings-btn').addEventListener('click', () => {
        openSettingsModal();
    });

    document.getElementById('settings-modal-close').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('visible');
    });

    document.getElementById('settings-modal-cancel').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('visible');
    });

    document.getElementById('settings-modal-save').addEventListener('click', () => {
        saveSettings();
    });

    // Theme selector buttons
    document.querySelectorAll('#theme-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#theme-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyTheme(btn.dataset.theme);
        });
    });

    // Provider radio buttons
    document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateProviderSection(e.target.value);
        });
    });

    // Show/hide key buttons for all providers
    document.querySelectorAll('.settings-show-key').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (input) {
                input.type = input.type === 'password' ? 'text' : 'password';
            }
        });
    });

    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            document.getElementById('settings-modal').classList.remove('visible');
        }
    });

    // Output size dropdown
    const outputDropdown = document.getElementById('output-size-dropdown');
    const outputTrigger = document.getElementById('output-size-trigger');

    outputTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        outputDropdown.classList.toggle('open');
        // Close project dropdown if open
        document.getElementById('project-dropdown').classList.remove('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!outputDropdown.contains(e.target)) {
            outputDropdown.classList.remove('open');
        }
    });

    // Device option selection
    ensureDevicePrimaryButtons();
    document.querySelectorAll('.output-size-menu .device-option').forEach(opt => {
        const primaryBtn = opt.querySelector('.device-primary-btn');
        if (primaryBtn) {
            primaryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const device = opt.dataset.device;
                const selected = new Set(state.exportDevices || []);
                if (!selected.has(device)) {
                    selected.add(device);
                    state.exportDevices = Array.from(selected);
                }
                state.outputDevice = device;
                syncUIWithState();
                updateCanvas();
            });
        }

        opt.addEventListener('click', (e) => {
            e.stopPropagation();

            const device = opt.dataset.device;
            const selected = new Set(state.exportDevices || []);

            if (selected.has(device)) {
                // Keep at least one platform selected
                if (selected.size > 1) {
                    selected.delete(device);
                }
            } else {
                selected.add(device);
            }

            state.exportDevices = Array.from(selected);
            // Single-click only updates selected export devices.
            // Keep primary unchanged unless it was removed.
            if (!state.exportDevices.includes(state.outputDevice)) {
                state.outputDevice = state.exportDevices[0];
            }

            syncUIWithState();
            updateCanvas();
        });
    });

    // Custom size inputs
    document.getElementById('custom-width').addEventListener('input', (e) => {
        state.customWidth = parseInt(e.target.value) || 1290;
        document.getElementById('output-size-dims').textContent = `${state.customWidth} × ${state.customHeight}`;
        updateCanvas();
    });
    document.getElementById('custom-height').addEventListener('input', (e) => {
        state.customHeight = parseInt(e.target.value) || 2796;
        document.getElementById('output-size-dims').textContent = `${state.customWidth} × ${state.customHeight}`;
        updateCanvas();
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            // Save active tab to localStorage
            localStorage.setItem('activeTab', tab.dataset.tab);
        });
    });

    // Restore active tab from localStorage
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) {
        const tabBtn = document.querySelector(`.tab[data-tab="${savedTab}"]`);
        if (tabBtn) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tabBtn.classList.add('active');
            document.getElementById('tab-' + savedTab).classList.add('active');
        }
    }

    // Background type selector
    document.querySelectorAll('#bg-type-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#bg-type-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setBackground('type', btn.dataset.type);

            document.getElementById('gradient-options').style.display = btn.dataset.type === 'gradient' ? 'block' : 'none';
            document.getElementById('solid-options').style.display = btn.dataset.type === 'solid' ? 'block' : 'none';
            document.getElementById('image-options').style.display = btn.dataset.type === 'image' ? 'block' : 'none';

            updateCanvas();
        });
    });

    // Gradient preset dropdown toggle
    const presetDropdown = document.getElementById('gradient-preset-dropdown');
    const presetTrigger = document.getElementById('gradient-preset-trigger');
    presetTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        presetDropdown.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!presetDropdown.contains(e.target)) {
            presetDropdown.classList.remove('open');
        }
    });

    // Position preset dropdown toggle
    const positionPresetDropdown = document.getElementById('position-preset-dropdown');
    const positionPresetTrigger = document.getElementById('position-preset-trigger');
    positionPresetTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        positionPresetDropdown.classList.toggle('open');
    });

    // Close position preset dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!positionPresetDropdown.contains(e.target)) {
            positionPresetDropdown.classList.remove('open');
        }
    });

    // Close screenshot menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.screenshot-menu-wrapper')) {
            document.querySelectorAll('.screenshot-menu.open').forEach(m => m.classList.remove('open'));
        }
    });

    // Gradient presets
    document.querySelectorAll('.preset-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.preset-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');

            // Parse gradient from preset
            const gradientStr = swatch.dataset.gradient;
            const angleMatch = gradientStr.match(/(\d+)deg/);
            const colorMatches = gradientStr.matchAll(/(#[a-fA-F0-9]{6})\s+(\d+)%/g);

            if (angleMatch) {
                const angle = parseInt(angleMatch[1]);
                setBackground('gradient.angle', angle);
                document.getElementById('gradient-angle').value = angle;
                document.getElementById('gradient-angle-value').textContent = formatValue(angle) + '°';
            }

            const stops = [];
            for (const match of colorMatches) {
                stops.push({ color: match[1], position: parseInt(match[2]) });
            }
            if (stops.length >= 2) {
                setBackground('gradient.stops', stops);
                updateGradientStopsUI();
            }

            updateCanvas();
        });
    });

    // Gradient angle
    document.getElementById('gradient-angle').addEventListener('input', (e) => {
        setBackground('gradient.angle', parseInt(e.target.value));
        document.getElementById('gradient-angle-value').textContent = formatValue(e.target.value) + '°';
        // Deselect preset when manually changing angle
        document.querySelectorAll('.preset-swatch').forEach(s => s.classList.remove('selected'));
        updateCanvas();
    });

    // Add gradient stop
    document.getElementById('add-gradient-stop').addEventListener('click', () => {
        const bg = getBackground();
        const lastStop = bg.gradient.stops[bg.gradient.stops.length - 1];
        bg.gradient.stops.push({
            color: lastStop.color,
            position: Math.min(lastStop.position + 20, 100)
        });
        // Deselect preset when adding a stop
        document.querySelectorAll('.preset-swatch').forEach(s => s.classList.remove('selected'));
        updateGradientStopsUI();
        updateCanvas();
    });

    // Solid color
    document.getElementById('solid-color').addEventListener('input', (e) => {
        setBackground('solid', e.target.value);
        document.getElementById('solid-color-hex').value = e.target.value;
        updateCanvas();
    });
    document.getElementById('solid-color-hex').addEventListener('input', (e) => {
        if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
            setBackground('solid', e.target.value);
            document.getElementById('solid-color').value = e.target.value;
            updateCanvas();
        }
    });

    // Background image
    const bgImageUpload = document.getElementById('bg-image-upload');
    const bgImageInput = document.getElementById('bg-image-input');
    bgImageUpload.addEventListener('click', () => bgImageInput.click());
    bgImageInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    setBackground('image', img);
                    setBackground('imageSrc', event.target.result);
                    document.getElementById('bg-image-preview').src = event.target.result;
                    document.getElementById('bg-image-preview').style.display = 'block';
                    updateCanvas();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    document.getElementById('bg-image-fit').addEventListener('change', (e) => {
        setBackground('imageFit', e.target.value);
        updateCanvas();
    });

    document.getElementById('bg-blur').addEventListener('input', (e) => {
        setBackground('imageBlur', parseInt(e.target.value));
        document.getElementById('bg-blur-value').textContent = formatValue(e.target.value) + 'px';
        updateCanvas();
    });

    document.getElementById('bg-overlay-color').addEventListener('input', (e) => {
        setBackground('overlayColor', e.target.value);
        document.getElementById('bg-overlay-hex').value = e.target.value;
        updateCanvas();
    });

    document.getElementById('bg-overlay-opacity').addEventListener('input', (e) => {
        setBackground('overlayOpacity', parseInt(e.target.value));
        document.getElementById('bg-overlay-opacity-value').textContent = formatValue(e.target.value) + '%';
        updateCanvas();
    });

    // Noise toggle
    document.getElementById('noise-toggle').addEventListener('click', function () {
        this.classList.toggle('active');
        const noiseEnabled = this.classList.contains('active');
        setBackground('noise', noiseEnabled);
        const row = this.closest('.toggle-row');
        if (noiseEnabled) {
            if (row) row.classList.remove('collapsed');
            document.getElementById('noise-options').style.display = 'block';
        } else {
            if (row) row.classList.add('collapsed');
            document.getElementById('noise-options').style.display = 'none';
        }
        updateCanvas();
    });

    document.getElementById('noise-intensity').addEventListener('input', (e) => {
        setBackground('noiseIntensity', parseInt(e.target.value));
        document.getElementById('noise-intensity-value').textContent = formatValue(e.target.value) + '%';
        updateCanvas();
    });

    // Screenshot settings
    document.getElementById('screenshot-scale').addEventListener('input', (e) => {
        setScreenshotSetting('scale', parseInt(e.target.value));
        document.getElementById('screenshot-scale-value').textContent = formatValue(e.target.value) + '%';
        updateCanvas();
    });

    document.getElementById('screenshot-y').addEventListener('input', (e) => {
        setScreenshotSetting('y', parseInt(e.target.value));
        document.getElementById('screenshot-y-value').textContent = formatValue(e.target.value) + '%';
        updateCanvas();
    });

    document.getElementById('screenshot-x').addEventListener('input', (e) => {
        setScreenshotSetting('x', parseInt(e.target.value));
        document.getElementById('screenshot-x-value').textContent = formatValue(e.target.value) + '%';
        updateCanvas();
    });

    document.getElementById('corner-radius').addEventListener('input', (e) => {
        setScreenshotSetting('cornerRadius', parseInt(e.target.value));
        document.getElementById('corner-radius-value').textContent = formatValue(e.target.value) + 'px';
        updateCanvas();
    });

    document.getElementById('screenshot-rotation').addEventListener('input', (e) => {
        setScreenshotSetting('rotation', parseInt(e.target.value));
        document.getElementById('screenshot-rotation-value').textContent = formatValue(e.target.value) + '°';
        updateCanvas();
    });

    // Shadow toggle
    document.getElementById('shadow-toggle').addEventListener('click', function () {
        this.classList.toggle('active');
        const shadowEnabled = this.classList.contains('active');
        setScreenshotSetting('shadow.enabled', shadowEnabled);
        const row = this.closest('.toggle-row');
        if (shadowEnabled) {
            if (row) row.classList.remove('collapsed');
            document.getElementById('shadow-options').style.display = 'block';
        } else {
            if (row) row.classList.add('collapsed');
            document.getElementById('shadow-options').style.display = 'none';
        }
        updateCanvas();
    });

    document.getElementById('shadow-color').addEventListener('input', (e) => {
        setScreenshotSetting('shadow.color', e.target.value);
        document.getElementById('shadow-color-hex').value = e.target.value;
        updateCanvas();
    });

    document.getElementById('shadow-blur').addEventListener('input', (e) => {
        setScreenshotSetting('shadow.blur', parseInt(e.target.value));
        document.getElementById('shadow-blur-value').textContent = formatValue(e.target.value) + 'px';
        updateCanvas();
    });

    document.getElementById('shadow-opacity').addEventListener('input', (e) => {
        setScreenshotSetting('shadow.opacity', parseInt(e.target.value));
        document.getElementById('shadow-opacity-value').textContent = formatValue(e.target.value) + '%';
        updateCanvas();
    });

    document.getElementById('shadow-x').addEventListener('input', (e) => {
        setScreenshotSetting('shadow.x', parseInt(e.target.value));
        document.getElementById('shadow-x-value').textContent = formatValue(e.target.value) + 'px';
        updateCanvas();
    });

    document.getElementById('shadow-y').addEventListener('input', (e) => {
        setScreenshotSetting('shadow.y', parseInt(e.target.value));
        document.getElementById('shadow-y-value').textContent = formatValue(e.target.value) + 'px';
        updateCanvas();
    });

    // Frame toggle
    document.getElementById('frame-toggle').addEventListener('click', function () {
        this.classList.toggle('active');
        const frameEnabled = this.classList.contains('active');
        setScreenshotSetting('frame.enabled', frameEnabled);
        const row = this.closest('.toggle-row');
        if (frameEnabled) {
            if (row) row.classList.remove('collapsed');
            document.getElementById('frame-options').style.display = 'block';
        } else {
            if (row) row.classList.add('collapsed');
            document.getElementById('frame-options').style.display = 'none';
        }
        updateCanvas();
    });

    document.getElementById('frame-color').addEventListener('input', (e) => {
        setScreenshotSetting('frame.color', e.target.value);
        document.getElementById('frame-color-hex').value = e.target.value;
        updateCanvas();
    });

    document.getElementById('frame-color-hex').addEventListener('input', (e) => {
        if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
            setScreenshotSetting('frame.color', e.target.value);
            document.getElementById('frame-color').value = e.target.value;
            updateCanvas();
        }
    });

    document.getElementById('frame-width').addEventListener('input', (e) => {
        setScreenshotSetting('frame.width', parseInt(e.target.value));
        document.getElementById('frame-width-value').textContent = formatValue(e.target.value) + 'px';
        updateCanvas();
    });

    document.getElementById('frame-opacity').addEventListener('input', (e) => {
        setScreenshotSetting('frame.opacity', parseInt(e.target.value));
        document.getElementById('frame-opacity-value').textContent = formatValue(e.target.value) + '%';
        updateCanvas();
    });

    if (window.TextControls?.setupTextPanelControls) {
        window.TextControls.setupTextPanelControls({
            getTextSettings,
            setTextValue,
            setTextLanguageValue,
            updateCanvas,
            formatValue
        });
    }

    // Export buttons
    document.getElementById('export-current').addEventListener('click', exportCurrent);
    document.getElementById('export-all').addEventListener('click', exportAll);

    // Position presets
    document.querySelectorAll('.position-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.position-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyPositionPreset(btn.dataset.preset);
        });
    });

    // Device type selector (2D/3D)
    document.querySelectorAll('#device-type-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#device-type-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const use3D = btn.dataset.type === '3d';
            setScreenshotSetting('use3D', use3D);
            document.getElementById('rotation-3d-options').style.display = use3D ? 'block' : 'none';

            // Hide 2D-only settings in 3D mode, show 3D tip
            document.getElementById('2d-only-settings').style.display = use3D ? 'none' : 'block';
            document.getElementById('position-presets-section').style.display = use3D ? 'none' : 'block';
            document.getElementById('frame-color-section').style.display = use3D ? 'block' : 'none';
            document.getElementById('3d-tip').style.display = use3D ? 'flex' : 'none';

            if (typeof showThreeJS === 'function') {
                showThreeJS(use3D);
            }

            if (use3D && typeof updateScreenTexture === 'function') {
                updateScreenTexture();
            }

            updateCanvas();
        });
    });

    // 3D device model selector
    document.querySelectorAll('#device-3d-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#device-3d-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const device3D = btn.dataset.model;
            setScreenshotSetting('device3D', device3D);

            // Reset frame color to first preset for new device
            const presets = typeof frameColorPresets !== 'undefined' ? frameColorPresets[device3D] : null;
            const defaultColor = presets ? presets[0].id : null;
            setScreenshotSetting('frameColor', defaultColor);
            updateFrameColorSwatches(device3D, defaultColor);

            if (typeof switchPhoneModel === 'function') {
                switchPhoneModel(device3D);
            }

            // Apply default frame color after model switch
            if (defaultColor && typeof setPhoneFrameColor === 'function') {
                setTimeout(() => setPhoneFrameColor(defaultColor, device3D), 100);
            }

            updateCanvas();
        });
    });

    // 3D rotation controls
    document.getElementById('rotation-3d-x').addEventListener('input', (e) => {
        const ss = getScreenshotSettings();
        if (!ss.rotation3D) ss.rotation3D = { x: 0, y: 0, z: 0 };
        ss.rotation3D.x = parseInt(e.target.value);
        document.getElementById('rotation-3d-x-value').textContent = formatValue(e.target.value) + '°';
        if (typeof setThreeJSRotation === 'function') {
            setThreeJSRotation(ss.rotation3D.x, ss.rotation3D.y, ss.rotation3D.z);
        }
        updateCanvas(); // Keep export canvas in sync
    });

    document.getElementById('rotation-3d-y').addEventListener('input', (e) => {
        const ss = getScreenshotSettings();
        if (!ss.rotation3D) ss.rotation3D = { x: 0, y: 0, z: 0 };
        ss.rotation3D.y = parseInt(e.target.value);
        document.getElementById('rotation-3d-y-value').textContent = formatValue(e.target.value) + '°';
        if (typeof setThreeJSRotation === 'function') {
            setThreeJSRotation(ss.rotation3D.x, ss.rotation3D.y, ss.rotation3D.z);
        }
        updateCanvas(); // Keep export canvas in sync
    });

    document.getElementById('rotation-3d-z').addEventListener('input', (e) => {
        const ss = getScreenshotSettings();
        if (!ss.rotation3D) ss.rotation3D = { x: 0, y: 0, z: 0 };
        ss.rotation3D.z = parseInt(e.target.value);
        document.getElementById('rotation-3d-z-value').textContent = formatValue(e.target.value) + '°';
        if (typeof setThreeJSRotation === 'function') {
            setThreeJSRotation(ss.rotation3D.x, ss.rotation3D.y, ss.rotation3D.z);
        }
        updateCanvas(); // Keep export canvas in sync
    });
}

// Per-screenshot mode is now always active (all settings are per-screenshot)
function isPerScreenshotTextMode() {
    return true;
}

// Settings modal functions
// LLM configuration is in llm.js (llmProviders, getSelectedModel, getSelectedProvider)

// Theme management
function applyTheme(preference) {
    if (preference === 'light' || preference === 'dark') {
        document.documentElement.dataset.theme = preference;
    } else {
        delete document.documentElement.dataset.theme;
    }
}

function initTheme() {
    const saved = localStorage.getItem('themePreference') || 'auto';
    applyTheme(saved);
}

// Apply theme immediately (before async init)
initTheme();

function openSettingsModal() {
    // Load saved provider
    const savedProvider = getSelectedProvider();
    document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
        radio.checked = radio.value === savedProvider;
    });

    // Show the correct API section
    updateProviderSection(savedProvider);

    // Load all saved API keys and models
    Object.entries(llmProviders).forEach(([provider, config]) => {
        const savedKey = localStorage.getItem(config.storageKey);
        const input = document.getElementById(`settings-api-key-${provider}`);
        if (input) {
            input.value = savedKey || '';
            input.type = 'password';
        }

        const status = document.getElementById(`settings-key-status-${provider}`);
        if (status) {
            if (savedKey) {
                status.textContent = '✓ API key is saved';
                status.className = 'settings-key-status success';
            } else {
                status.textContent = '';
                status.className = 'settings-key-status';
            }
        }

        // Populate and load saved model selection
        const modelSelect = document.getElementById(`settings-model-${provider}`);
        if (modelSelect) {
            // Populate options from llm.js config
            modelSelect.innerHTML = generateModelOptions(provider);
            // Set saved value
            const savedModel = localStorage.getItem(config.modelStorageKey) || config.defaultModel;
            modelSelect.value = savedModel;
        }
    });

    // Load saved theme preference
    const savedTheme = localStorage.getItem('themePreference') || 'auto';
    document.querySelectorAll('#theme-selector button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === savedTheme);
    });

    document.getElementById('settings-modal').classList.add('visible');
}

function updateProviderSection(provider) {
    document.querySelectorAll('.settings-api-section').forEach(section => {
        section.style.display = section.dataset.provider === provider ? 'block' : 'none';
    });
}

function saveSettings() {
    // Save theme preference
    const activeThemeBtn = document.querySelector('#theme-selector button.active');
    const themePreference = activeThemeBtn ? activeThemeBtn.dataset.theme : 'auto';
    localStorage.setItem('themePreference', themePreference);
    applyTheme(themePreference);

    // Save selected provider
    const selectedProvider = document.querySelector('input[name="ai-provider"]:checked').value;
    localStorage.setItem('aiProvider', selectedProvider);

    // Save all API keys and models
    let allValid = true;
    Object.entries(llmProviders).forEach(([provider, config]) => {
        const input = document.getElementById(`settings-api-key-${provider}`);
        const status = document.getElementById(`settings-key-status-${provider}`);
        if (!input || !status) return;

        const key = input.value.trim();

        if (key) {
            // Validate key format
            if (key.startsWith(config.keyPrefix)) {
                localStorage.setItem(config.storageKey, key);
                status.textContent = '✓ API key saved';
                status.className = 'settings-key-status success';
            } else {
                status.textContent = `Invalid format. Should start with ${config.keyPrefix}...`;
                status.className = 'settings-key-status error';
                if (provider === selectedProvider) allValid = false;
            }
        } else {
            localStorage.removeItem(config.storageKey);
            status.textContent = '';
            status.className = 'settings-key-status';
        }

        // Save model selection
        const modelSelect = document.getElementById(`settings-model-${provider}`);
        if (modelSelect) {
            localStorage.setItem(config.modelStorageKey, modelSelect.value);
        }
    });

    if (allValid) {
        setTimeout(() => {
            document.getElementById('settings-modal').classList.remove('visible');
        }, 500);
    }
}

// Helper function to set text value for current screenshot
function setTextValue(key, value) {
    textApi.setTextValue(key, value);
}

function setTextLanguageValue(key, value, lang = null) {
    textApi.setTextLanguageValue(key, value, lang);
}

// Helper function to get text settings for current screenshot
function getTextSettings() {
    return textApi.getTextSettings();
}

// Load text UI from current screenshot's settings
function loadTextUIFromScreenshot() {
    textApi.loadTextUIFromScreenshot();
}

// Load text UI from default settings
function loadTextUIFromGlobal() {
    textApi.loadTextUIFromGlobal();
}

// Update all text UI elements
function updateTextUI(text) {
    textApi.updateTextUI(text);
}

function applyPositionPreset(preset) {
    const presets = {
        'centered': { scale: 70, x: 50, y: 50, rotation: 0, perspective: 0 },
        'bleed-bottom': { scale: 85, x: 50, y: 120, rotation: 0, perspective: 0 },
        'bleed-top': { scale: 85, x: 50, y: -20, rotation: 0, perspective: 0 },
        'float-center': { scale: 60, x: 50, y: 50, rotation: 0, perspective: 0 },
        'tilt-left': { scale: 65, x: 50, y: 60, rotation: -8, perspective: 0 },
        'tilt-right': { scale: 65, x: 50, y: 60, rotation: 8, perspective: 0 },
        'perspective': { scale: 65, x: 50, y: 50, rotation: 0, perspective: 15 },
        'float-bottom': { scale: 55, x: 50, y: 70, rotation: 0, perspective: 0 }
    };

    const p = presets[preset];
    if (!p) return;

    setScreenshotSetting('scale', p.scale);
    setScreenshotSetting('x', p.x);
    setScreenshotSetting('y', p.y);
    setScreenshotSetting('rotation', p.rotation);
    setScreenshotSetting('perspective', p.perspective);

    // Update UI controls
    document.getElementById('screenshot-scale').value = p.scale;
    document.getElementById('screenshot-scale-value').textContent = formatValue(p.scale) + '%';
    document.getElementById('screenshot-x').value = p.x;
    document.getElementById('screenshot-x-value').textContent = formatValue(p.x) + '%';
    document.getElementById('screenshot-y').value = p.y;
    document.getElementById('screenshot-y-value').textContent = formatValue(p.y) + '%';
    document.getElementById('screenshot-rotation').value = p.rotation;
    document.getElementById('screenshot-rotation-value').textContent = formatValue(p.rotation) + '°';

    updateCanvas();
}

function handleFiles(files) {
    // Process files sequentially to handle duplicates one at a time
    processFilesSequentially(Array.from(files).filter(f => f.type.startsWith('image/')));
}

// Handle files from desktop app (receives array of {dataUrl, name})
function handleFilesFromDesktop(filesData) {
    processDesktopFilesSequentially(filesData);
}

async function processDesktopFilesSequentially(filesData) {
    for (const fileData of filesData) {
        await processDesktopImageFile(fileData);
    }
}

const TAURI_IMPORT_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

function getPathBasename(filePath) {
    return String(filePath || '').split(/[\\/]/).pop() || '';
}

function joinFsPath(parent, child) {
    const useBackslash = String(parent).includes('\\');
    const sep = useBackslash ? '\\' : '/';
    const cleanParent = String(parent || '').replace(/[\\/]+$/, '');
    const cleanChild = String(child || '').replace(/^[\\/]+/, '').replace(/[\\/]+/g, sep);
    return `${cleanParent}${sep}${cleanChild}`;
}

function isImageFilePath(filePath) {
    const name = getPathBasename(filePath);
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    return TAURI_IMPORT_IMAGE_EXTENSIONS.has(ext);
}

function normalizeReadDirEntry(entry, parentPath) {
    if (typeof entry === 'string') {
        return {
            path: entry,
            name: getPathBasename(entry),
            isDirectory: false
        };
    }

    const name = entry?.name || '';
    const path = entry?.path || joinFsPath(parentPath, name);
    const isDirectory = entry?.isDirectory === true
        || entry?.is_file === false
        || Array.isArray(entry?.children);

    return {
        path,
        name: name || getPathBasename(path),
        isDirectory
    };
}

async function collectImageFilePathsRecursively(rootPath) {
    const queue = [rootPath];
    const imagePaths = [];

    while (queue.length > 0) {
        const currentPath = queue.shift();
        let entries = [];
        try {
            entries = await window.__TAURI__.fs.readDir(currentPath);
        } catch (err) {
            console.warn('Failed to read directory while importing screenshots:', currentPath, err);
            continue;
        }

        for (const rawEntry of entries) {
            const entry = normalizeReadDirEntry(rawEntry, currentPath);
            if (!entry.path) continue;

            if (entry.isDirectory) {
                queue.push(entry.path);
                continue;
            }

            if (isImageFilePath(entry.path)) {
                imagePaths.push(entry.path);
            }
        }
    }

    imagePaths.sort((a, b) => a.localeCompare(b));
    return imagePaths;
}

// Import screenshots via Tauri native file dialog
async function importScreenshotsFromTauri() {
    if (!window.__TAURI__) return;
    try {
        const selected = await window.__TAURI__.dialog.open({
            directory: true,
            multiple: false
        });
        if (!selected) return;

        const selectedDir = Array.isArray(selected) ? selected[0] : selected;
        if (!selectedDir) return;

        const imagePaths = await collectImageFilePathsRecursively(selectedDir);
        if (imagePaths.length === 0) {
            await showAppAlert('No image files found in the selected folder.', 'info');
            return;
        }

        for (const filePath of imagePaths) {
            const bytes = await window.__TAURI__.fs.readFile(filePath);
            const blob = new Blob([bytes]);
            const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            const name = getPathBasename(filePath);
            await handleFilesFromDesktop([{ dataUrl, name }]);
        }
    } catch (err) {
        console.error('Tauri import error:', err);
    }
}

async function processDesktopImageFile(fileData) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
            // Detect device type based on aspect ratio
            const ratio = img.width / img.height;
            let deviceType = 'iPhone';
            if (ratio > 0.6) {
                deviceType = 'iPad';
            }

            // Detect language from filename
            const detectedLang = detectLanguageFromFilename(fileData.name);

            // Check if this is a localized version of an existing screenshot
            const existingIndex = findScreenshotByBaseFilename(fileData.name);

            if (existingIndex !== -1) {
                // Found a screenshot with matching base filename
                const existingScreenshot = state.screenshots[existingIndex];
                const hasExistingLangImage = existingScreenshot.localizedImages?.[detectedLang]?.image;

                if (hasExistingLangImage) {
                    // There's already an image for this language - show dialog
                    const choice = await showDuplicateDialog({
                        existingIndex: existingIndex,
                        detectedLang: detectedLang,
                        newImage: img,
                        newSrc: fileData.dataUrl,
                        newName: fileData.name
                    });

                    if (choice === 'replace') {
                        addLocalizedImage(existingIndex, detectedLang, img, fileData.dataUrl, fileData.name);
                    } else if (choice === 'create') {
                        createNewScreenshot(img, fileData.dataUrl, fileData.name, detectedLang, deviceType);
                    }
                } else {
                    // No image for this language yet - just add it silently
                    addLocalizedImage(existingIndex, detectedLang, img, fileData.dataUrl, fileData.name);
                }
            } else {
                createNewScreenshot(img, fileData.dataUrl, fileData.name, detectedLang, deviceType);
            }

            // Update 3D texture if in 3D mode
            const ss = getScreenshotSettings();
            if (ss.use3D && typeof updateScreenTexture === 'function') {
                updateScreenTexture();
            }
            updateCanvas();
            resolve();
        };
        img.src = fileData.dataUrl;
    });
}

async function processFilesSequentially(files) {
    for (const file of files) {
        await processImageFile(file);
    }
}

async function processImageFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                // Detect device type based on aspect ratio
                const ratio = img.width / img.height;
                let deviceType = 'iPhone';
                if (ratio > 0.6) {
                    deviceType = 'iPad';
                }

                // Detect language from filename
                const detectedLang = detectLanguageFromFilename(file.name);

                // Check if this is a localized version of an existing screenshot
                const existingIndex = findScreenshotByBaseFilename(file.name);

                if (existingIndex !== -1) {
                    // Found a screenshot with matching base filename
                    const existingScreenshot = state.screenshots[existingIndex];
                    const hasExistingLangImage = existingScreenshot.localizedImages?.[detectedLang]?.image;

                    if (hasExistingLangImage) {
                        // There's already an image for this language - show dialog
                        const choice = await showDuplicateDialog({
                            existingIndex: existingIndex,
                            detectedLang: detectedLang,
                            newImage: img,
                            newSrc: e.target.result,
                            newName: file.name
                        });

                        if (choice === 'replace') {
                            addLocalizedImage(existingIndex, detectedLang, img, e.target.result, file.name);
                        } else if (choice === 'create') {
                            createNewScreenshot(img, e.target.result, file.name, detectedLang, deviceType);
                        }
                        // 'ignore' does nothing
                    } else {
                        // No image for this language yet - just add it silently
                        addLocalizedImage(existingIndex, detectedLang, img, e.target.result, file.name);
                    }
                } else {
                    // No duplicate - create new screenshot
                    createNewScreenshot(img, e.target.result, file.name, detectedLang, deviceType);
                }

                // Update 3D texture if in 3D mode
                const ss = getScreenshotSettings();
                if (ss.use3D && typeof updateScreenTexture === 'function') {
                    updateScreenTexture();
                }
                updateCanvas();
                resolve();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function createNewScreenshot(img, src, name, lang, deviceType) {
    const localizedImages = {};
    if (img && src) {
        localizedImages[lang || 'en'] = {
            image: img,
            src: src,
            name: name
        };
    }

    // Auto-add language to project if not already present
    if (lang && !state.projectLanguages.includes(lang)) {
        addProjectLanguage(lang);
    }

    const textDefaults = normalizeTextSettings(state.defaults.text);
    state.defaults.text = textDefaults;

    // Each screenshot gets its own copy of all settings from defaults
    state.screenshots.push({
        image: img || null, // Keep for legacy compatibility
        name: name || 'Blank Screen',
        exportName: '',
        deviceType: deviceType,
        localizedImages: localizedImages,
        background: hydrateBackground(JSON.parse(JSON.stringify(state.defaults.background))),
        screenshot: JSON.parse(JSON.stringify(state.defaults.screenshot)),
        text: JSON.parse(JSON.stringify(textDefaults)),
        elements: JSON.parse(JSON.stringify(state.defaults.elements || [])),
        popouts: [],
        deviceOverrides: {},
        // Legacy overrides for backwards compatibility
        overrides: {}
    });

    updateScreenshotList();
    if (state.screenshots.length === 1) {
        state.selectedIndex = 0;
        // Show Magical Titles tooltip hint for first screenshot
        setTimeout(() => showMagicalTitlesTooltip(), 500);
    }
}

let draggedScreenshotIndex = null;

function updateScreenshotList() {
    screenshotList.innerHTML = '';
    const isEmpty = state.screenshots.length === 0;
    noScreenshot.style.display = isEmpty ? 'block' : 'none';

    // Disable right sidebar and export buttons when no screenshots
    const rightSidebar = document.querySelector('.sidebar-right');
    if (rightSidebar) rightSidebar.classList.toggle('disabled', isEmpty);
    const exportCurrent = document.getElementById('export-current');
    const exportAll = document.getElementById('export-all');
    if (exportCurrent) { exportCurrent.disabled = isEmpty; exportCurrent.style.opacity = isEmpty ? '0.4' : ''; exportCurrent.style.pointerEvents = isEmpty ? 'none' : ''; }
    if (exportAll) { exportAll.disabled = isEmpty; exportAll.style.opacity = isEmpty ? '0.4' : ''; exportAll.style.pointerEvents = isEmpty ? 'none' : ''; }

    // Show transfer mode hint if active
    if (state.transferTarget !== null && state.screenshots.length > 1) {
        const hint = document.createElement('div');
        hint.className = 'transfer-hint';
        hint.innerHTML = `
            <span>Select a screenshot to copy style from</span>
            <button class="transfer-cancel" onclick="cancelTransfer()">Cancel</button>
        `;
        screenshotList.appendChild(hint);
    }

    state.screenshots.forEach((screenshot, index) => {
        const item = document.createElement('div');
        const isTransferTarget = state.transferTarget === index;
        const isTransferMode = state.transferTarget !== null;
        item.className = 'screenshot-item' +
            (index === state.selectedIndex ? ' selected' : '') +
            (isTransferTarget ? ' transfer-target' : '') +
            (isTransferMode && !isTransferTarget ? ' transfer-source-option' : '');

        // Enable drag and drop (disabled in transfer mode)
        if (!isTransferMode) {
            item.draggable = true;
            item.dataset.index = index;
        }

        // Show different UI in transfer mode
        const buttonsHtml = isTransferMode ? '' : `
            <div class="screenshot-menu-wrapper">
                <button class="screenshot-menu-btn" data-index="${index}" title="More options">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="12" cy="19" r="2"/>
                    </svg>
                </button>
                <div class="screenshot-menu" data-index="${index}">
                    <button class="screenshot-menu-item screenshot-translations" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2v3M22 22l-5-10-5 10M14 18h6"/>
                        </svg>
                        Manage Translations...
                    </button>
                    <button class="screenshot-menu-item screenshot-replace" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        Replace Screenshot...
                    </button>
                    <button class="screenshot-menu-item screenshot-transfer" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy style from...
                    </button>
                    <button class="screenshot-menu-item screenshot-apply-all" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            <path d="M14 14l2 2 4-4"/>
                        </svg>
                        Apply style to all...
                    </button>
                    <button class="screenshot-menu-item screenshot-rename-export" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 20h9"/>
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                        </svg>
                        Set Export Name...
                    </button>
                    <button class="screenshot-menu-item screenshot-duplicate" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Duplicate
                    </button>
                    <button class="screenshot-menu-item screenshot-delete danger" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                        Remove
                    </button>
                </div>
            </div>
        `;

        // Get localized thumbnail image
        const thumbImg = getScreenshotImage(screenshot);
        const thumbSrc = thumbImg?.src || '';
        const isBlank = !thumbSrc;

        // Build language flags indicator
        const availableLangs = getAvailableLanguagesForScreenshot(screenshot);
        const isComplete = isScreenshotComplete(screenshot);
        let langFlagsHtml = '';
        if (state.projectLanguages.length > 1) {
            const flags = availableLangs.map(lang => languageFlags[lang] || '🏳️').join('');
            const checkmark = isComplete ? '<span class="screenshot-complete">✓</span>' : '';
            langFlagsHtml = `<span class="screenshot-lang-flags">${flags}${checkmark}</span>`;
        }

        const thumbHtml = isBlank
            ? `<div class="screenshot-thumb blank-thumb">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
              </div>`
            : `<img class="screenshot-thumb" src="${thumbSrc}" alt="${screenshot.name}">`;
        const screenshotNameDisplay = (screenshot.exportName || '').trim() || 'appscreen';

        item.innerHTML = `
            <div class="drag-handle">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/>
                    <circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>
                    <circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>
                </svg>
            </div>
            ${thumbHtml}
            <div class="screenshot-info">
                <div class="screenshot-name">${screenshotNameDisplay}</div>
                <div class="screenshot-device">${isTransferTarget ? 'Click source to copy style' : screenshot.deviceType}${langFlagsHtml}</div>
            </div>
            ${buttonsHtml}
        `;

        const nameEl = item.querySelector('.screenshot-name');
        if (nameEl) {
            nameEl.title = '双击修改导出名称';
            nameEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                startInlineExportNameEdit(index, item, nameEl);
            });
        }

        // Drag and drop handlers
        item.addEventListener('dragstart', (e) => {
            draggedScreenshotIndex = index;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedScreenshotIndex = null;
            // Remove all drag-over states
            document.querySelectorAll('.screenshot-item.drag-insert-after, .screenshot-item.drag-insert-before').forEach(el => {
                el.classList.remove('drag-insert-after', 'drag-insert-before');
            });
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedScreenshotIndex !== null && draggedScreenshotIndex !== index) {
                // Determine if cursor is in top or bottom half
                const rect = item.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                const isAbove = e.clientY < midpoint;

                // Clear all indicators first
                document.querySelectorAll('.screenshot-item.drag-insert-after, .screenshot-item.drag-insert-before').forEach(el => {
                    el.classList.remove('drag-insert-after', 'drag-insert-before');
                });

                // Show line on the item AFTER which the drop will occur
                if (isAbove && index === 0) {
                    // Dropping before the first item - show line above it
                    item.classList.add('drag-insert-before');
                } else if (isAbove && index > 0) {
                    // Dropping before this item = after the previous item
                    const items = screenshotList.querySelectorAll('.screenshot-item');
                    const prevItem = items[index - 1];
                    if (prevItem && !prevItem.classList.contains('dragging')) {
                        prevItem.classList.add('drag-insert-after');
                    }
                } else if (!isAbove) {
                    // Dropping after this item
                    item.classList.add('drag-insert-after');
                }
            }
        });

        item.addEventListener('dragleave', () => {
            // Don't remove here - let dragover on other items handle it
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();

            // Determine drop position based on cursor
            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const dropAbove = e.clientY < midpoint;

            document.querySelectorAll('.screenshot-item.drag-insert-after, .screenshot-item.drag-insert-before').forEach(el => {
                el.classList.remove('drag-insert-after', 'drag-insert-before');
            });

            if (draggedScreenshotIndex !== null && draggedScreenshotIndex !== index) {
                // Calculate target index based on drop position
                let targetIndex = dropAbove ? index : index + 1;

                // Adjust if dragging from before the target
                if (draggedScreenshotIndex < targetIndex) {
                    targetIndex--;
                }

                // Reorder screenshots
                const draggedItem = state.screenshots[draggedScreenshotIndex];
                state.screenshots.splice(draggedScreenshotIndex, 1);
                state.screenshots.splice(targetIndex, 0, draggedItem);

                // Update selected index to follow the selected item
                if (state.selectedIndex === draggedScreenshotIndex) {
                    state.selectedIndex = targetIndex;
                } else if (draggedScreenshotIndex < state.selectedIndex && targetIndex >= state.selectedIndex) {
                    state.selectedIndex--;
                } else if (draggedScreenshotIndex > state.selectedIndex && targetIndex <= state.selectedIndex) {
                    state.selectedIndex++;
                }

                updateScreenshotList();
                updateCanvas();
            }
        });

        item.addEventListener('click', (e) => {
            if (e.target.closest('.screenshot-menu-wrapper') || e.target.closest('.drag-handle')) {
                return;
            }

            // Handle transfer mode click
            if (state.transferTarget !== null) {
                if (index !== state.transferTarget) {
                    // Transfer style from clicked screenshot to target
                    transferStyle(index, state.transferTarget);
                }
                return;
            }

            // Normal selection
            if (state.selectedIndex !== index) {
                state.selectedIndex = index;
                updateScreenshotList();
                // Sync all UI with current screenshot's settings
                syncUIWithState();
                updateGradientStopsUI();
                // Update 3D texture if in 3D mode
                const ss = getScreenshotSettings();
                if (ss.use3D && typeof updateScreenTexture === 'function') {
                    updateScreenTexture();
                }
                updateCanvas();
            }
        });

        // Menu button handler
        const menuBtn = item.querySelector('.screenshot-menu-btn');
        const menu = item.querySelector('.screenshot-menu');
        if (menuBtn && menu) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close all other menus first
                document.querySelectorAll('.screenshot-menu.open').forEach(m => {
                    if (m !== menu) m.classList.remove('open');
                });
                menu.classList.toggle('open');
            });
        }

        // Manage Translations button handler
        const translationsBtn = item.querySelector('.screenshot-translations');
        if (translationsBtn) {
            translationsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu?.classList.remove('open');
                openScreenshotTranslationsModal(index);
            });
        }

        // Replace button handler
        const replaceBtn = item.querySelector('.screenshot-replace');
        if (replaceBtn) {
            replaceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu?.classList.remove('open');
                replaceScreenshot(index);
            });
        }

        // Transfer button handler
        const transferBtn = item.querySelector('.screenshot-transfer');
        if (transferBtn) {
            transferBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu?.classList.remove('open');
                state.transferTarget = index;
                updateScreenshotList();
            });
        }

        // Apply style to all button handler
        const applyAllBtn = item.querySelector('.screenshot-apply-all');
        if (applyAllBtn) {
            applyAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu?.classList.remove('open');
                showApplyStyleModal(index);
            });
        }

        const renameExportBtn = item.querySelector('.screenshot-rename-export');
        if (renameExportBtn) {
            renameExportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu?.classList.remove('open');
                setScreenshotExportName(index);
            });
        }

        const duplicateBtn = item.querySelector('.screenshot-duplicate');
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu?.classList.remove('open');
                duplicateScreenshot(index);
            });
        }

        // Delete button handler
        const deleteBtn = item.querySelector('.screenshot-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu?.classList.remove('open');
                state.screenshots.splice(index, 1);
                if (state.selectedIndex >= state.screenshots.length) {
                    state.selectedIndex = Math.max(0, state.screenshots.length - 1);
                }
                updateScreenshotList();
                syncUIWithState();
                updateGradientStopsUI();
                updateCanvas();
            });
        }

        screenshotList.appendChild(item);
    });

    // Hide add buttons during transfer mode
    const addButtonsContainer = document.querySelector('.sidebar-add-buttons');
    if (addButtonsContainer) {
        addButtonsContainer.style.display = state.transferTarget === null ? '' : 'none';
    }

    // Update project selector to reflect current screenshot count
    updateProjectSelector();
}

function cancelTransfer() {
    state.transferTarget = null;
    updateScreenshotList();
}

function transferStyle(sourceIndex, targetIndex) {
    const source = state.screenshots[sourceIndex];
    const target = state.screenshots[targetIndex];

    if (!source || !target) {
        state.transferTarget = null;
        updateScreenshotList();
        return;
    }

    // Deep copy background settings (including per-device overrides)
    target.background = hydrateBackground(JSON.parse(JSON.stringify(source.background)));
    target.deviceOverrides = hydrateDeviceOverrides(serializeDeviceOverrides(source.deviceOverrides));

    // Deep copy screenshot settings
    target.screenshot = JSON.parse(JSON.stringify(source.screenshot));

    // Copy text styling but preserve actual text content
    const targetHeadlines = target.text.headlines;
    const targetSubheadlines = target.text.subheadlines;
    target.text = JSON.parse(JSON.stringify(source.text));
    // Restore original text content
    target.text.headlines = targetHeadlines;
    target.text.subheadlines = targetSubheadlines;

    // Deep copy elements (reconstruct Image objects for graphics and icons)
    target.elements = (source.elements || []).map(el => {
        const copy = JSON.parse(JSON.stringify({ ...el, image: undefined }));
        if (el.type === 'graphic' && el.image) {
            copy.image = el.image;
        } else if (el.type === 'icon' && el.image) {
            copy.image = el.image;
        }
        copy.id = crypto.randomUUID();
        return copy;
    });

    // Explicitly skip popouts — crop regions are specific to each screenshot's source image

    // Reset transfer mode
    state.transferTarget = null;

    // Update UI
    updateScreenshotList();
    syncUIWithState();
    updateGradientStopsUI();
    updateCanvas();
}

// Track which screenshot to apply style from
let applyStyleSourceIndex = null;

function showApplyStyleModal(sourceIndex) {
    applyStyleSourceIndex = sourceIndex;
    document.getElementById('apply-style-modal').classList.add('visible');
}

function applyStyleToAll() {
    if (applyStyleSourceIndex === null) return;

    const source = state.screenshots[applyStyleSourceIndex];
    if (!source) {
        applyStyleSourceIndex = null;
        return;
    }

    // Apply style to all other screenshots
    state.screenshots.forEach((target, index) => {
        if (index === applyStyleSourceIndex) return; // Skip source

        // Deep copy background settings (including per-device overrides)
        target.background = hydrateBackground(JSON.parse(JSON.stringify(source.background)));
        target.deviceOverrides = hydrateDeviceOverrides(serializeDeviceOverrides(source.deviceOverrides));

        // Deep copy screenshot settings
        target.screenshot = JSON.parse(JSON.stringify(source.screenshot));

        // Copy text styling but preserve actual text content
        const targetHeadlines = target.text.headlines;
        const targetSubheadlines = target.text.subheadlines;
        target.text = JSON.parse(JSON.stringify(source.text));
        // Restore original text content
        target.text.headlines = targetHeadlines;
        target.text.subheadlines = targetSubheadlines;

        // Deep copy elements
        target.elements = (source.elements || []).map(el => {
            const copy = JSON.parse(JSON.stringify({ ...el, image: undefined }));
            if (el.type === 'graphic' && el.image) {
                copy.image = el.image;
            }
            copy.id = crypto.randomUUID();
            return copy;
        });

        // Explicitly skip popouts — crop regions are specific to each screenshot's source image
    });

    applyStyleSourceIndex = null;

    // Update UI
    updateScreenshotList();
    syncUIWithState();
    updateGradientStopsUI();
    updateCanvas();
}

// Replace screenshot image via file picker
function replaceScreenshot(index) {
    const screenshot = state.screenshots[index];
    if (!screenshot) return;

    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            document.body.removeChild(fileInput);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Get the current language
                const lang = state.currentLanguage;

                // Update image for current language and current output device
                const localizedImages = getLocalizedImagesForDevice(screenshot, state.outputDevice, true);
                localizedImages[lang] = {
                    image: img,
                    src: event.target.result,
                    name: file.name
                };

                // Keep legacy image field in sync only for fallback iPhone device
                if (isFallbackDevice(state.outputDevice)) {
                    screenshot.image = img;
                }

                // Update displays
                updateScreenshotList();
                updateCanvas();
                saveState();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);

        document.body.removeChild(fileInput);
    });

    // Trigger file dialog
    fileInput.click();
}

function setScreenshotExportName(index) {
    const screenshot = state.screenshots[index];
    if (!screenshot) return;

    const current = (screenshot.exportName || '').trim();
    const next = window.prompt(
        'Set export name for this cover. Leave empty to use default "appscreen".',
        current
    );

    if (next === null) return;

    screenshot.exportName = next.trim();
    updateScreenshotList();
    saveState();
}

function startInlineExportNameEdit(index, item, nameEl) {
    const screenshot = state.screenshots[index];
    if (!screenshot || !item || !nameEl) return;
    if (item.dataset.renaming === '1') return;

    item.dataset.renaming = '1';
    const current = (screenshot.exportName || '').trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'screenshot-name-input';
    input.placeholder = '默认: appscreen';
    input.value = current;

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let finalized = false;
    const finalize = (save) => {
        if (finalized) return;
        finalized = true;
        item.dataset.renaming = '0';
        if (save) {
            screenshot.exportName = input.value.trim();
            saveState();
        }
        updateScreenshotList();
    };

    ['mousedown', 'click', 'dblclick'].forEach((evt) => {
        input.addEventListener(evt, (e) => e.stopPropagation());
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finalize(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finalize(false);
        }
    });

    input.addEventListener('blur', () => finalize(true));
}

function updateGradientStopsUI() {
    const container = document.getElementById('gradient-stops');
    container.innerHTML = '';

    const bg = getBackground();
    bg.gradient.stops.forEach((stop, index) => {
        const div = document.createElement('div');
        div.className = 'gradient-stop';
        div.innerHTML = `
            <input type="color" value="${stop.color}" data-stop="${index}">
            <input type="number" value="${stop.position}" min="0" max="100" data-stop="${index}">
            <span>%</span>
            ${index > 1 ? `<button class="screenshot-delete" data-stop="${index}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>` : ''}
        `;

        div.querySelector('input[type="color"]').addEventListener('input', (e) => {
            const currentBg = getBackground();
            currentBg.gradient.stops[index].color = e.target.value;
            // Deselect preset when manually changing colors
            document.querySelectorAll('.preset-swatch').forEach(s => s.classList.remove('selected'));
            updateCanvas();
        });

        div.querySelector('input[type="number"]').addEventListener('input', (e) => {
            const currentBg = getBackground();
            currentBg.gradient.stops[index].position = parseInt(e.target.value);
            // Deselect preset when manually changing positions
            document.querySelectorAll('.preset-swatch').forEach(s => s.classList.remove('selected'));
            updateCanvas();
        });

        const deleteBtn = div.querySelector('.screenshot-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                const currentBg = getBackground();
                currentBg.gradient.stops.splice(index, 1);
                // Deselect preset when deleting a stop
                document.querySelectorAll('.preset-swatch').forEach(s => s.classList.remove('selected'));
                updateGradientStopsUI();
                updateCanvas();
            });
        }

        container.appendChild(div);
    });
}

function getCanvasDimensions() {
    if (state.outputDevice === 'custom') {
        return { width: state.customWidth, height: state.customHeight };
    }
    return deviceDimensions[state.outputDevice];
}

function updateCanvas() {
    saveState(); // Persist state on every update
    const dims = getCanvasDimensions();
    canvas.width = dims.width;
    canvas.height = dims.height;

    // Scale for preview
    const maxPreviewWidth = 400;
    const maxPreviewHeight = 700;
    const scale = Math.min(maxPreviewWidth / dims.width, maxPreviewHeight / dims.height);
    canvas.style.width = (dims.width * scale) + 'px';
    canvas.style.height = (dims.height * scale) + 'px';

    // Draw background
    drawBackground();

    // Draw noise overlay on background if enabled
    if (getBackground().noise) {
        drawNoise();
    }

    // Elements behind screenshot
    drawElements(ctx, dims, 'behind-screenshot');

    // Draw screenshot (2D mode) or 3D phone model
    if (state.screenshots.length > 0) {
        const screenshot = state.screenshots[state.selectedIndex];
        const img = screenshot ? getScreenshotImage(screenshot) : null;
        const ss = getScreenshotSettings();
        const use3D = ss.use3D || false;
        if (use3D && img && typeof renderThreeJSToCanvas === 'function' && phoneModelLoaded) {
            // In 3D mode, update the screen texture and render the phone model
            if (typeof updateScreenTexture === 'function') {
                updateScreenTexture();
            }
            renderThreeJSToCanvas(canvas, dims.width, dims.height);
        } else if (!use3D) {
            // In 2D mode, draw the screenshot normally
            drawScreenshot();
        }
    }

    // Elements above screenshot but behind text
    drawElements(ctx, dims, 'above-screenshot');

    // Draw popouts (cropped regions from source image)
    drawPopouts(ctx, dims);

    // Draw text
    drawText();

    // Elements above text
    drawElements(ctx, dims, 'above-text');

    // Update side previews
    updateSidePreviews();
}

function updateSidePreviews() {
    const dims = getCanvasDimensions();
    // Same scale as main preview
    const maxPreviewWidth = 400;
    const maxPreviewHeight = 700;
    const previewScale = Math.min(maxPreviewWidth / dims.width, maxPreviewHeight / dims.height);

    // Initialize Three.js if any screenshot uses 3D mode (needed for side previews)
    const any3D = state.screenshots.some(s => s.screenshot?.use3D);
    if (any3D && typeof showThreeJS === 'function') {
        showThreeJS(true);

        // Preload phone models for adjacent screenshots to prevent flicker
        if (typeof loadCachedPhoneModel === 'function') {
            const adjacentIndices = [state.selectedIndex - 1, state.selectedIndex + 1]
                .filter(i => i >= 0 && i < state.screenshots.length);
            adjacentIndices.forEach(i => {
                const ss = state.screenshots[i]?.screenshot;
                if (ss?.use3D && ss?.device3D) {
                    loadCachedPhoneModel(ss.device3D);
                }
            });
        }
    }

    // Calculate main canvas display width and position side previews with 10px gap
    const mainCanvasWidth = dims.width * previewScale;
    const gap = 10;
    const sideOffset = mainCanvasWidth / 2 + gap;
    const farSideOffset = sideOffset + mainCanvasWidth + gap;

    // Previous screenshot (left, index - 1)
    const prevIndex = state.selectedIndex - 1;
    if (prevIndex >= 0 && state.screenshots.length > 1) {
        sidePreviewLeft.classList.remove('hidden');
        sidePreviewLeft.style.right = `calc(50% + ${sideOffset}px)`;
        // Skip render if already pre-rendered during slide transition
        if (!skipSidePreviewRender) {
            renderScreenshotToCanvas(prevIndex, canvasLeft, ctxLeft, dims, previewScale);
        }
        // Click to select previous with animation
        sidePreviewLeft.onclick = () => {
            if (isSliding) return;
            slideToScreenshot(prevIndex, 'left');
        };
    } else {
        sidePreviewLeft.classList.add('hidden');
    }

    // Far previous screenshot (far left, index - 2)
    const farPrevIndex = state.selectedIndex - 2;
    if (farPrevIndex >= 0 && state.screenshots.length > 2) {
        sidePreviewFarLeft.classList.remove('hidden');
        sidePreviewFarLeft.style.right = `calc(50% + ${farSideOffset}px)`;
        renderScreenshotToCanvas(farPrevIndex, canvasFarLeft, ctxFarLeft, dims, previewScale);
    } else {
        sidePreviewFarLeft.classList.add('hidden');
    }

    // Next screenshot (right, index + 1)
    const nextIndex = state.selectedIndex + 1;
    if (nextIndex < state.screenshots.length && state.screenshots.length > 1) {
        sidePreviewRight.classList.remove('hidden');
        sidePreviewRight.style.left = `calc(50% + ${sideOffset}px)`;
        // Skip render if already pre-rendered during slide transition
        if (!skipSidePreviewRender) {
            renderScreenshotToCanvas(nextIndex, canvasRight, ctxRight, dims, previewScale);
        }
        // Click to select next with animation
        sidePreviewRight.onclick = () => {
            if (isSliding) return;
            slideToScreenshot(nextIndex, 'right');
        };
    } else {
        sidePreviewRight.classList.add('hidden');
    }

    // Far next screenshot (far right, index + 2)
    const farNextIndex = state.selectedIndex + 2;
    if (farNextIndex < state.screenshots.length && state.screenshots.length > 2) {
        sidePreviewFarRight.classList.remove('hidden');
        sidePreviewFarRight.style.left = `calc(50% + ${farSideOffset}px)`;
        renderScreenshotToCanvas(farNextIndex, canvasFarRight, ctxFarRight, dims, previewScale);
    } else {
        sidePreviewFarRight.classList.add('hidden');
    }
}

function slideToScreenshot(newIndex, direction) {
    isSliding = true;
    previewStrip.classList.add('sliding');

    const dims = getCanvasDimensions();
    const maxPreviewWidth = 400;
    const maxPreviewHeight = 700;
    const previewScale = Math.min(maxPreviewWidth / dims.width, maxPreviewHeight / dims.height);
    const slideDistance = dims.width * previewScale + 10; // canvas width + gap

    const newPrevIndex = newIndex - 1;
    const newNextIndex = newIndex + 1;

    // Collect model loading promises for new active AND adjacent screenshots
    const modelPromises = [];
    [newIndex, newPrevIndex, newNextIndex].forEach(index => {
        if (index >= 0 && index < state.screenshots.length) {
            const ss = state.screenshots[index]?.screenshot;
            if (ss?.use3D && ss?.device3D && typeof loadCachedPhoneModel === 'function') {
                modelPromises.push(loadCachedPhoneModel(ss.device3D).catch(() => null));
            }
        }
    });

    // Start loading models immediately (in parallel with animation)
    const modelsReady = modelPromises.length > 0 ? Promise.all(modelPromises) : Promise.resolve();

    // Slide the strip in the opposite direction of the click
    if (direction === 'right') {
        previewStrip.style.transform = `translateX(-${slideDistance}px)`;
    } else {
        previewStrip.style.transform = `translateX(${slideDistance}px)`;
    }

    // Wait for BOTH animation AND models to be ready
    const animationDone = new Promise(resolve => setTimeout(resolve, 300));
    Promise.all([animationDone, modelsReady]).then(() => {
        // Pre-render new side previews to temporary canvases NOW (models are loaded)
        const tempCanvases = [];

        const prerenderToTemp = (index, targetCanvas) => {
            if (index < 0 || index >= state.screenshots.length) return null;
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            renderScreenshotToCanvas(index, tempCanvas, tempCtx, dims, previewScale);
            return { tempCanvas, targetCanvas };
        };

        const leftPrerender = prerenderToTemp(newPrevIndex, canvasLeft);
        const rightPrerender = prerenderToTemp(newNextIndex, canvasRight);
        if (leftPrerender) tempCanvases.push(leftPrerender);
        if (rightPrerender) tempCanvases.push(rightPrerender);

        // Disable transition temporarily for instant reset
        previewStrip.style.transition = 'none';
        previewStrip.style.transform = 'translateX(0)';

        // Suppress updateCanvas calls from switchPhoneModel during sync
        window.suppressSwitchModelUpdate = true;

        // Update state
        state.selectedIndex = newIndex;
        updateScreenshotList();
        syncUIWithState();
        updateGradientStopsUI();

        // Copy pre-rendered canvases to actual canvases BEFORE updateCanvas
        // This prevents flicker by having content ready before the swap
        tempCanvases.forEach(({ tempCanvas, targetCanvas }) => {
            targetCanvas.width = tempCanvas.width;
            targetCanvas.height = tempCanvas.height;
            targetCanvas.style.width = tempCanvas.style.width;
            targetCanvas.style.height = tempCanvas.style.height;
            const targetCtx = targetCanvas.getContext('2d');
            targetCtx.drawImage(tempCanvas, 0, 0);
        });

        // Skip side preview re-render since we already pre-rendered them
        skipSidePreviewRender = true;

        // Now do a full updateCanvas for main preview, far sides, etc.
        // Side previews won't flicker because we already drew to them
        updateCanvas();

        // Reset flags
        skipSidePreviewRender = false;
        window.suppressSwitchModelUpdate = false;

        // Re-enable transition after a frame
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                previewStrip.style.transition = '';
                previewStrip.classList.remove('sliding');
                isSliding = false;
            });
        });
    });
}

function renderScreenshotToCanvas(index, targetCanvas, targetCtx, dims, previewScale) {
    const screenshot = state.screenshots[index];
    if (!screenshot) return;

    // Get localized image for current language
    const img = getScreenshotImage(screenshot);

    // Set canvas size (this also clears the canvas)
    targetCanvas.width = dims.width;
    targetCanvas.height = dims.height;
    targetCanvas.style.width = (dims.width * previewScale) + 'px';
    targetCanvas.style.height = (dims.height * previewScale) + 'px';

    // Clear canvas explicitly
    targetCtx.clearRect(0, 0, dims.width, dims.height);

    // Draw background for this screenshot + current output device
    const bg = getBackgroundForDevice(screenshot, state.outputDevice, false);
    drawBackgroundToContext(targetCtx, dims, bg);

    // Draw noise if enabled
    if (bg.noise) {
        drawNoiseToContext(targetCtx, dims, bg.noiseIntensity);
    }

    const elements = screenshot.elements || [];

    // Elements behind screenshot
    drawElementsToContext(targetCtx, dims, elements, 'behind-screenshot');

    // Draw screenshot - 3D if active for this screenshot, otherwise 2D
    const settings = screenshot.screenshot;
    const use3D = settings.use3D || false;

    if (img) {
        if (use3D && typeof renderThreeJSForScreenshot === 'function' && phoneModelLoaded) {
            // Render 3D phone model for this specific screenshot
            renderThreeJSForScreenshot(targetCanvas, dims.width, dims.height, index);
        } else {
            // Draw 2D screenshot using localized image
            drawScreenshotToContext(targetCtx, dims, img, settings);
        }
    }

    // Elements above screenshot
    drawElementsToContext(targetCtx, dims, elements, 'above-screenshot');

    // Draw popouts
    const popouts = screenshot.popouts || [];
    drawPopoutsToContext(targetCtx, dims, popouts, img, settings);

    // Draw text
    const txt = screenshot.text;
    drawTextToContext(targetCtx, dims, txt);

    // Elements above text
    drawElementsToContext(targetCtx, dims, elements, 'above-text');
}

function drawBackgroundToContext(context, dims, bg) {
    if (bg.type === 'gradient') {
        const angle = bg.gradient.angle * Math.PI / 180;
        const x1 = dims.width / 2 - Math.cos(angle) * dims.width;
        const y1 = dims.height / 2 - Math.sin(angle) * dims.height;
        const x2 = dims.width / 2 + Math.cos(angle) * dims.width;
        const y2 = dims.height / 2 + Math.sin(angle) * dims.height;

        const gradient = context.createLinearGradient(x1, y1, x2, y2);
        bg.gradient.stops.forEach(stop => {
            gradient.addColorStop(stop.position / 100, stop.color);
        });

        context.fillStyle = gradient;
        context.fillRect(0, 0, dims.width, dims.height);
    } else if (bg.type === 'solid') {
        context.fillStyle = bg.solid;
        context.fillRect(0, 0, dims.width, dims.height);
    } else if (bg.type === 'image' && bg.image) {
        const img = bg.image;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        let dx = 0, dy = 0, dw = dims.width, dh = dims.height;

        if (bg.imageFit === 'cover') {
            const imgRatio = img.width / img.height;
            const canvasRatio = dims.width / dims.height;

            if (imgRatio > canvasRatio) {
                sw = img.height * canvasRatio;
                sx = (img.width - sw) / 2;
            } else {
                sh = img.width / canvasRatio;
                sy = (img.height - sh) / 2;
            }
        } else if (bg.imageFit === 'contain') {
            const imgRatio = img.width / img.height;
            const canvasRatio = dims.width / dims.height;

            if (imgRatio > canvasRatio) {
                dh = dims.width / imgRatio;
                dy = (dims.height - dh) / 2;
            } else {
                dw = dims.height * imgRatio;
                dx = (dims.width - dw) / 2;
            }

            context.fillStyle = '#000';
            context.fillRect(0, 0, dims.width, dims.height);
        }

        if (bg.imageBlur > 0) {
            context.filter = `blur(${bg.imageBlur}px)`;
        }

        context.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        context.filter = 'none';

        if (bg.overlayOpacity > 0) {
            context.fillStyle = bg.overlayColor;
            context.globalAlpha = bg.overlayOpacity / 100;
            context.fillRect(0, 0, dims.width, dims.height);
            context.globalAlpha = 1;
        }
    }
}

function drawNoiseToContext(context, dims, intensity) {
    const imageData = context.getImageData(0, 0, dims.width, dims.height);
    const data = imageData.data;
    const noiseAmount = intensity / 100;

    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 255 * noiseAmount;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }

    context.putImageData(imageData, 0, 0);
}

function drawScreenshotToContext(context, dims, img, settings) {
    if (!img) return;

    const scale = settings.scale / 100;
    let imgWidth = dims.width * scale;
    let imgHeight = (img.height / img.width) * imgWidth;

    if (imgHeight > dims.height * scale) {
        imgHeight = dims.height * scale;
        imgWidth = (img.width / img.height) * imgHeight;
    }

    // Ensure minimum movement range so position works even at 100% scale
    const moveX = Math.max(dims.width - imgWidth, dims.width * 0.15);
    const moveY = Math.max(dims.height - imgHeight, dims.height * 0.15);
    const x = (dims.width - imgWidth) / 2 + (settings.x / 100 - 0.5) * moveX;
    const y = (dims.height - imgHeight) / 2 + (settings.y / 100 - 0.5) * moveY;
    const centerX = x + imgWidth / 2;
    const centerY = y + imgHeight / 2;

    context.save();

    // Apply transformations
    context.translate(centerX, centerY);

    // Apply rotation
    if (settings.rotation !== 0) {
        context.rotate(settings.rotation * Math.PI / 180);
    }

    // Apply perspective (simulated with scale transform)
    if (settings.perspective !== 0) {
        context.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
    }

    context.translate(-centerX, -centerY);

    // Scale corner radius with image size
    const radius = (settings.cornerRadius || 0) * (imgWidth / 400);

    // Draw shadow first (needs a filled shape, not clipped)
    if (settings.shadow && settings.shadow.enabled) {
        const shadowOpacity = settings.shadow.opacity / 100;
        const shadowColor = settings.shadow.color + Math.round(shadowOpacity * 255).toString(16).padStart(2, '0');
        context.shadowColor = shadowColor;
        context.shadowBlur = settings.shadow.blur;
        context.shadowOffsetX = settings.shadow.x;
        context.shadowOffsetY = settings.shadow.y;

        // Draw filled rounded rect for shadow
        context.fillStyle = '#000';
        context.beginPath();
        context.roundRect(x, y, imgWidth, imgHeight, radius);
        context.fill();

        // Reset shadow before drawing image
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
    }

    // Clip and draw image
    context.beginPath();
    context.roundRect(x, y, imgWidth, imgHeight, radius);
    context.clip();
    context.drawImage(img, x, y, imgWidth, imgHeight);

    context.restore();

    // Draw device frame if enabled
    if (settings.frame && settings.frame.enabled) {
        context.save();
        context.translate(centerX, centerY);
        if (settings.rotation !== 0) {
            context.rotate(settings.rotation * Math.PI / 180);
        }
        if (settings.perspective !== 0) {
            context.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
        }
        context.translate(-centerX, -centerY);
        drawDeviceFrameToContext(context, x, y, imgWidth, imgHeight, settings);
        context.restore();
    }
}

function drawDeviceFrameToContext(context, x, y, width, height, settings) {
    const frameColor = settings.frame.color;
    const frameWidth = settings.frame.width * (width / 400);
    const frameOpacity = settings.frame.opacity / 100;
    const radius = (settings.cornerRadius || 0) * (width / 400) + frameWidth;

    context.globalAlpha = frameOpacity;
    context.strokeStyle = frameColor;
    context.lineWidth = frameWidth;
    context.beginPath();
    context.roundRect(x - frameWidth / 2, y - frameWidth / 2, width + frameWidth, height + frameWidth, radius);
    context.stroke();
    context.globalAlpha = 1;
}

function drawTextToContext(context, dims, txt) {
    textApi.drawTextToContext(context, dims, txt);
}

// Draw elements for the current screenshot at a specific layer
function drawElements(context, dims, layer) {
    const elements = getElements();
    drawElementsToContext(context, dims, elements, layer);
}

// Draw elements to any context (for side previews and export)
function drawElementsToContext(context, dims, elements, layer) {
    const filtered = elements.filter(el => el.layer === layer);
    filtered.forEach(el => {
        context.save();
        context.globalAlpha = el.opacity / 100;

        const cx = dims.width * (el.x / 100);
        const cy = dims.height * (el.y / 100);
        const elWidth = dims.width * (el.width / 100);

        context.translate(cx, cy);
        if (el.rotation !== 0) {
            context.rotate(el.rotation * Math.PI / 180);
        }

        if (el.type === 'emoji' && el.emoji) {
            const emojiSize = elWidth * 0.85;
            context.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(el.emoji, 0, 0);
        } else if (el.type === 'icon' && el.image) {
            // Shadow
            if (el.iconShadow?.enabled) {
                const s = el.iconShadow;
                const hex = s.color || '#000000';
                const r = parseInt(hex.slice(1,3), 16);
                const g = parseInt(hex.slice(3,5), 16);
                const b = parseInt(hex.slice(5,7), 16);
                context.shadowColor = `rgba(${r},${g},${b},${(s.opacity || 0) / 100})`;
                context.shadowBlur = s.blur || 0;
                context.shadowOffsetX = s.x || 0;
                context.shadowOffsetY = s.y || 0;
            }
            // Icons are square (1:1)
            context.drawImage(el.image, -elWidth / 2, -elWidth / 2, elWidth, elWidth);
            // Reset shadow
            if (el.iconShadow?.enabled) {
                context.shadowColor = 'transparent';
                context.shadowBlur = 0;
                context.shadowOffsetX = 0;
                context.shadowOffsetY = 0;
            }
        } else if (el.type === 'graphic' && el.image) {
            const aspect = el.image.height / el.image.width;
            const elHeight = elWidth * aspect;
            context.drawImage(el.image, -elWidth / 2, -elHeight / 2, elWidth, elHeight);
        } else if (el.type === 'text') {
            const elText = getElementText(el);
            if (!elText) { context.restore(); return; }
            const baseStyle = {
                font: el.font,
                fontSize: el.fontSize,
                fontWeight: el.fontWeight,
                color: el.fontColor,
                italic: el.italic,
                underline: false,
                strikethrough: false
            };
            const runs = parseRichTextMarkup(elText, baseStyle);
            const richLayout = layoutRichTextRuns(context, runs, elWidth, 1.05, el.fontSize);

            // Draw frame behind text if enabled
            if (el.frame && el.frame !== 'none') {
                drawElementFrame(context, el, dims, elWidth, richLayout.totalHeight, richLayout.maxLineWidth);
            }

            // Draw rich text lines (markup syntax)
            const startY = -richLayout.totalHeight / 2;
            drawRichTextLines(context, richLayout, {
                centerX: 0,
                startY,
                baseColor: el.fontColor,
                textBaseline: 'top'
            });
        }

        context.restore();
    });
}

// ===== Popout rendering =====
function drawPopouts(context, dims) {
    const screenshot = getCurrentScreenshot();
    if (!screenshot) return;
    const img = getScreenshotImage(screenshot);
    if (!img) return;
    const popouts = screenshot.popouts || [];
    const ss = getScreenshotSettings();
    drawPopoutsToContext(context, dims, popouts, img, ss);
}

function drawPopoutsToContext(context, dims, popouts, img, screenshotSettings) {
    if (!img || !popouts || popouts.length === 0) return;

    popouts.forEach(p => {
        context.save();
        context.globalAlpha = p.opacity / 100;

        // Crop from source image (percentages -> pixels)
        const sx = (p.cropX / 100) * img.width;
        const sy = (p.cropY / 100) * img.height;
        const sw = (p.cropWidth / 100) * img.width;
        const sh = (p.cropHeight / 100) * img.height;

        // Display position and size (percentages -> canvas pixels)
        const displayW = dims.width * (p.width / 100);
        const cropAspect = sh / sw;
        const displayH = displayW * cropAspect;
        const cx = dims.width * (p.x / 100);
        const cy = dims.height * (p.y / 100);

        context.translate(cx, cy);

        // Apply popout's own rotation only (no 3D transform inheritance)
        if (p.rotation !== 0) {
            context.rotate(p.rotation * Math.PI / 180);
        }

        const halfW = displayW / 2;
        const halfH = displayH / 2;
        const radius = p.cornerRadius * (displayW / 300);

        // Draw shadow
        if (p.shadow && p.shadow.enabled) {
            const shadowOpacity = p.shadow.opacity / 100;
            const hex = p.shadow.color || '#000000';
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            context.shadowColor = `rgba(${r},${g},${b},${shadowOpacity})`;
            context.shadowBlur = p.shadow.blur;
            context.shadowOffsetX = p.shadow.x;
            context.shadowOffsetY = p.shadow.y;

            context.fillStyle = '#000';
            context.beginPath();
            context.roundRect(-halfW, -halfH, displayW, displayH, radius);
            context.fill();

            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
        }

        // Draw border behind the image
        if (p.border && p.border.enabled) {
            const bw = p.border.width;
            context.save();
            context.globalAlpha = (p.opacity / 100) * (p.border.opacity / 100);
            context.fillStyle = p.border.color;
            context.beginPath();
            context.roundRect(-halfW - bw, -halfH - bw, displayW + bw * 2, displayH + bw * 2, radius + bw);
            context.fill();
            context.restore();
        }

        // Clip and draw cropped image
        context.beginPath();
        context.roundRect(-halfW, -halfH, displayW, displayH, radius);
        context.clip();
        context.drawImage(img, sx, sy, sw, sh, -halfW, -halfH, displayW, displayH);

        context.restore();
    });
}

// Draw decorative frames around text elements
function drawElementFrame(context, el, dims, textWidth, textHeight, measuredMaxLineWidth = null) {
    const scale = el.frameScale / 100;
    const padding = el.fontSize * 0.4 * scale;
    // Measure widest line from rich text layout when available.
    let maxLineW = measuredMaxLineWidth;
    if (typeof maxLineW !== 'number') {
        const elWidth = dims.width * (el.width / 100);
        const fontStyle = el.italic ? 'italic' : 'normal';
        context.font = `${fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.font}`;
        const lines = wrapText(context, getElementText(el), elWidth);
        maxLineW = Math.max(...lines.map(l => context.measureText(l).width));
    }
    const frameW = maxLineW + padding * 2;
    const frameH = textHeight + padding * 2;

    context.save();
    context.strokeStyle = el.frameColor;
    context.fillStyle = 'none';
    context.lineWidth = Math.max(2, el.fontSize * 0.04) * scale;

    const isLaurel = el.frame.startsWith('laurel-');
    const hasStar = el.frame.endsWith('-star');

    if (isLaurel) {
        const variant = el.frame.includes('detailed') ? 'laurel-detailed-left' : 'laurel-simple-left';
        drawLaurelSVG(context, variant, frameW, frameH, scale, el.frameColor);
        if (hasStar) {
            drawStar(context, 0, -frameH / 2 - el.fontSize * 0.2 * scale, el.fontSize * 0.3 * scale, el.frameColor);
        }
    } else if (el.frame === 'badge-circle') {
        context.beginPath();
        const radius = Math.max(frameW, frameH) / 2 + padding * 0.5;
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.stroke();
    } else if (el.frame === 'badge-ribbon') {
        const sw = frameW + padding;
        const sh = frameH + padding * 1.5;
        context.beginPath();
        context.moveTo(-sw / 2, -sh / 2);
        context.lineTo(sw / 2, -sh / 2);
        context.lineTo(sw / 2, sh / 2 - padding);
        context.lineTo(0, sh / 2);
        context.lineTo(-sw / 2, sh / 2 - padding);
        context.closePath();
        context.stroke();
    }

    context.restore();
}

// Draw laurel wreath using SVG image — left branch + mirrored right branch
function drawLaurelSVG(context, variant, w, h, scale, color) {
    const img = laurelImages[variant];
    if (!img || !img.complete || !img.naturalWidth) return;

    // Scale SVG branch to match the frame height
    const branchH = h * 1.1 * scale;
    const aspect = img.naturalWidth / img.naturalHeight;
    const branchW = branchH * aspect;

    // The SVG is black fill — use a temp canvas to recolor it
    const tmp = document.createElement('canvas');
    tmp.width = Math.ceil(branchW);
    tmp.height = Math.ceil(branchH);
    const tctx = tmp.getContext('2d');

    // Draw the SVG scaled into the temp canvas
    tctx.drawImage(img, 0, 0, branchW, branchH);

    // Recolor: draw color on top using source-in composite
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, branchW, branchH);

    // Position: left branch sits to the left of the text area
    const gap = 2 * scale;
    const leftX = -w / 2 - branchW - gap;
    const topY = -branchH / 2;

    // Draw left branch
    context.drawImage(tmp, leftX, topY, branchW, branchH);

    // Draw right branch (mirrored horizontally)
    context.save();
    context.scale(-1, 1);
    context.drawImage(tmp, leftX, topY, branchW, branchH);
    context.restore();
}

// Draw a 5-point star
function drawStar(context, cx, cy, size, color) {
    context.save();
    context.fillStyle = color;
    context.beginPath();
    for (let i = 0; i < 5; i++) {
        const outer = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const inner = outer + Math.PI / 5;
        const ox = cx + Math.cos(outer) * size;
        const oy = cy + Math.sin(outer) * size;
        const ix = cx + Math.cos(inner) * size * 0.4;
        const iy = cy + Math.sin(inner) * size * 0.4;
        if (i === 0) context.moveTo(ox, oy);
        else context.lineTo(ox, oy);
        context.lineTo(ix, iy);
    }
    context.closePath();
    context.fill();
    context.restore();
}

function drawBackground() {
    const dims = getCanvasDimensions();
    const bg = getBackground();

    if (bg.type === 'gradient') {
        const angle = bg.gradient.angle * Math.PI / 180;
        const x1 = dims.width / 2 - Math.cos(angle) * dims.width;
        const y1 = dims.height / 2 - Math.sin(angle) * dims.height;
        const x2 = dims.width / 2 + Math.cos(angle) * dims.width;
        const y2 = dims.height / 2 + Math.sin(angle) * dims.height;

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        bg.gradient.stops.forEach(stop => {
            gradient.addColorStop(stop.position / 100, stop.color);
        });

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, dims.width, dims.height);
    } else if (bg.type === 'solid') {
        ctx.fillStyle = bg.solid;
        ctx.fillRect(0, 0, dims.width, dims.height);
    } else if (bg.type === 'image' && bg.image) {
        const img = bg.image;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        let dx = 0, dy = 0, dw = dims.width, dh = dims.height;

        if (bg.imageFit === 'cover') {
            const imgRatio = img.width / img.height;
            const canvasRatio = dims.width / dims.height;

            if (imgRatio > canvasRatio) {
                sw = img.height * canvasRatio;
                sx = (img.width - sw) / 2;
            } else {
                sh = img.width / canvasRatio;
                sy = (img.height - sh) / 2;
            }
        } else if (bg.imageFit === 'contain') {
            const imgRatio = img.width / img.height;
            const canvasRatio = dims.width / dims.height;

            if (imgRatio > canvasRatio) {
                dh = dims.width / imgRatio;
                dy = (dims.height - dh) / 2;
            } else {
                dw = dims.height * imgRatio;
                dx = (dims.width - dw) / 2;
            }

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, dims.width, dims.height);
        }

        if (bg.imageBlur > 0) {
            ctx.filter = `blur(${bg.imageBlur}px)`;
        }

        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.filter = 'none';

        // Overlay
        if (bg.overlayOpacity > 0) {
            ctx.fillStyle = bg.overlayColor;
            ctx.globalAlpha = bg.overlayOpacity / 100;
            ctx.fillRect(0, 0, dims.width, dims.height);
            ctx.globalAlpha = 1;
        }
    }
}

function drawScreenshot() {
    const dims = getCanvasDimensions();
    const screenshot = state.screenshots[state.selectedIndex];
    if (!screenshot) return;

    // Use localized image based on current language
    const img = getScreenshotImage(screenshot);
    if (!img) return;

    const settings = getScreenshotSettings();
    const scale = settings.scale / 100;

    // Calculate scaled dimensions
    let imgWidth = dims.width * scale;
    let imgHeight = (img.height / img.width) * imgWidth;

    // If image is taller than canvas after scaling, adjust
    if (imgHeight > dims.height * scale) {
        imgHeight = dims.height * scale;
        imgWidth = (img.width / img.height) * imgHeight;
    }

    // Ensure minimum movement range so position works even at 100% scale
    const moveX = Math.max(dims.width - imgWidth, dims.width * 0.15);
    const moveY = Math.max(dims.height - imgHeight, dims.height * 0.15);
    const x = (dims.width - imgWidth) / 2 + (settings.x / 100 - 0.5) * moveX;
    const y = (dims.height - imgHeight) / 2 + (settings.y / 100 - 0.5) * moveY;

    // Center point for transformations
    const centerX = x + imgWidth / 2;
    const centerY = y + imgHeight / 2;

    ctx.save();

    // Apply transformations
    ctx.translate(centerX, centerY);

    // Apply rotation
    if (settings.rotation !== 0) {
        ctx.rotate(settings.rotation * Math.PI / 180);
    }

    // Apply perspective (simulated with scale transform)
    if (settings.perspective !== 0) {
        const perspectiveScale = 1 - Math.abs(settings.perspective) * 0.005;
        ctx.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
    }

    ctx.translate(-centerX, -centerY);

    // Draw rounded rectangle with screenshot
    const radius = settings.cornerRadius * (imgWidth / 400); // Scale radius with image

    // Draw shadow first (needs a filled shape, not clipped)
    if (settings.shadow.enabled) {
        const shadowColor = hexToRgba(settings.shadow.color, settings.shadow.opacity / 100);
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = settings.shadow.blur;
        ctx.shadowOffsetX = settings.shadow.x;
        ctx.shadowOffsetY = settings.shadow.y;

        // Draw filled rounded rect for shadow
        ctx.fillStyle = '#000';
        ctx.beginPath();
        roundRect(ctx, x, y, imgWidth, imgHeight, radius);
        ctx.fill();

        // Reset shadow before drawing image
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    // Clip and draw image
    ctx.beginPath();
    roundRect(ctx, x, y, imgWidth, imgHeight, radius);
    ctx.clip();
    ctx.drawImage(img, x, y, imgWidth, imgHeight);

    ctx.restore();

    // Draw device frame if enabled (needs separate transform context)
    if (settings.frame.enabled) {
        ctx.save();
        ctx.translate(centerX, centerY);
        if (settings.rotation !== 0) {
            ctx.rotate(settings.rotation * Math.PI / 180);
        }
        if (settings.perspective !== 0) {
            ctx.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
        }
        ctx.translate(-centerX, -centerY);
        drawDeviceFrame(x, y, imgWidth, imgHeight);
        ctx.restore();
    }
}

function drawDeviceFrame(x, y, width, height) {
    const settings = getScreenshotSettings();
    const frameColor = settings.frame.color;
    const frameWidth = settings.frame.width * (width / 400); // Scale with image
    const frameOpacity = settings.frame.opacity / 100;
    const radius = settings.cornerRadius * (width / 400) + frameWidth;

    ctx.globalAlpha = frameOpacity;
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = frameWidth;
    ctx.beginPath();
    roundRect(ctx, x - frameWidth / 2, y - frameWidth / 2, width + frameWidth, height + frameWidth, radius);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function drawText() {
    textApi.drawText();
}

function drawNoise() {
    const dims = getCanvasDimensions();
    const imageData = ctx.getImageData(0, 0, dims.width, dims.height);
    const data = imageData.data;
    const intensity = getBackground().noiseIntensity / 100 * 50;

    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * intensity;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }

    ctx.putImageData(imageData, 0, 0);
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
    return textApi.wrapText(ctx, text, maxWidth);
}

function parseRichTextMarkup(text, baseStyle = {}) {
    return textApi.parseRichTextMarkup(text, baseStyle);
}

function setContextFontForStyle(context, style) {
    textApi.setContextFontForStyle(context, style);
}

function measureRichRunText(context, text, style) {
    return textApi.measureRichRunText(context, text, style);
}

function splitLongTokenByWidth(context, token, style, maxWidth) {
    return textApi.splitLongTokenByWidth(context, token, style, maxWidth);
}

function layoutRichTextRuns(context, runs, maxWidth, lineHeightFactor = 1.05, minLineHeight = 12) {
    return textApi.layoutRichTextRuns(context, runs, maxWidth, lineHeightFactor, minLineHeight);
}

function createTextGradient(context, x, y, width, colors) {
    return textApi.createTextGradient(context, x, y, width, colors);
}

function drawRichTextLines(context, layout, opts = {}) {
    textApi.drawRichTextLines(context, layout, opts);
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const exportManager = createExportManager({
    state,
    canvas,
    updateCanvas,
    showAppAlert,
    showExportLanguageDialog,
    languageNames,
    languages,
    JSZipCtor: JSZip,
    syncUIWithState
});

function getExportPlatformAndSize() {
    return exportManager.getExportPlatformAndSize();
}

function getExportImageFilename(index) {
    return exportManager.getExportImageFilename(index);
}

async function exportCurrent() {
    return exportManager.exportCurrent();
}

async function exportAll() {
    return exportManager.exportAll();
}

function showExportProgress(status, detail, percent) {
    return exportManager.showExportProgress(status, detail, percent);
}

function hideExportProgress() {
    return exportManager.hideExportProgress();
}

async function exportAllForLanguage(lang) {
    return exportManager.exportAllForLanguage(lang);
}

async function exportAllLanguages() {
    return exportManager.exportAllLanguages();
}

// ===== Emoji Picker (inline dropdown) =====

let emojiPickerInitialized = false;

function showEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    const iconPicker = document.getElementById('icon-picker');
    if (!picker) return;

    // Close icon picker if open
    if (iconPicker) iconPicker.style.display = 'none';

    // Toggle
    if (picker.style.display !== 'none') {
        picker.style.display = 'none';
        return;
    }

    picker.style.display = '';
    const searchInput = document.getElementById('emoji-search');
    if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 50);
    }

    // Reset to popular category
    document.querySelectorAll('#emoji-categories .picker-cat').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === 'popular');
    });
    renderEmojiGrid('popular');

    if (!emojiPickerInitialized) {
        emojiPickerInitialized = true;

        // Category tabs
        document.querySelectorAll('#emoji-categories .picker-cat').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#emoji-categories .picker-cat').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const searchVal = document.getElementById('emoji-search').value.trim();
                if (searchVal) {
                    renderEmojiSearchResults(searchVal);
                } else {
                    renderEmojiGrid(btn.dataset.category);
                }
            });
        });

        // Search
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const val = searchInput.value.trim().toLowerCase();
                if (val) {
                    renderEmojiSearchResults(val);
                } else {
                    const active = document.querySelector('#emoji-categories .picker-cat.active');
                    renderEmojiGrid(active?.dataset.category || 'popular');
                }
            });
        }
    }
}

function renderEmojiGrid(category) {
    const grid = document.getElementById('emoji-grid');
    if (!grid || typeof EMOJI_DATA === 'undefined') return;
    const emojis = EMOJI_DATA[category] || [];
    grid.innerHTML = emojis.map(e =>
        `<div class="picker-grid-item emoji-grid-item" data-emoji="${e.emoji}" data-name="${e.name}" title="${e.name}">${e.emoji}</div>`
    ).join('');
    wireEmojiClicks(grid);
}

function renderEmojiSearchResults(query) {
    const grid = document.getElementById('emoji-grid');
    if (!grid || typeof EMOJI_DATA === 'undefined') return;
    const results = [];
    for (const cat of Object.values(EMOJI_DATA)) {
        for (const e of cat) {
            if (e.name.toLowerCase().includes(query) ||
                e.keywords.some(k => k.includes(query))) {
                if (!results.find(r => r.emoji === e.emoji)) results.push(e);
            }
        }
    }
    grid.innerHTML = results.map(e =>
        `<div class="picker-grid-item emoji-grid-item" data-emoji="${e.emoji}" data-name="${e.name}" title="${e.name}">${e.emoji}</div>`
    ).join('');
    wireEmojiClicks(grid);
}

function wireEmojiClicks(grid) {
    grid.querySelectorAll('.emoji-grid-item').forEach(item => {
        item.onclick = () => {
            addEmojiElement(item.dataset.emoji, item.dataset.name);
            document.getElementById('emoji-picker').style.display = 'none';
        };
    });
}

// ===== Icon Picker (inline dropdown) =====

let iconPickerInitialized = false;
let iconSearchTimeout = null;

const iconImageObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const item = entry.target;
            const name = item.dataset.iconName;
            if (name && !item.dataset.loaded) {
                item.dataset.loaded = 'true';
                loadIconPreview(item, name);
            }
            iconImageObserver.unobserve(item);
        }
    });
}, { root: document.getElementById('icon-grid'), rootMargin: '50px' }) : null;

async function loadIconPreview(item, name) {
    try {
        const svgText = await fetchLucideSVG(name);
        const colorized = colorizeLucideSVG(svgText, 'currentColor', 2);
        item.innerHTML = colorized;
        const svg = item.querySelector('svg');
        if (svg) {
            svg.style.width = '20px';
            svg.style.height = '20px';
        }
    } catch (e) {
        item.innerHTML = `<span style="font-size: 9px; color: var(--text-tertiary);">${name}</span>`;
    }
}

function showIconPicker() {
    const picker = document.getElementById('icon-picker');
    const emojiPicker = document.getElementById('emoji-picker');
    if (!picker) return;

    // Close emoji picker if open
    if (emojiPicker) emojiPicker.style.display = 'none';

    // Toggle
    if (picker.style.display !== 'none') {
        picker.style.display = 'none';
        return;
    }

    picker.style.display = '';
    const searchInput = document.getElementById('icon-search');
    if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 50);
    }

    // Reset to popular category
    document.querySelectorAll('#icon-categories .picker-cat').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === 'popular');
    });
    renderIconGrid('popular');

    if (!iconPickerInitialized) {
        iconPickerInitialized = true;

        // Category tabs
        document.querySelectorAll('#icon-categories .picker-cat').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#icon-categories .picker-cat').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const searchVal = document.getElementById('icon-search').value.trim();
                if (searchVal) {
                    renderIconSearchResults(searchVal);
                } else {
                    renderIconGrid(btn.dataset.category);
                }
            });
        });

        // Debounced search
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(iconSearchTimeout);
                iconSearchTimeout = setTimeout(() => {
                    const val = searchInput.value.trim().toLowerCase();
                    if (val) {
                        renderIconSearchResults(val);
                    } else {
                        const active = document.querySelector('#icon-categories .picker-cat.active');
                        renderIconGrid(active?.dataset.category || 'popular');
                    }
                }, 200);
            });
        }
    }
}

function renderIconGrid(category) {
    const grid = document.getElementById('icon-grid');
    if (!grid) return;
    const icons = category === 'popular' ? (typeof LUCIDE_POPULAR !== 'undefined' ? LUCIDE_POPULAR : []) :
                                            (typeof LUCIDE_ALL !== 'undefined' ? LUCIDE_ALL : []);
    grid.innerHTML = icons.map(name =>
        `<div class="picker-grid-item icon-grid-item" data-icon-name="${name}" title="${name}"><div class="icon-placeholder"></div></div>`
    ).join('');
    wireIconClicks(grid);
    if (iconImageObserver) {
        grid.querySelectorAll('.icon-grid-item').forEach(item => {
            iconImageObserver.observe(item);
        });
    }
}

function renderIconSearchResults(query) {
    const grid = document.getElementById('icon-grid');
    if (!grid) return;
    const allIcons = typeof LUCIDE_ALL !== 'undefined' ? LUCIDE_ALL : [];
    const results = allIcons.filter(name => name.includes(query));
    grid.innerHTML = results.map(name =>
        `<div class="picker-grid-item icon-grid-item" data-icon-name="${name}" title="${name}"><div class="icon-placeholder"></div></div>`
    ).join('');
    wireIconClicks(grid);
    if (iconImageObserver) {
        grid.querySelectorAll('.icon-grid-item').forEach(item => {
            iconImageObserver.observe(item);
        });
    }
}

function wireIconClicks(grid) {
    grid.querySelectorAll('.icon-grid-item').forEach(item => {
        item.onclick = () => {
            addIconElement(item.dataset.iconName);
            document.getElementById('icon-picker').style.display = 'none';
        };
    });
}

// Initialize the app
initSync();
