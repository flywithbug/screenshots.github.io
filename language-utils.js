// Language utilities for localized screenshot management
// This file handles language detection, localized image management, and translation dialogs

// Current screenshot index for translations modal
let currentTranslationsIndex = null;

/**
 * Extract the base filename without language suffix
 * e.g., "screenshot_de.png" -> "screenshot", "image-fr.png" -> "image"
 * @param {string} filename - The filename to parse
 * @returns {string} - Base filename without language suffix and extension
 */
function getBaseFilename(filename) {
    // Remove extension
    const withoutExt = filename.replace(/\.[^.]+$/, '');

    // All supported language codes from languageFlags
    const supportedLangs = Object.keys(languageFlags);

    // Sort by length (longest first) to match pt-br before pt
    const sortedLangs = [...supportedLangs].sort((a, b) => b.length - a.length);

    for (const lang of sortedLangs) {
        // Match patterns like: _pt-br, -pt-br, _pt_br, -pt_br, _de, -de
        const escapedLang = lang.replace('-', '[-_]?');
        const pattern = new RegExp(`[_-]${escapedLang}(?:[_-][a-z]{2})?$`, 'i');
        if (pattern.test(withoutExt)) {
            return withoutExt.replace(pattern, '');
        }
    }

    return withoutExt;
}

/**
 * Find an existing screenshot with a matching base filename
 * @param {string} filename - The filename to check
 * @returns {number} - Index of matching screenshot, or -1 if not found
 */
function findScreenshotByBaseFilename(filename) {
    const baseName = getBaseFilename(filename);

    for (let i = 0; i < state.screenshots.length; i++) {
        const screenshot = state.screenshots[i];
        if (!screenshot.localizedImages) continue;

        // Check each localized image's filename
        for (const lang of Object.keys(screenshot.localizedImages)) {
            const localizedName = screenshot.localizedImages[lang]?.name;
            if (localizedName && getBaseFilename(localizedName) === baseName) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Detect language code from filename
 * Supports patterns like: screenshot_de.png, screenshot-fr.png, screenshot_pt-br.png
 * @param {string} filename - The filename to parse
 * @returns {string} - Language code (e.g., 'de', 'fr', 'pt-br') or 'en' as fallback
 */
function detectLanguageFromFilename(filename) {
    // All supported language codes from languageFlags (defined in app.js)
    const supportedLangs = Object.keys(languageFlags);

    // Normalize filename for matching
    const lower = filename.toLowerCase();

    // Check for longer codes first (pt-br, zh-tw, en-gb) to avoid false matches
    const sortedLangs = [...supportedLangs].sort((a, b) => b.length - a.length);

    for (const lang of sortedLangs) {
        // Match patterns like: _pt-br., -pt-br., _pt_br., -pt_br.
        // Also: _de., -de., _DE., -DE., _de-DE., etc.
        const escapedLang = lang.replace('-', '[-_]?');
        const pattern = new RegExp(`[_-]${escapedLang}(?:[_-][a-z]{2})?\\.`, 'i');
        if (pattern.test(lower)) {
            return lang;
        }
    }

    return 'en'; // fallback to English
}

/**
 * Get the appropriate image for a screenshot based on current language
 * Falls back to first available language if current language has no image
 * @param {Object} screenshot - The screenshot object
 * @returns {Image|null} - The Image object to use for rendering
 */
function getScreenshotImage(screenshot) {
    if (!screenshot) return null;

    const lang = state.currentLanguage;

    // Try current language first
    if (screenshot.localizedImages?.[lang]?.image) {
        return screenshot.localizedImages[lang].image;
    }

    // Fallback to first available language in project order
    for (const l of state.projectLanguages) {
        if (screenshot.localizedImages?.[l]?.image) {
            return screenshot.localizedImages[l].image;
        }
    }

    // Fallback to any available language
    if (screenshot.localizedImages) {
        for (const l of Object.keys(screenshot.localizedImages)) {
            if (screenshot.localizedImages[l]?.image) {
                return screenshot.localizedImages[l].image;
            }
        }
    }

    // Legacy fallback for old screenshot format
    return screenshot.image || null;
}

/**
 * Get list of languages that have images for a screenshot
 * @param {Object} screenshot - The screenshot object
 * @returns {string[]} - Array of language codes that have images
 */
function getAvailableLanguagesForScreenshot(screenshot) {
    if (!screenshot?.localizedImages) return [];

    return Object.keys(screenshot.localizedImages).filter(
        lang => screenshot.localizedImages[lang]?.image
    );
}

/**
 * Check if a screenshot has images for all project languages
 * @param {Object} screenshot - The screenshot object
 * @returns {boolean} - True if all project languages have images
 */
function isScreenshotComplete(screenshot) {
    if (!screenshot?.localizedImages) return false;
    if (state.projectLanguages.length === 0) return true;

    return state.projectLanguages.every(
        lang => screenshot.localizedImages[lang]?.image
    );
}

/**
 * Migrate old screenshot format to new localized format
 * Moves image to localizedImages.en (or detected language)
 * @param {Object} screenshot - The screenshot object to migrate
 * @param {string} detectedLang - Optional detected language from filename
 */
function migrateScreenshotToLocalized(screenshot, detectedLang = 'en') {
    if (!screenshot) return;

    // Already migrated
    if (screenshot.localizedImages && Object.keys(screenshot.localizedImages).length > 0) {
        return;
    }

    // Initialize localizedImages if needed
    if (!screenshot.localizedImages) {
        screenshot.localizedImages = {};
    }

    // Move legacy image to localized storage
    if (screenshot.image) {
        screenshot.localizedImages[detectedLang] = {
            image: screenshot.image,
            src: screenshot.image.src,
            name: screenshot.name || 'screenshot.png'
        };
    }
}

/**
 * Add a localized image to a screenshot
 * @param {number} screenshotIndex - Index of the screenshot
 * @param {string} lang - Language code
 * @param {Image} image - The Image object
 * @param {string} src - Data URL of the image
 * @param {string} name - Filename
 */
function addLocalizedImage(screenshotIndex, lang, image, src, name) {
    const screenshot = state.screenshots[screenshotIndex];
    if (!screenshot) return;

    if (!screenshot.localizedImages) {
        screenshot.localizedImages = {};
    }

    screenshot.localizedImages[lang] = {
        image: image,
        src: src,
        name: name
    };

    // Auto-add language to project if not already present
    if (!state.projectLanguages.includes(lang)) {
        addProjectLanguage(lang);
    }

    // Update displays
    updateScreenshotList();
    updateCanvas();
    saveState();
}

/**
 * Remove a localized image from a screenshot
 * @param {number} screenshotIndex - Index of the screenshot
 * @param {string} lang - Language code to remove
 */
function removeLocalizedImage(screenshotIndex, lang) {
    const screenshot = state.screenshots[screenshotIndex];
    if (!screenshot?.localizedImages?.[lang]) return;

    delete screenshot.localizedImages[lang];

    // Update displays
    updateScreenshotList();
    updateCanvas();
    saveState();

    // Refresh modal if open
    if (currentTranslationsIndex === screenshotIndex) {
        updateScreenshotTranslationsList();
    }
}

// ==========================================
// Screenshot Translations Modal Functions
// ==========================================

/**
 * Open the screenshot translations modal for a specific screenshot
 * @param {number} index - Index of the screenshot to manage
 */
function openScreenshotTranslationsModal(index) {
    currentTranslationsIndex = index;
    const modal = document.getElementById('screenshot-translations-modal');
    if (!modal) return;

    modal.classList.add('visible');
    updateScreenshotTranslationsList();
}

/**
 * Close the screenshot translations modal
 */
function closeScreenshotTranslationsModal() {
    currentTranslationsIndex = null;
    const modal = document.getElementById('screenshot-translations-modal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

/**
 * Update the list of languages in the translations modal
 */
function updateScreenshotTranslationsList() {
    const container = document.getElementById('screenshot-translations-list');
    if (!container || currentTranslationsIndex === null) return;

    const screenshot = state.screenshots[currentTranslationsIndex];
    if (!screenshot) return;

    container.innerHTML = '';

    state.projectLanguages.forEach(lang => {
        const hasImage = screenshot.localizedImages?.[lang]?.image;
        const flag = languageFlags[lang] || '🏳️';
        const name = getLanguageLabel(lang);

        const item = document.createElement('div');
        item.className = 'translation-item' + (hasImage ? ' has-image' : '');

        if (hasImage) {
            // Create thumbnail
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 40;
            thumbCanvas.height = 86;
            const ctx = thumbCanvas.getContext('2d');
            const img = screenshot.localizedImages[lang].image;
            const scale = Math.min(40 / img.width, 86 / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(img, (40 - w) / 2, (86 - h) / 2, w, h);

            item.innerHTML = `
                <div class="translation-thumb">
                    <img src="${thumbCanvas.toDataURL()}" alt="${name}">
                </div>
                <div class="translation-info">
                    <span class="flag">${flag}</span>
                    <span class="name">${name}</span>
                </div>
                <button class="translation-remove" title="Remove ${name} screenshot">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            `;

            item.querySelector('.translation-remove').addEventListener('click', () => {
                removeLocalizedImage(currentTranslationsIndex, lang);
            });
        } else {
            item.innerHTML = `
                <div class="translation-thumb empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                    </svg>
                </div>
                <div class="translation-info">
                    <span class="flag">${flag}</span>
                    <span class="name">${name}</span>
                </div>
                <button class="translation-upload" title="Upload ${name} screenshot">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload
                </button>
            `;

            item.querySelector('.translation-upload').addEventListener('click', () => {
                uploadScreenshotForLanguage(lang);
            });
        }

        container.appendChild(item);
    });
}

/**
 * Trigger file upload for a specific language
 * @param {string} lang - Language code to upload for
 */
function uploadScreenshotForLanguage(lang) {
    const input = document.getElementById('translation-file-input');
    if (!input) return;

    // Store the target language
    input.dataset.targetLang = lang;
    input.click();
}

/**
 * Handle file selection for translation upload
 * @param {Event} event - The change event from file input
 */
function handleTranslationFileSelect(event) {
    const input = event.target;
    const lang = input.dataset.targetLang;
    const file = input.files?.[0];

    if (!file || !lang || currentTranslationsIndex === null) {
        input.value = '';
        return;
    }

    if (!file.type.startsWith('image/')) {
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            addLocalizedImage(currentTranslationsIndex, lang, img, e.target.result, file.name);
            updateScreenshotTranslationsList();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    input.value = '';
}

// ==========================================
// Export Language Dialog Functions
// ==========================================

/**
 * Show export language choice dialog
 * @param {Function} callback - Function to call with choice ('current' or 'all')
 */
function showExportLanguageDialog(callback) {
    const modal = document.getElementById('export-language-modal');
    if (!modal) {
        // Fallback if modal doesn't exist
        callback('current');
        return;
    }

    // Store callback for later
    window._exportLanguageCallback = callback;

    // Update current language display
    const currentLangDisplay = document.getElementById('export-current-lang');
    if (currentLangDisplay) {
        const flag = languageFlags[state.currentLanguage] || '🏳️';
        const name = getLanguageLabel(state.currentLanguage);
        currentLangDisplay.textContent = `${flag} ${name}`;
    }

    modal.classList.add('visible');
}

/**
 * Close export language dialog and execute callback
 * @param {string} choice - 'current' or 'all'
 */
function closeExportLanguageDialog(choice) {
    const modal = document.getElementById('export-language-modal');
    if (modal) {
        modal.classList.remove('visible');
    }

    if (window._exportLanguageCallback && choice) {
        window._exportLanguageCallback(choice);
        window._exportLanguageCallback = null;
    }
}

// ==========================================
// Duplicate Screenshot Dialog Functions
// ==========================================

// Queue for pending duplicate resolution
let duplicateQueue = [];
let currentDuplicateResolve = null;

/**
 * Show duplicate screenshot dialog
 * @param {Object} params - Parameters for the dialog
 * @param {number} params.existingIndex - Index of existing screenshot
 * @param {string} params.detectedLang - Detected language of new file
 * @param {Image} params.newImage - New image object
 * @param {string} params.newSrc - Data URL of new image
 * @param {string} params.newName - Filename of new file
 * @returns {Promise<string>} - User choice: 'replace', 'create', or 'ignore'
 */
function showDuplicateDialog(params) {
    return new Promise((resolve) => {
        currentDuplicateResolve = resolve;

        const modal = document.getElementById('duplicate-screenshot-modal');
        if (!modal) {
            resolve('create'); // fallback
            return;
        }

        const screenshot = state.screenshots[params.existingIndex];
        const existingThumb = document.getElementById('duplicate-existing-thumb');
        const newThumb = document.getElementById('duplicate-new-thumb');
        const existingName = document.getElementById('duplicate-existing-name');
        const newName = document.getElementById('duplicate-new-name');
        const langNameEl = document.getElementById('duplicate-lang-name');

        // Get existing thumbnail for the specific language being replaced
        const existingLangImg = screenshot.localizedImages?.[params.detectedLang]?.image;
        if (existingThumb) {
            if (existingLangImg) {
                existingThumb.innerHTML = `<img src="${existingLangImg.src}" alt="Existing">`;
            } else {
                // No existing image for this language - show empty placeholder
                existingThumb.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-secondary); opacity: 0.5;">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                    </svg>
                `;
            }
        }

        // Set new thumbnail
        if (newThumb && params.newImage) {
            newThumb.innerHTML = `<img src="${params.newSrc}" alt="New">`;
        }

        // Set filenames
        if (existingName) {
            const existingLangName = screenshot.localizedImages?.[params.detectedLang]?.name;
            if (existingLangName) {
                existingName.textContent = existingLangName;
            } else {
                // Show that no image exists for this language yet
                const flag = languageFlags[params.detectedLang] || '🏳️';
                existingName.textContent = `No ${flag} image`;
            }
        }
        if (newName) {
            newName.textContent = params.newName;
        }

        // Set language name in replace description
        if (langNameEl) {
            const flag = languageFlags[params.detectedLang] || '🏳️';
            const name = languageNames[params.detectedLang] || params.detectedLang.toUpperCase();
            langNameEl.textContent = `${flag} ${name}`;
        }

        // Store params for handlers
        modal.dataset.existingIndex = params.existingIndex;
        modal.dataset.detectedLang = params.detectedLang;
        window._duplicateNewImage = params.newImage;
        window._duplicateNewSrc = params.newSrc;
        window._duplicateNewName = params.newName;

        modal.classList.add('visible');
    });
}

/**
 * Close duplicate dialog with a choice
 * @param {string} choice - 'replace', 'create', or 'ignore'
 */
function closeDuplicateDialog(choice) {
    const modal = document.getElementById('duplicate-screenshot-modal');
    if (modal) {
        modal.classList.remove('visible');
    }

    if (currentDuplicateResolve) {
        currentDuplicateResolve(choice);
        currentDuplicateResolve = null;
    }

    // Clean up stored data
    window._duplicateNewImage = null;
    window._duplicateNewSrc = null;
    window._duplicateNewName = null;
}

/**
 * Initialize duplicate dialog event listeners
 */
function initDuplicateDialogListeners() {
    const replaceBtn = document.getElementById('duplicate-replace');
    const createBtn = document.getElementById('duplicate-create-new');
    const ignoreBtn = document.getElementById('duplicate-ignore');

    if (replaceBtn) {
        replaceBtn.addEventListener('click', () => closeDuplicateDialog('replace'));
    }
    if (createBtn) {
        createBtn.addEventListener('click', () => closeDuplicateDialog('create'));
    }
    if (ignoreBtn) {
        ignoreBtn.addEventListener('click', () => closeDuplicateDialog('ignore'));
    }
}


// ==========================================
// Language Metadata + Translation Management
// ==========================================

// Single source of truth for language metadata.
const languages = {
    'en': { name: 'English (US)', flag: '🇺🇸', asc_code: 'en-US', name_zh: '英语（美国）' },
    'en-au': { name: 'English (Australia)', flag: '🇦🇺', asc_code: 'en-AU', name_zh: '英语（澳大利亚）' },
    'en-ca': { name: 'English (Canada)', flag: '🇨🇦', asc_code: 'en-CA', name_zh: '英语（加拿大）' },
    'en-gb': { name: 'English (UK)', flag: '🇬🇧', asc_code: 'en-GB', name_zh: '英语（英国）' },
    'de': { name: 'German', flag: '🇩🇪', asc_code: 'de-DE', name_zh: '德语' },
    'fr': { name: 'French', flag: '🇫🇷', asc_code: 'fr-FR', name_zh: '法语' },
    'fr-ca': { name: 'French (Canada)', flag: '🇨🇦', asc_code: 'fr-CA', name_zh: '法语（加拿大）' },
    'es': { name: 'Spanish', flag: '🇪🇸', asc_code: 'es-ES', name_zh: '西班牙语（西班牙）' },
    'es-mx': { name: 'Spanish (Mexico)', flag: '🇲🇽', asc_code: 'es-MX', name_zh: '西班牙语（墨西哥）' },
    'it': { name: 'Italian', flag: '🇮🇹', asc_code: 'it', name_zh: '意大利语' },
    'pt': { name: 'Portuguese', flag: '🇵🇹', asc_code: 'pt-PT', name_zh: '葡萄牙语（葡萄牙）' },
    'pt-br': { name: 'Portuguese (BR)', flag: '🇧🇷', asc_code: 'pt-BR', name_zh: '葡萄牙语（巴西）' },
    'nl': { name: 'Dutch', flag: '🇳🇱', asc_code: 'nl-NL', name_zh: '荷兰语' },
    'ru': { name: 'Russian', flag: '🇷🇺', asc_code: 'ru-RU', name_zh: '俄语' },
    'ja': { name: 'Japanese', flag: '🇯🇵', asc_code: 'ja', name_zh: '日语' },
    'ko': { name: 'Korean', flag: '🇰🇷', asc_code: 'ko', name_zh: '韩语' },
    'zh-hans': { name: 'Chinese (Simplified)', flag: '🇨🇳', asc_code: 'zh-Hans', name_zh: '中文（简体）' },
    'zh-hant': { name: 'Chinese (Traditional)', flag: '🇨🇳', asc_code: 'zh-Hant', name_zh: '中文（繁体）' },
    'ar': { name: 'Arabic', flag: '🇸🇦', asc_code: 'ar-SA', name_zh: '阿拉伯语' },
    'ca': { name: 'Catalan', flag: '🇪🇸', asc_code: 'ca', name_zh: '加泰罗尼亚语' },
    'cs': { name: 'Czech', flag: '🇨🇿', asc_code: 'cs', name_zh: '捷克语' },
    'el': { name: 'Greek', flag: '🇬🇷', asc_code: 'el', name_zh: '希腊语' },
    'he': { name: 'Hebrew', flag: '🇮🇱', asc_code: 'he', name_zh: '希伯来语' },
    'hi': { name: 'Hindi', flag: '🇮🇳', asc_code: 'hi-IN', name_zh: '印地语' },
    'hr': { name: 'Croatian', flag: '🇭🇷', asc_code: 'hr', name_zh: '克罗地亚语' },
    'hu': { name: 'Hungarian', flag: '🇭🇺', asc_code: 'hu', name_zh: '匈牙利语' },
    'tr': { name: 'Turkish', flag: '🇹🇷', asc_code: 'tr-TR', name_zh: '土耳其语' },
    'pl': { name: 'Polish', flag: '🇵🇱', asc_code: 'pl-PL', name_zh: '波兰语' },
    'ro': { name: 'Romanian', flag: '🇷🇴', asc_code: 'ro', name_zh: '罗马尼亚语' },
    'sk': { name: 'Slovak', flag: '🇸🇰', asc_code: 'sk', name_zh: '斯洛伐克语' },
    'sv': { name: 'Swedish', flag: '🇸🇪', asc_code: 'sv-SE', name_zh: '瑞典语' },
    'da': { name: 'Danish', flag: '🇩🇰', asc_code: 'da-DK', name_zh: '丹麦语' },
    'no': { name: 'Norwegian', flag: '🇳🇴', asc_code: 'no-NO', name_zh: '挪威语（书面挪威语）' },
    'fi': { name: 'Finnish', flag: '🇫🇮', asc_code: 'fi-FI', name_zh: '芬兰语' },
    'th': { name: 'Thai', flag: '🇹🇭', asc_code: 'th', name_zh: '泰语' },
    'vi': { name: 'Vietnamese', flag: '🇻🇳', asc_code: 'vi', name_zh: '越南语' },
    'ms': { name: 'Malay', flag: '🇲🇾', asc_code: 'ms', name_zh: '马来语' },
    'id': { name: 'Indonesian', flag: '🇮🇩', asc_code: 'id', name_zh: '印度尼西亚语' },
    'uk': { name: 'Ukrainian', flag: '🇺🇦', asc_code: 'uk-UA', name_zh: '乌克兰语' }
};

// Backward-compatible lookup tables used by existing code paths.
const languageNames = Object.fromEntries(
    Object.entries(languages).map(([code, meta]) => [code, meta.name])
);
const languageFlags = Object.fromEntries(
    Object.entries(languages).map(([code, meta]) => [code, meta.flag])
);

function getLanguageLabel(lang) {
    const meta = languages[lang] || {};
    const enName = meta.name || languageNames[lang] || lang.toUpperCase();
    const zhName = meta.name_zh;
    if (!zhName || zhName === enName) return enName;
    return `${enName} / ${zhName}`;
}

// Global language picker functions
function updateLanguageMenu() {
    const container = document.getElementById('language-menu-items');
    container.innerHTML = '';

    state.projectLanguages.forEach(lang => {
        const btn = document.createElement('button');
        btn.className = 'language-menu-item' + (lang === state.currentLanguage ? ' active' : '');
        btn.innerHTML = `<span class="flag">${languageFlags[lang] || '🏳️'}</span> ${getLanguageLabel(lang)}`;
        btn.onclick = () => {
            switchGlobalLanguage(lang);
            document.getElementById('language-menu').classList.remove('visible');
        };
        container.appendChild(btn);
    });
}

function updateLanguageButton() {
    const flag = languageFlags[state.currentLanguage] || '🏳️';
    document.getElementById('language-btn-flag').textContent = flag;
}

function switchGlobalLanguage(lang) {
    state.currentLanguage = lang;

    // Update all screenshots to use this language for display
    state.screenshots.forEach(screenshot => {
        screenshot.text.currentHeadlineLang = lang;
        screenshot.text.currentSubheadlineLang = lang;
    });

    // Update UI
    updateLanguageButton();
    syncUIWithState();
    updateCanvas();
    saveState();
}

// Languages modal functions
function openLanguagesModal() {
    document.getElementById('language-menu').classList.remove('visible');
    document.getElementById('languages-modal').classList.add('visible');
    updateLanguagesList();
    updateAddLanguageSelect();
    const modeSelect = document.getElementById('add-language-mode-select');
    if (modeSelect) {
        modeSelect.value = 'single';
        handleAddLanguageModeChange('single');
    }
}

function closeLanguagesModal() {
    document.getElementById('languages-modal').classList.remove('visible');
}

function updateLanguagesList() {
    const container = document.getElementById('languages-list');
    container.innerHTML = '';

    state.projectLanguages.forEach(lang => {
        const item = document.createElement('div');
        item.className = 'language-item';

        const flag = languageFlags[lang] || '🏳️';
        const name = getLanguageLabel(lang);
        const isCurrent = lang === state.currentLanguage;
        const isOnly = state.projectLanguages.length === 1;

        item.innerHTML = `
            <span class="flag">${flag}</span>
            <span class="name">${name}</span>
            ${isCurrent ? '<span class="current-badge">Current</span>' : ''}
            <button class="remove-btn" ${isOnly ? 'disabled' : ''} title="${isOnly ? 'Cannot remove the only language' : 'Remove language'}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        `;

        const removeBtn = item.querySelector('.remove-btn');
        if (!isOnly) {
            removeBtn.addEventListener('click', () => removeProjectLanguage(lang));
        }

        container.appendChild(item);
    });
}

function updateAddLanguageSelect() {
    const singleSelect = document.getElementById('add-language-select');
    const multiSelect = document.getElementById('add-language-multi-select');
    if (!singleSelect || !multiSelect) return;

    singleSelect.innerHTML = '<option value="">Add a language...</option>';
    multiSelect.innerHTML = '';

    let availableCount = 0;

    // Add all available languages that aren't already in the project
    Object.keys(languageNames).forEach(lang => {
        if (state.projectLanguages.includes(lang)) return;

        const flag = languageFlags[lang] || '🏳️';
        const name = getLanguageLabel(lang);
        const label = `${flag} ${name}`;

        const singleOption = document.createElement('option');
        singleOption.value = lang;
        singleOption.textContent = label;
        singleSelect.appendChild(singleOption);

        const multiOption = document.createElement('option');
        multiOption.value = lang;
        multiOption.textContent = label;
        multiSelect.appendChild(multiOption);

        availableCount++;
    });

    const addAllBtn = document.getElementById('add-language-all-btn');
    const addSelectedBtn = document.getElementById('add-language-apply-btn');
    const selectAllBtn = document.getElementById('add-language-select-all-btn');

    const noneLeft = availableCount === 0;
    if (addAllBtn) addAllBtn.disabled = noneLeft;
    if (addSelectedBtn) addSelectedBtn.disabled = noneLeft;
    if (selectAllBtn) selectAllBtn.disabled = noneLeft;
}

function handleAddLanguageModeChange(mode) {
    const singleMode = document.getElementById('add-language-single-mode');
    const multiMode = document.getElementById('add-language-multi-mode');
    const allMode = document.getElementById('add-language-all-mode');
    if (!singleMode || !multiMode || !allMode) return;

    singleMode.style.display = mode === 'single' ? '' : 'none';
    multiMode.style.display = mode === 'multi' ? '' : 'none';
    allMode.style.display = mode === 'all' ? '' : 'none';
}

function addSelectedProjectLanguages() {
    const select = document.getElementById('add-language-multi-select');
    if (!select) return;
    const selectedLangs = Array.from(select.selectedOptions).map(option => option.value).filter(Boolean);
    selectedLangs.forEach(lang => addProjectLanguage(lang));
}

function addAllProjectLanguages() {
    const allLangs = Object.keys(languageNames).filter(lang => !state.projectLanguages.includes(lang));
    allLangs.forEach(lang => addProjectLanguage(lang));
}

function selectAllAddLanguageOptions() {
    const select = document.getElementById('add-language-multi-select');
    if (!select) return;
    Array.from(select.options).forEach(option => {
        option.selected = true;
    });
}

function addProjectLanguage(lang) {
    if (!lang || state.projectLanguages.includes(lang)) return;

    state.projectLanguages.push(lang);

    // Add the language to all screenshots' text settings
    state.screenshots.forEach(screenshot => {
        if (!screenshot.text.headlineLanguages.includes(lang)) {
            screenshot.text.headlineLanguages.push(lang);
            if (!screenshot.text.headlines) screenshot.text.headlines = { en: '' };
            screenshot.text.headlines[lang] = '';
        }
        if (!screenshot.text.subheadlineLanguages.includes(lang)) {
            screenshot.text.subheadlineLanguages.push(lang);
            if (!screenshot.text.subheadlines) screenshot.text.subheadlines = { en: '' };
            screenshot.text.subheadlines[lang] = '';
        }
    });

    // Also update defaults
    if (!state.defaults.text.headlineLanguages.includes(lang)) {
        state.defaults.text.headlineLanguages.push(lang);
        if (!state.defaults.text.headlines) state.defaults.text.headlines = { en: '' };
        state.defaults.text.headlines[lang] = '';
    }
    if (!state.defaults.text.subheadlineLanguages.includes(lang)) {
        state.defaults.text.subheadlineLanguages.push(lang);
        if (!state.defaults.text.subheadlines) state.defaults.text.subheadlines = { en: '' };
        state.defaults.text.subheadlines[lang] = '';
    }

    updateLanguagesList();
    updateAddLanguageSelect();
    updateLanguageMenu();
    saveState();
}

function removeProjectLanguage(lang) {
    if (state.projectLanguages.length <= 1) return; // Must have at least one language

    const index = state.projectLanguages.indexOf(lang);
    if (index > -1) {
        state.projectLanguages.splice(index, 1);

        // If removing the current language, switch to the first available
        if (state.currentLanguage === lang) {
            switchGlobalLanguage(state.projectLanguages[0]);
        }

        // Remove from all screenshots
        state.screenshots.forEach(screenshot => {
            const hIndex = screenshot.text.headlineLanguages.indexOf(lang);
            if (hIndex > -1) {
                screenshot.text.headlineLanguages.splice(hIndex, 1);
                delete screenshot.text.headlines[lang];
            }
            const sIndex = screenshot.text.subheadlineLanguages.indexOf(lang);
            if (sIndex > -1) {
                screenshot.text.subheadlineLanguages.splice(sIndex, 1);
                delete screenshot.text.subheadlines[lang];
            }
            if (screenshot.text.currentHeadlineLang === lang) {
                screenshot.text.currentHeadlineLang = state.projectLanguages[0];
            }
            if (screenshot.text.currentSubheadlineLang === lang) {
                screenshot.text.currentSubheadlineLang = state.projectLanguages[0];
            }
        });

        // Remove from defaults
        const dhIndex = state.defaults.text.headlineLanguages.indexOf(lang);
        if (dhIndex > -1) {
            state.defaults.text.headlineLanguages.splice(dhIndex, 1);
            delete state.defaults.text.headlines[lang];
        }
        const dsIndex = state.defaults.text.subheadlineLanguages.indexOf(lang);
        if (dsIndex > -1) {
            state.defaults.text.subheadlineLanguages.splice(dsIndex, 1);
            delete state.defaults.text.subheadlines[lang];
        }

        updateLanguagesList();
        updateAddLanguageSelect();
        updateLanguageMenu();
        updateLanguageButton();
        syncUIWithState();
        saveState();
    }
}

// Language helper functions
function addHeadlineLanguage(lang, flag) {
    const text = getTextSettings();
    if (!text.headlineLanguages.includes(lang)) {
        text.headlineLanguages.push(lang);
        if (!text.headlines) text.headlines = { en: '' };
        text.headlines[lang] = '';
        updateHeadlineLanguageUI();
        switchHeadlineLanguage(lang);
        saveState();
    }
}

function addSubheadlineLanguage(lang, flag) {
    const text = getTextSettings();
    if (!text.subheadlineLanguages.includes(lang)) {
        text.subheadlineLanguages.push(lang);
        if (!text.subheadlines) text.subheadlines = { en: '' };
        text.subheadlines[lang] = '';
        updateSubheadlineLanguageUI();
        switchSubheadlineLanguage(lang);
        saveState();
    }
}

function removeHeadlineLanguage(lang) {
    const text = getTextSettings();
    if (lang === 'en') return; // Can't remove default

    const index = text.headlineLanguages.indexOf(lang);
    if (index > -1) {
        text.headlineLanguages.splice(index, 1);
        delete text.headlines[lang];

        if (text.currentHeadlineLang === lang) {
            text.currentHeadlineLang = 'en';
        }

        updateHeadlineLanguageUI();
        switchHeadlineLanguage(text.currentHeadlineLang);
        saveState();
    }
}

function removeSubheadlineLanguage(lang) {
    const text = getTextSettings();
    if (lang === 'en') return; // Can't remove default

    const index = text.subheadlineLanguages.indexOf(lang);
    if (index > -1) {
        text.subheadlineLanguages.splice(index, 1);
        delete text.subheadlines[lang];

        if (text.currentSubheadlineLang === lang) {
            text.currentSubheadlineLang = 'en';
        }

        updateSubheadlineLanguageUI();
        switchSubheadlineLanguage(text.currentSubheadlineLang);
        saveState();
    }
}

function switchHeadlineLanguage(lang) {
    const text = getTextSettings();
    text.currentHeadlineLang = lang;
    text.currentLayoutLang = lang;

    // Sync text inputs and layout controls for this language
    updateTextUI(text);
    updateCanvas();
}

function switchSubheadlineLanguage(lang) {
    const text = getTextSettings();
    text.currentSubheadlineLang = lang;
    text.currentLayoutLang = lang;

    // Sync text inputs and layout controls for this language
    updateTextUI(text);
    updateCanvas();
}

function updateHeadlineLanguageUI() {
    // Language flag UI removed - translations now managed through translate modal
}

function updateSubheadlineLanguageUI() {
    // Language flag UI removed - translations now managed through translate modal
}

// Translate modal functions
let currentTranslateTarget = null;

function openTranslateModal(target) {
    currentTranslateTarget = target;
    const text = getTextSettings();
    const isHeadline = target === 'headline';
    const isElement = target === 'element';

    let languages, texts;
    if (isElement) {
        const el = getSelectedElement();
        if (!el || el.type !== 'text') return;
        document.getElementById('translate-target-type').textContent = 'Element Text';
        languages = state.projectLanguages;
        if (!el.texts) el.texts = {};
        texts = el.texts;
    } else {
        document.getElementById('translate-target-type').textContent = isHeadline ? 'Headline' : 'Subheadline';
        languages = isHeadline ? text.headlineLanguages : text.subheadlineLanguages;
        texts = isHeadline ? text.headlines : text.subheadlines;
    }

    // Populate source language dropdown (first language selected by default)
    const sourceSelect = document.getElementById('translate-source-lang');
    sourceSelect.innerHTML = '';
    languages.forEach((lang, index) => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = `${languageFlags[lang]} ${getLanguageLabel(lang)}`;
        if (index === 0) option.selected = true;
        sourceSelect.appendChild(option);
    });

    // Update source preview
    updateTranslateSourcePreview();

    // Populate target languages
    const targetsContainer = document.getElementById('translate-targets');
    targetsContainer.innerHTML = '';

    languages.forEach(lang => {
        const item = document.createElement('div');
        item.className = 'translate-target-item';
        item.dataset.lang = lang;
        item.innerHTML = `
            <div class="translate-target-header">
                <span class="flag">${languageFlags[lang]}</span>
                <span>${getLanguageLabel(lang)}</span>
            </div>
            <textarea placeholder="Enter ${getLanguageLabel(lang)} translation...">${texts[lang] || ''}</textarea>
        `;
        targetsContainer.appendChild(item);
    });

    document.getElementById('translate-modal').classList.add('visible');
}

function updateTranslateSourcePreview() {
    const sourceLang = document.getElementById('translate-source-lang').value;
    let sourceText;
    if (currentTranslateTarget === 'element') {
        const el = getSelectedElement();
        sourceText = el && el.texts ? (el.texts[sourceLang] || '') : '';
    } else {
        const text = getTextSettings();
        const isHeadline = currentTranslateTarget === 'headline';
        const texts = isHeadline ? text.headlines : text.subheadlines;
        sourceText = texts[sourceLang] || '';
    }

    document.getElementById('source-text-preview').textContent = sourceText || 'No text entered';
}

function applyTranslations() {
    const isElement = currentTranslateTarget === 'element';

    if (isElement) {
        const el = getSelectedElement();
        if (!el) return;
        if (!el.texts) el.texts = {};

        document.querySelectorAll('#translate-targets .translate-target-item').forEach(item => {
            const lang = item.dataset.lang;
            const textarea = item.querySelector('textarea');
            el.texts[lang] = textarea.value;
        });
        el.text = getElementText(el); // sync for backwards compat
        document.getElementById('element-text-input').value = getElementText(el);
    } else {
        const text = getTextSettings();
        const isHeadline = currentTranslateTarget === 'headline';
        const texts = isHeadline ? text.headlines : text.subheadlines;

        document.querySelectorAll('#translate-targets .translate-target-item').forEach(item => {
            const lang = item.dataset.lang;
            const textarea = item.querySelector('textarea');
            texts[lang] = textarea.value;
        });

        const currentLang = isHeadline ? text.currentHeadlineLang : text.currentSubheadlineLang;
        if (isHeadline) {
            document.getElementById('headline-text').value = texts[currentLang] || '';
        } else {
            document.getElementById('subheadline-text').value = texts[currentLang] || '';
            text.subheadlineEnabled = true;
            syncUIWithState();
        }
    }

    saveState();
    updateCanvas();
}

// Protect rich-text tags/placeholders before translation, then restore afterward.
function protectTranslatableText(text) {
    const source = String(text || '');
    const protectedTokens = [];
    const tokenRegex = /\[[^[\]]+\]|\{\{[^{}]+\}\}|\$\{[^{}]+\}|\{[a-zA-Z0-9_.-]+\}|%(?:\d+\$)?[sdif]|%%/g;

    const protectedText = source.replace(tokenRegex, (match) => {
        const token = `__NT_${protectedTokens.length}__`;
        protectedTokens.push(match);
        return token;
    });

    return { protectedText, protectedTokens };
}

function restoreProtectedTokens(text, protectedTokens) {
    let restored = String(text || '');
    protectedTokens.forEach((original, index) => {
        const token = `__NT_${index}__`;
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        restored = restored.replace(new RegExp(escaped, 'gi'), original);
    });
    return restored;
}

async function aiTranslateAll() {
    const sourceLang = document.getElementById('translate-source-lang').value;
    const isElement = currentTranslateTarget === 'element';
    let texts, languages, sourceText;
    if (isElement) {
        const el = getSelectedElement();
        if (!el) return;
        texts = el.texts || {};
        languages = state.projectLanguages;
        sourceText = texts[sourceLang] || '';
    } else {
        const text = getTextSettings();
        const isHeadline = currentTranslateTarget === 'headline';
        texts = isHeadline ? text.headlines : text.subheadlines;
        languages = isHeadline ? text.headlineLanguages : text.subheadlineLanguages;
        sourceText = texts[sourceLang] || '';
    }

    if (!sourceText.trim()) {
        setTranslateStatus('Please enter text in the source language first', 'error');
        return;
    }

    const protectedSource = protectTranslatableText(sourceText);

    // Get target languages (all except source)
    const targetLangs = languages.filter(lang => lang !== sourceLang);

    if (targetLangs.length === 0) {
        setTranslateStatus('Add more languages to translate to', 'error');
        return;
    }

    // Get selected provider and API key
    const provider = getSelectedProvider();
    const providerConfig = llmProviders[provider];
    const apiKey = localStorage.getItem(providerConfig.storageKey);

    if (!apiKey) {
        setTranslateStatus(`Add your LLM API key in Settings to use AI translation.`, 'error');
        return;
    }

    const btn = document.getElementById('ai-translate-btn');
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4m0 12v4m-8-10h4m12 0h4m-5.66-5.66l-2.83 2.83m-5.66 5.66l-2.83 2.83m14.14 0l-2.83-2.83M6.34 6.34L3.51 3.51"/>
        </svg>
        <span>Translating...</span>
    `;

    setTranslateStatus(`Translating to ${targetLangs.length} language(s) with ${providerConfig.name}...`, '');

    // Mark all target items as translating
    targetLangs.forEach(lang => {
        const item = document.querySelector(`.translate-target-item[data-lang="${lang}"]`);
        if (item) item.classList.add('translating');
    });

    try {
        // Build the translation prompt
        const targetLanguageList = targetLangs
            .map(lang => `- ${languageNames[lang] || lang} [${lang}]`)
            .join('\n');

        const prompt = `You are a professional translator for App Store screenshot marketing copy.

Translate the following text from ${languageNames[sourceLang]} into the target languages.

The text is a short marketing headline/tagline for an app that must fit on a screenshot, so keep translations:
- SIMILAR LENGTH to the original - do NOT make it longer, as it must fit on screen
- Concise and punchy
- Marketing-focused and compelling
- Culturally appropriate for each target market
- Natural-sounding in each language

IMPORTANT: The translated text will be displayed on app screenshots with limited space. If the source text is short, the translation MUST also be short. Prioritize brevity over literal accuracy.

Source text (${languageNames[sourceLang]}):
"${protectedSource.protectedText}"

TOKEN RULES (CRITICAL):
- Any token in the format __NT_0__, __NT_1__, etc. must remain EXACTLY unchanged.
- Do not translate, remove, reorder, or reformat these tokens.
- Keep these tokens in the same relative position as the source.

Target languages (name [code]):
${targetLanguageList}

Respond ONLY with a valid JSON object mapping language codes to translations. Do not include any other text.
Use locale codes as keys (for example: "de", "fr-ca"). Do not use language names as keys.
Example format:
{"de": "German translation", "fr": "French translation"}
`;

        let responseText;

        if (provider === 'anthropic') {
            responseText = await translateWithAnthropic(apiKey, prompt);
        } else if (provider === 'openai') {
            responseText = await translateWithOpenAI(apiKey, prompt);
        } else if (provider === 'google') {
            responseText = await translateWithGoogle(apiKey, prompt);
        }

        // Clean up response - remove markdown code blocks if present
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const translations = JSON.parse(responseText);

        // Apply translations to the textareas
        let translatedCount = 0;
        targetLangs.forEach(lang => {
            if (translations[lang]) {
                const item = document.querySelector(`.translate-target-item[data-lang="${lang}"]`);
                if (item) {
                    const textarea = item.querySelector('textarea');
                    textarea.value = restoreProtectedTokens(translations[lang], protectedSource.protectedTokens);
                    translatedCount++;
                }
            }
        });

        setTranslateStatus(`✓ Translated to ${translatedCount} language(s)`, 'success');

    } catch (error) {
        console.error('Translation error:', error);

        if (error.message === 'Failed to fetch') {
            setTranslateStatus('Connection failed. Check your API key in Settings.', 'error');
        } else if (error.message === 'AI_UNAVAILABLE' || error.message.includes('401') || error.message.includes('403')) {
            setTranslateStatus('Invalid API key. Update it in Settings (gear icon).', 'error');
        } else {
            setTranslateStatus('Translation failed: ' + error.message, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span>Auto-translate with AI</span>
        `;

        // Remove translating state
        document.querySelectorAll('.translate-target-item').forEach(item => {
            item.classList.remove('translating');
        });
    }
}

// Helper function to show styled alert modal
function showAppAlert(message, type = 'info') {
    return new Promise((resolve) => {
        const iconBg = type === 'error' ? 'rgba(255, 69, 58, 0.2)' :
            type === 'success' ? 'rgba(52, 199, 89, 0.2)' :
                'rgba(10, 132, 255, 0.2)';
        const iconColor = type === 'error' ? '#ff453a' :
            type === 'success' ? '#34c759' :
                'var(--accent)';
        const iconPath = type === 'error' ? '<path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' :
            type === 'success' ? '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' :
                '<path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay visible';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-icon" style="background: ${iconBg};">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: ${iconColor};">
                        ${iconPath}
                    </svg>
                </div>
                <p class="modal-message" style="margin: 16px 0;">${message}</p>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-confirm" style="background: var(--accent);">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const okBtn = overlay.querySelector('.modal-btn-confirm');
        const close = () => {
            overlay.remove();
            resolve();
        };
        okBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    });
}

// Helper function to show styled confirm modal
function showAppConfirm(message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay visible';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-icon" style="background: rgba(10, 132, 255, 0.2);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent);">
                        <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <p class="modal-message" style="margin: 16px 0; white-space: pre-line;">${message}</p>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-cancel">${cancelText}</button>
                    <button class="modal-btn modal-btn-confirm" style="background: var(--accent);">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const confirmBtn = overlay.querySelector('.modal-btn-confirm');
        const cancelBtn = overlay.querySelector('.modal-btn-cancel');

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

// Show translate confirmation dialog with source language selector
function showTranslateConfirmDialog(providerName) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay visible';

        // Default to first project language
        const defaultLang = state.projectLanguages[0] || 'en';

        // Build language options
        const languageOptions = state.projectLanguages.map(lang => {
            const flag = languageFlags[lang] || '🏳️';
            const name = getLanguageLabel(lang);
            const selected = lang === defaultLang ? 'selected' : '';
            return `<option value="${lang}" ${selected}>${flag} ${name}</option>`;
        }).join('');

        // Count texts for each language
        const getTextCount = (lang) => {
            let count = 0;
            state.screenshots.forEach(screenshot => {
                const text = screenshot.text || state.text;
                if (text.headlines?.[lang]?.trim()) count++;
                if (text.subheadlines?.[lang]?.trim()) count++;
            });
            return count;
        };

        const initialCount = getTextCount(defaultLang);
        const targetCount = state.projectLanguages.length - 1;

        overlay.innerHTML = `
            <div class="modal" style="max-width: 380px;">
                <div class="modal-icon" style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #764ba2;">
                        <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2v3M22 22l-5-10-5 10M14 18h6"/>
                    </svg>
                </div>
                <h3 class="modal-title">Translate All Text</h3>
                <p class="modal-message" style="margin-bottom: 16px;">Translate headlines and subheadlines from one language to all other project languages.</p>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">Source Language</label>
                    <select id="translate-source-lang" style="width: 100%; padding: 10px 12px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 14px; cursor: pointer;">
                        ${languageOptions}
                    </select>
                </div>

                <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                        <span style="color: var(--text-secondary);">Texts to translate:</span>
                        <span id="translate-text-count" style="color: var(--text-primary); font-weight: 500;">${initialCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                        <span style="color: var(--text-secondary);">Target languages:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${targetCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px;">
                        <span style="color: var(--text-secondary);">Provider:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${providerName}</span>
                    </div>
                </div>

                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-cancel" id="translate-cancel">Cancel</button>
                    <button class="modal-btn modal-btn-confirm" id="translate-confirm" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">Translate</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const select = document.getElementById('translate-source-lang');
        const countEl = document.getElementById('translate-text-count');
        const confirmBtn = document.getElementById('translate-confirm');
        const cancelBtn = document.getElementById('translate-cancel');

        // Update count when language changes
        select.addEventListener('change', () => {
            const count = getTextCount(select.value);
            countEl.textContent = count;
            confirmBtn.disabled = count === 0;
            if (count === 0) {
                confirmBtn.style.opacity = '0.5';
            } else {
                confirmBtn.style.opacity = '1';
            }
        });

        // Initial state
        if (initialCount === 0) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
        }

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(select.value);
        });

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(null);
            }
        });
    });
}

// Translate all text (headlines + subheadlines) from selected source language to all other project languages
async function translateAllText() {
    if (state.projectLanguages.length < 2) {
        await showAppAlert('Add more languages to your project first (via the language menu).', 'info');
        return;
    }

    // Get selected provider and API key
    const provider = getSelectedProvider();
    const providerConfig = llmProviders[provider];
    const apiKey = localStorage.getItem(providerConfig.storageKey);

    if (!apiKey) {
        await showAppAlert('Add your LLM API key in Settings to use AI translation.', 'error');
        return;
    }

    // Show confirmation dialog with source language selector
    const sourceLang = await showTranslateConfirmDialog(providerConfig.name);
    if (!sourceLang) return; // User cancelled

    const targetLangs = state.projectLanguages.filter(lang => lang !== sourceLang);

    // Collect all texts that need translation
    const textsToTranslate = [];

    // Go through all screenshots and collect headlines/subheadlines
    state.screenshots.forEach((screenshot, index) => {
        const text = screenshot.text || state.text;

        // Headline
        const headline = text.headlines?.[sourceLang] || '';
        if (headline.trim()) {
            const protectedHeadline = protectTranslatableText(headline);
            textsToTranslate.push({
                type: 'headline',
                screenshotIndex: index,
                text: headline,
                promptText: protectedHeadline.protectedText,
                protectedTokens: protectedHeadline.protectedTokens
            });
        }

        // Subheadline
        const subheadline = text.subheadlines?.[sourceLang] || '';
        if (subheadline.trim()) {
            const protectedSubheadline = protectTranslatableText(subheadline);
            textsToTranslate.push({
                type: 'subheadline',
                screenshotIndex: index,
                text: subheadline,
                promptText: protectedSubheadline.protectedText,
                protectedTokens: protectedSubheadline.protectedTokens
            });
        }
    });

    if (textsToTranslate.length === 0) {
        await showAppAlert(`No text found in ${languageNames[sourceLang] || sourceLang}. Add headlines or subheadlines first.`, 'info');
        return;
    }

    // Create progress dialog with spinner
    const progressOverlay = document.createElement('div');
    progressOverlay.className = 'modal-overlay visible';
    progressOverlay.id = 'translate-progress-overlay';
    progressOverlay.innerHTML = `
        <div class="modal" style="text-align: center; min-width: 320px;">
            <div class="modal-icon" style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #764ba2; animation: spin 1s linear infinite;">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
            </div>
            <h3 class="modal-title">Translating...</h3>
            <p class="modal-message" id="translate-progress-text">Sending to AI...</p>
            <p class="modal-message" id="translate-progress-detail" style="font-size: 11px; color: var(--text-tertiary); margin-top: 8px;"></p>
        </div>
        <style>
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        </style>
    `;
    document.body.appendChild(progressOverlay);

    const progressText = document.getElementById('translate-progress-text');
    const progressDetail = document.getElementById('translate-progress-detail');

    // Helper to update status
    const updateStatus = (text, detail = '') => {
        if (progressText) progressText.textContent = text;
        if (progressDetail) progressDetail.textContent = detail;
    };

    updateStatus('Sending to AI...', `${textsToTranslate.length} texts to ${targetLangs.length} languages using ${providerConfig.name}`);

    try {
        // Build a single prompt with all texts
        const targetLanguageList = targetLangs
            .map(lang => `- ${languageNames[lang] || lang} [${lang}]`)
            .join('\n');

        // Group texts by screenshot for context-aware prompt
        const screenshotGroups = {};
        textsToTranslate.forEach((item, i) => {
            if (!screenshotGroups[item.screenshotIndex]) {
                screenshotGroups[item.screenshotIndex] = { headline: null, subheadline: null, indices: {} };
            }
            screenshotGroups[item.screenshotIndex][item.type] = item.text;
            screenshotGroups[item.screenshotIndex].indices[item.type] = i;
        });

        // Build context-rich prompt showing screenshot groupings
        let contextualTexts = '';
        Object.keys(screenshotGroups).sort((a, b) => Number(a) - Number(b)).forEach(screenshotIdx => {
            const group = screenshotGroups[screenshotIdx];
            contextualTexts += `\nScreenshot ${Number(screenshotIdx) + 1}:\n`;
            if (group.headline !== null) {
                contextualTexts += `  [${group.indices.headline}] Headline: "${textsToTranslate[group.indices.headline].promptText}"\n`;
            }
            if (group.subheadline !== null) {
                contextualTexts += `  [${group.indices.subheadline}] Subheadline: "${textsToTranslate[group.indices.subheadline].promptText}"\n`;
            }
        });

        const prompt = `You are a professional translator for App Store screenshot marketing copy.

Translate the following texts from ${languageNames[sourceLang]} into the target languages.

CONTEXT: These are marketing texts for app store screenshots. Each screenshot has a headline and/or subheadline that work together as a pair. The subheadline typically elaborates on or supports the headline. When translating, ensure:
- Headlines and subheadlines on the same screenshot remain thematically consistent
- Translations across all screenshots maintain a cohesive marketing voice
- SIMILAR LENGTH to the originals - do NOT make translations longer, as they must fit on screen
- Marketing-focused and compelling language
- Culturally appropriate for each target market
- Natural-sounding in each language

IMPORTANT: The translated text will be displayed on app screenshots with limited space. If the source text is short, the translation MUST also be short. Prioritize brevity over literal accuracy.

Source texts (${languageNames[sourceLang]}):
${contextualTexts}

Target languages (name [code]):
${targetLanguageList}

Respond ONLY with a valid JSON object. The structure should be:
{
  "0": {"de": "German translation", "fr": "French translation", ...},
  "1": {"de": "German translation", "fr": "French translation", ...}
}

Where the keys (0, 1, etc.) correspond to the text indices [N] shown above.
Use locale codes as second-level keys (for example: "de", "fr-ca"). Do not use language names as keys.

TOKEN RULES (CRITICAL):
- Any token in the format __NT_0__, __NT_1__, etc. must remain EXACTLY unchanged.
- Do not translate, remove, reorder, or reformat these tokens.
- Keep these tokens in the same relative position as each source text.`;

        let responseText;

        if (provider === 'anthropic') {
            responseText = await translateWithAnthropic(apiKey, prompt);
        } else if (provider === 'openai') {
            responseText = await translateWithOpenAI(apiKey, prompt);
        } else if (provider === 'google') {
            responseText = await translateWithGoogle(apiKey, prompt);
        }

        updateStatus('Processing response...', 'Parsing translations');

        // Clean up response - remove markdown code blocks and extract JSON
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Try to extract JSON object if there's extra text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            responseText = jsonMatch[0];
        }

        console.log('Translation response:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));

        let translations;
        try {
            translations = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON parse error. Response was:', responseText);
            throw new Error('Failed to parse translation response. The AI may have returned incomplete text.');
        }

        updateStatus('Applying translations...', 'Updating screenshots');

        // Apply translations
        let appliedCount = 0;
        textsToTranslate.forEach((item, index) => {
            const itemTranslations = translations[index] || translations[String(index)];
            if (!itemTranslations) return;

            const screenshot = state.screenshots[item.screenshotIndex];
            const text = screenshot.text || state.text;

            targetLangs.forEach(lang => {
                if (itemTranslations[lang]) {
                    const restoredTranslation = restoreProtectedTokens(itemTranslations[lang], item.protectedTokens || []);
                    if (item.type === 'headline') {
                        if (!text.headlines) text.headlines = {};
                        text.headlines[lang] = restoredTranslation;
                    } else {
                        if (!text.subheadlines) text.subheadlines = {};
                        text.subheadlines[lang] = restoredTranslation;
                        // Enable subheadline display when translations are added
                        text.subheadlineEnabled = true;
                    }
                    appliedCount++;
                }
            });
        });

        // Update UI
        syncUIWithState();
        updateCanvas();
        saveState();

        // Remove progress overlay
        progressOverlay.remove();

        await showAppAlert(`Successfully translated ${appliedCount} text(s)!`, 'success');

    } catch (error) {
        console.error('Translation error:', error);
        progressOverlay.remove();

        if (error.message === 'Failed to fetch') {
            await showAppAlert('Connection failed. Check your API key in Settings.', 'error');
        } else if (error.message === 'AI_UNAVAILABLE' || error.message.includes('401') || error.message.includes('403')) {
            await showAppAlert('Invalid API key. Update it in Settings (gear icon).', 'error');
        } else {
            await showAppAlert('Translation failed: ' + error.message, 'error');
        }
    }
}

// Provider-specific translation functions
async function translateWithAnthropic(apiKey, prompt) {
    const model = getSelectedModel('anthropic');
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }]
        })
    });

    if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403) throw new Error('AI_UNAVAILABLE');
        throw new Error(`API request failed: ${status}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

async function translateWithOpenAI(apiKey, prompt) {
    const model = getSelectedModel('openai');
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            max_completion_tokens: 16384,
            messages: [{ role: "user", content: prompt }]
        })
    });

    if (!response.ok) {
        const status = response.status;
        const errorBody = await response.json().catch(() => ({}));
        console.error('OpenAI API Error:', {
            status,
            model,
            error: errorBody
        });
        if (status === 401 || status === 403) throw new Error('AI_UNAVAILABLE');
        throw new Error(`API request failed: ${status} - ${errorBody.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function translateWithGoogle(apiKey, prompt) {
    const model = getSelectedModel('google');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403 || status === 400) throw new Error('AI_UNAVAILABLE');
        throw new Error(`API request failed: ${status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function setTranslateStatus(message, type) {
    const status = document.getElementById('ai-translate-status');
    status.textContent = message;
    status.className = 'ai-translate-status' + (type ? ' ' + type : '');
}
