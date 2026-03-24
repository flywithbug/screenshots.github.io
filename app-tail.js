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
                    state.outputDevice = normalizeOutputDevice(parsed.outputDevice || APP_CONFIG.STORAGE_FALLBACKS.outputDevice);
                    state.exportDevices = normalizeExportDevices(parsed.exportDevices || [state.outputDevice]);
                    state.customWidth = parsed.customWidth || APP_CONFIG.STORAGE_FALLBACKS.customWidth;
                    state.customHeight = parsed.customHeight || APP_CONFIG.STORAGE_FALLBACKS.customHeight;

                    // Load global language settings
                    state.projectLanguages = Array.isArray(parsed.projectLanguages) && parsed.projectLanguages.length > 0
                        ? parsed.projectLanguages
                        : JSON.parse(JSON.stringify(APP_CONFIG.STORAGE_FALLBACKS.projectLanguages));
                    state.currentLanguage = parsed.currentLanguage || state.projectLanguages[0] || APP_CONFIG.STORAGE_FALLBACKS.currentLanguage;

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
    const initial = APP_CONFIG.createInitialState();
    state.screenshots = initial.screenshots;
    state.selectedIndex = initial.selectedIndex;
    state.outputDevice = initial.outputDevice;
    state.exportDevices = initial.exportDevices;
    state.customWidth = initial.customWidth;
    state.customHeight = initial.customHeight;
    state.currentLanguage = initial.currentLanguage;
    state.projectLanguages = initial.projectLanguages;
    state.defaults = initial.defaults;
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

const projectTransferManager = window.createProjectTransferManager ? createProjectTransferManager({
    getDb: () => db,
    getProjects: () => projects,
    getCurrentProjectId: () => currentProjectId,
    getProjectImportInput: () => projectImportInput,
    saveState,
    buildSerializableProjectState,
    showAppAlert,
    switchProject,
    updateProjectSelector,
    saveProjectsMeta,
    projectStoreName: PROJECTS_STORE
}) : null;

async function exportProject() {
    if (!projectTransferManager) return;
    return projectTransferManager.exportProject();
}

async function importProjectFromInput(event) {
    if (!projectTransferManager) return;
    return projectTransferManager.importProjectFromInput(event);
}

function importProject() {
    if (!projectTransferManager) return;
    projectTransferManager.importProject();
}

function duplicateScreenshot(index) {
    if (!screenshotListManager) return;
    screenshotListManager.duplicateScreenshot(index);
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

const editorPanelsManager = window.createEditorPanelsManager ? createEditorPanelsManager() : null;

function updateElementsList() {
    if (!editorPanelsManager) return;
    editorPanelsManager.updateElementsList();
}

function updateElementProperties() {
    if (!editorPanelsManager) return;
    editorPanelsManager.updateElementProperties();
}

function setupElementEventListeners() {
    if (!editorPanelsManager) return;
    editorPanelsManager.setupElementEventListeners();
}

function setupElementCanvasDrag() {
    if (!editorPanelsManager) return;
    editorPanelsManager.setupElementCanvasDrag();
}

function drawSnapGuides() {
    if (!editorPanelsManager) return;
    editorPanelsManager.drawSnapGuides();
}

function updatePopoutsList() {
    if (!editorPanelsManager) return;
    editorPanelsManager.updatePopoutsList();
}

function updatePopoutProperties() {
    if (!editorPanelsManager) return;
    editorPanelsManager.updatePopoutProperties();
}

function getCropPreviewLayout(previewCanvas, img) {
    if (!editorPanelsManager) return { scale: 1, offsetX: 0, offsetY: 0, dispW: img ? img.width : 0, dispH: img ? img.height : 0 };
    return editorPanelsManager.getCropPreviewLayout(previewCanvas, img);
}

function updateCropPreview() {
    if (!editorPanelsManager) return;
    editorPanelsManager.updateCropPreview();
}

function setupCropPreviewDrag() {
    if (!editorPanelsManager) return;
    editorPanelsManager.setupCropPreviewDrag();
}

function setupPopoutEventListeners() {
    if (!editorPanelsManager) return;
    editorPanelsManager.setupPopoutEventListeners();
}


const eventWiringManager = window.createEventWiringManager ? createEventWiringManager() : null;

function setupEventListeners() {
    if (!eventWiringManager) return;
    eventWiringManager.setupEventListeners();
}

const workflowManager = window.createWorkflowManager ? createWorkflowManager() : null;

function isPerScreenshotTextMode() {
    if (!workflowManager) return true;
    return workflowManager.isPerScreenshotTextMode();
}

function applyTheme(preference) {
    if (!workflowManager) return;
    workflowManager.applyTheme(preference);
}

function initTheme() {
    if (!workflowManager) return;
    workflowManager.initTheme();
}

function openSettingsModal() {
    if (!workflowManager) return;
    workflowManager.openSettingsModal();
}

function updateProviderSection(provider) {
    if (!workflowManager) return;
    workflowManager.updateProviderSection(provider);
}

function saveSettings() {
    if (!workflowManager) return;
    workflowManager.saveSettings();
}

function setTextValue(key, value) {
    if (!workflowManager) return;
    workflowManager.setTextValue(key, value);
}

function setTextLanguageValue(key, value, lang = null) {
    if (!workflowManager) return;
    workflowManager.setTextLanguageValue(key, value, lang);
}

function getTextSettings() {
    if (!workflowManager) return getText();
    return workflowManager.getTextSettings();
}

function loadTextUIFromScreenshot() {
    if (!workflowManager) return;
    workflowManager.loadTextUIFromScreenshot();
}

function loadTextUIFromGlobal() {
    if (!workflowManager) return;
    workflowManager.loadTextUIFromGlobal();
}

function updateTextUI(text) {
    if (!workflowManager) return;
    workflowManager.updateTextUI(text);
}

function applyPositionPreset(preset) {
    if (!workflowManager) return;
    workflowManager.applyPositionPreset(preset);
}

function handleFiles(files) {
    if (!workflowManager) return;
    workflowManager.handleFiles(files);
}

function handleFilesFromDesktop(filesData) {
    if (!workflowManager) return;
    workflowManager.handleFilesFromDesktop(filesData);
}

async function processDesktopFilesSequentially(filesData) {
    if (!workflowManager) return;
    return workflowManager.processDesktopFilesSequentially(filesData);
}

function getPathBasename(filePath) {
    if (!workflowManager) return ;
    return workflowManager.getPathBasename(filePath);
}

function joinFsPath(parent, child) {
    if (!workflowManager) return ;
    return workflowManager.joinFsPath(parent, child);
}

function isImageFilePath(filePath) {
    if (!workflowManager) return false;
    return workflowManager.isImageFilePath(filePath);
}

function normalizeReadDirEntry(entry, parentPath) {
    if (!workflowManager) return null;
    return workflowManager.normalizeReadDirEntry(entry, parentPath);
}

async function collectImageFilePathsRecursively(rootPath) {
    if (!workflowManager) return [];
    return workflowManager.collectImageFilePathsRecursively(rootPath);
}

async function importScreenshotsFromTauri() {
    if (!workflowManager) return;
    return workflowManager.importScreenshotsFromTauri();
}

async function processDesktopImageFile(fileData) {
    if (!workflowManager) return;
    return workflowManager.processDesktopImageFile(fileData);
}

async function processFilesSequentially(files) {
    if (!workflowManager) return;
    return workflowManager.processFilesSequentially(files);
}

async function processImageFile(file) {
    if (!workflowManager) return;
    return workflowManager.processImageFile(file);
}

function createNewScreenshot(img, src, name, lang, deviceType) {
    if (!workflowManager) return;
    workflowManager.createNewScreenshot(img, src, name, lang, deviceType);
}

// Apply theme immediately (before async init)
initTheme();

function updateScreenshotList() {
    if (!screenshotListManager) return;
    screenshotListManager.updateScreenshotList();
}

const screenshotListManager = window.createScreenshotListManager ? createScreenshotListManager({
    state,
    screenshotList,
    noScreenshot,
    getScreenshotImage,
    getAvailableLanguagesForScreenshot,
    isScreenshotComplete,
    languageFlags,
    updateProjectSelector,
    syncUIWithState,
    updateGradientStopsUI,
    getScreenshotSettings,
    updateScreenTexture,
    updateCanvas,
    openScreenshotTranslationsModal,
    hydrateBackground,
    hydrateDeviceOverrides,
    serializeDeviceOverrides,
    getLocalizedImagesForDevice,
    isFallbackDevice,
    saveState
}) : null;

function cancelTransfer() {
    if (!screenshotListManager) return;
    screenshotListManager.cancelTransfer();
}

function transferStyle(sourceIndex, targetIndex) {
    if (!screenshotListManager) return;
    screenshotListManager.transferStyle(sourceIndex, targetIndex);
}

function showApplyStyleModal(sourceIndex) {
    if (!screenshotListManager) return;
    screenshotListManager.showApplyStyleModal(sourceIndex);
}

function applyStyleToAll() {
    if (!screenshotListManager) return;
    screenshotListManager.applyStyleToAll();
}

function replaceScreenshot(index) {
    if (!screenshotListManager) return;
    screenshotListManager.replaceScreenshot(index);
}

function setScreenshotExportName(index) {
    if (!screenshotListManager) return;
    screenshotListManager.setScreenshotExportName(index);
}

function startInlineExportNameEdit(index, item, nameEl) {
    if (!screenshotListManager) return;
    screenshotListManager.startInlineExportNameEdit(index, item, nameEl);
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

const canvasRenderManager = window.createCanvasRenderManager ? createCanvasRenderManager() : null;

function drawBackgroundToContext(context, dims, bg) {
    if (!canvasRenderManager) return;
    canvasRenderManager.drawBackgroundToContext(context, dims, bg);
}

function drawNoiseToContext(context, dims, intensity) {
    if (!canvasRenderManager) return;
    canvasRenderManager.drawNoiseToContext(context, dims, intensity);
}

function drawScreenshotToContext(context, dims, img, settings) {
    if (!canvasRenderManager) return;
    canvasRenderManager.drawScreenshotToContext(context, dims, img, settings);
}

function drawDeviceFrameToContext(context, x, y, width, height, settings) {
    if (!canvasRenderManager) return;
    canvasRenderManager.drawDeviceFrameToContext(context, x, y, width, height, settings);
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

const pickerManager = window.createPickerManager ? createPickerManager({
    addEmojiElement,
    addIconElement,
    fetchLucideSVG,
    colorizeLucideSVG
}) : null;

function showEmojiPicker() {
    if (!pickerManager) return;
    pickerManager.showEmojiPicker();
}

function showIconPicker() {
    if (!pickerManager) return;
    pickerManager.showIconPicker();
}

// Initialize the app
initSync();
