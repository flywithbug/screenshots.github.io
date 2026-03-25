(function (global) {
    function createEventWiringManager() {
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
            document.getElementById('ai-translate-mode').addEventListener('change', () => {
                updateTranslateModeUI();
                updateTranslateSourcePreview();
            });
        
            document.getElementById('translate-modal-cancel').addEventListener('click', () => {
                document.getElementById('translate-modal').classList.remove('visible');
            });

            document.getElementById('export-copy-btn').addEventListener('click', () => {
                exportTranslations();
            });

            document.getElementById('import-copy-btn').addEventListener('click', () => {
                importTranslations();
            });

            document.getElementById('copy-import-input').addEventListener('change', importTranslationsFromInput);

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
        return { setupEventListeners };
    }
    global.createEventWiringManager = createEventWiringManager;
})(window);
