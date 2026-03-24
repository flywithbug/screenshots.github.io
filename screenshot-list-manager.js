(function (global) {
    function createScreenshotListManager(deps) {
        const {
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
        } = deps;

        let draggedScreenshotIndex = null;
        let applyStyleSourceIndex = null;

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

        function updateScreenshotList() {
            screenshotList.innerHTML = '';
            const isEmpty = state.screenshots.length === 0;
            noScreenshot.style.display = isEmpty ? 'block' : 'none';

            const rightSidebar = document.querySelector('.sidebar-right');
            if (rightSidebar) rightSidebar.classList.toggle('disabled', isEmpty);
            const exportCurrent = document.getElementById('export-current');
            const exportAll = document.getElementById('export-all');
            if (exportCurrent) {
                exportCurrent.disabled = isEmpty;
                exportCurrent.style.opacity = isEmpty ? '0.4' : '';
                exportCurrent.style.pointerEvents = isEmpty ? 'none' : '';
            }
            if (exportAll) {
                exportAll.disabled = isEmpty;
                exportAll.style.opacity = isEmpty ? '0.4' : '';
                exportAll.style.pointerEvents = isEmpty ? 'none' : '';
            }

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

                if (!isTransferMode) {
                    item.draggable = true;
                    item.dataset.index = index;
                }

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

                const thumbImg = getScreenshotImage(screenshot);
                const thumbSrc = thumbImg?.src || '';
                const isBlank = !thumbSrc;

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

                item.addEventListener('dragstart', (e) => {
                    draggedScreenshotIndex = index;
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    draggedScreenshotIndex = null;
                    document.querySelectorAll('.screenshot-item.drag-insert-after, .screenshot-item.drag-insert-before').forEach(el => {
                        el.classList.remove('drag-insert-after', 'drag-insert-before');
                    });
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (draggedScreenshotIndex !== null && draggedScreenshotIndex !== index) {
                        const rect = item.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        const isAbove = e.clientY < midpoint;

                        document.querySelectorAll('.screenshot-item.drag-insert-after, .screenshot-item.drag-insert-before').forEach(el => {
                            el.classList.remove('drag-insert-after', 'drag-insert-before');
                        });

                        if (isAbove && index === 0) {
                            item.classList.add('drag-insert-before');
                        } else if (isAbove && index > 0) {
                            const items = screenshotList.querySelectorAll('.screenshot-item');
                            const prevItem = items[index - 1];
                            if (prevItem && !prevItem.classList.contains('dragging')) {
                                prevItem.classList.add('drag-insert-after');
                            }
                        } else if (!isAbove) {
                            item.classList.add('drag-insert-after');
                        }
                    }
                });

                item.addEventListener('dragleave', () => {
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();

                    const rect = item.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    const dropAbove = e.clientY < midpoint;

                    document.querySelectorAll('.screenshot-item.drag-insert-after, .screenshot-item.drag-insert-before').forEach(el => {
                        el.classList.remove('drag-insert-after', 'drag-insert-before');
                    });

                    if (draggedScreenshotIndex !== null && draggedScreenshotIndex !== index) {
                        let targetIndex = dropAbove ? index : index + 1;

                        if (draggedScreenshotIndex < targetIndex) {
                            targetIndex--;
                        }

                        const draggedItem = state.screenshots[draggedScreenshotIndex];
                        state.screenshots.splice(draggedScreenshotIndex, 1);
                        state.screenshots.splice(targetIndex, 0, draggedItem);

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

                    if (state.transferTarget !== null) {
                        if (index !== state.transferTarget) {
                            transferStyle(index, state.transferTarget);
                        }
                        return;
                    }

                    if (state.selectedIndex !== index) {
                        state.selectedIndex = index;
                        updateScreenshotList();
                        syncUIWithState();
                        updateGradientStopsUI();
                        const ss = getScreenshotSettings();
                        if (ss.use3D && typeof updateScreenTexture === 'function') {
                            updateScreenTexture();
                        }
                        updateCanvas();
                    }
                });

                const menuBtn = item.querySelector('.screenshot-menu-btn');
                const menu = item.querySelector('.screenshot-menu');
                if (menuBtn && menu) {
                    menuBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        document.querySelectorAll('.screenshot-menu.open').forEach(m => {
                            if (m !== menu) m.classList.remove('open');
                        });
                        menu.classList.toggle('open');
                    });
                }

                const translationsBtn = item.querySelector('.screenshot-translations');
                if (translationsBtn) {
                    translationsBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        menu?.classList.remove('open');
                        openScreenshotTranslationsModal(index);
                    });
                }

                const replaceBtn = item.querySelector('.screenshot-replace');
                if (replaceBtn) {
                    replaceBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        menu?.classList.remove('open');
                        replaceScreenshot(index);
                    });
                }

                const transferBtn = item.querySelector('.screenshot-transfer');
                if (transferBtn) {
                    transferBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        menu?.classList.remove('open');
                        state.transferTarget = index;
                        updateScreenshotList();
                    });
                }

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

            const addButtonsContainer = document.querySelector('.sidebar-add-buttons');
            if (addButtonsContainer) {
                addButtonsContainer.style.display = state.transferTarget === null ? '' : 'none';
            }

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

            target.background = hydrateBackground(JSON.parse(JSON.stringify(source.background)));
            target.deviceOverrides = hydrateDeviceOverrides(serializeDeviceOverrides(source.deviceOverrides));
            target.screenshot = JSON.parse(JSON.stringify(source.screenshot));

            const targetHeadlines = target.text.headlines;
            const targetSubheadlines = target.text.subheadlines;
            target.text = JSON.parse(JSON.stringify(source.text));
            target.text.headlines = targetHeadlines;
            target.text.subheadlines = targetSubheadlines;

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

            state.transferTarget = null;

            updateScreenshotList();
            syncUIWithState();
            updateGradientStopsUI();
            updateCanvas();
        }

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

            state.screenshots.forEach((target, index) => {
                if (index === applyStyleSourceIndex) return;

                target.background = hydrateBackground(JSON.parse(JSON.stringify(source.background)));
                target.deviceOverrides = hydrateDeviceOverrides(serializeDeviceOverrides(source.deviceOverrides));
                target.screenshot = JSON.parse(JSON.stringify(source.screenshot));

                const targetHeadlines = target.text.headlines;
                const targetSubheadlines = target.text.subheadlines;
                target.text = JSON.parse(JSON.stringify(source.text));
                target.text.headlines = targetHeadlines;
                target.text.subheadlines = targetSubheadlines;

                target.elements = (source.elements || []).map(el => {
                    const copy = JSON.parse(JSON.stringify({ ...el, image: undefined }));
                    if (el.type === 'graphic' && el.image) {
                        copy.image = el.image;
                    }
                    copy.id = crypto.randomUUID();
                    return copy;
                });
            });

            applyStyleSourceIndex = null;

            updateScreenshotList();
            syncUIWithState();
            updateGradientStopsUI();
            updateCanvas();
        }

        function replaceScreenshot(index) {
            const screenshot = state.screenshots[index];
            if (!screenshot) return;

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
                        const lang = state.currentLanguage;

                        const localizedImages = getLocalizedImagesForDevice(screenshot, state.outputDevice, true);
                        localizedImages[lang] = {
                            image: img,
                            src: event.target.result,
                            name: file.name
                        };

                        if (isFallbackDevice(state.outputDevice)) {
                            screenshot.image = img;
                        }

                        updateScreenshotList();
                        updateCanvas();
                        saveState();
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);

                document.body.removeChild(fileInput);
            });

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

        return {
            duplicateScreenshot,
            updateScreenshotList,
            cancelTransfer,
            transferStyle,
            showApplyStyleModal,
            applyStyleToAll,
            replaceScreenshot,
            setScreenshotExportName,
            startInlineExportNameEdit
        };
    }

    global.createScreenshotListManager = createScreenshotListManager;
})(window);
