(function (global) {
    function createWorkflowManager() {
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
        
        return { isPerScreenshotTextMode, applyTheme, initTheme, openSettingsModal, updateProviderSection, saveSettings, setTextValue, setTextLanguageValue, getTextSettings, loadTextUIFromScreenshot, loadTextUIFromGlobal, updateTextUI, applyPositionPreset, handleFiles, handleFilesFromDesktop, processDesktopFilesSequentially, getPathBasename, joinFsPath, isImageFilePath, normalizeReadDirEntry, collectImageFilePathsRecursively, importScreenshotsFromTauri, processDesktopImageFile, processFilesSequentially, processImageFile, createNewScreenshot };
    }
    global.createWorkflowManager = createWorkflowManager;
})(window);
