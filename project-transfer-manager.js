(function (global) {
    function createProjectTransferManager(deps) {
        const {
            getDb,
            getProjects,
            getCurrentProjectId,
            getProjectImportInput,
            saveState,
            buildSerializableProjectState,
            showAppAlert,
            switchProject,
            updateProjectSelector,
            saveProjectsMeta,
            projectStoreName
        } = deps;

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
            const existing = new Set(getProjects().map(p => p.name.toLowerCase()));
            if (!existing.has(trimmed.toLowerCase())) return trimmed;
            let counter = 2;
            while (existing.has(`${trimmed} (${counter})`.toLowerCase())) {
                counter++;
            }
            return `${trimmed} (${counter})`;
        }

        async function readProjectFromStore(projectId) {
            const db = getDb();
            if (!db) return null;
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction([projectStoreName], 'readonly');
                    const store = tx.objectStore(projectStoreName);
                    const req = store.get(projectId);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }

        async function exportProject() {
            const currentProject = getProjects().find(p => p.id === getCurrentProjectId());
            if (!currentProject) return;

            await saveState();

            const stored = await readProjectFromStore(getCurrentProjectId());
            const projectData = stored || buildSerializableProjectState(getCurrentProjectId());
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
            const db = getDb();
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
                clonedData.exportDevices = [clonedData.outputDevice || window.AppConfig.DEFAULT_FALLBACK_DEVICE];
            }

            try {
                await new Promise((resolve, reject) => {
                    try {
                        const tx = db.transaction([projectStoreName], 'readwrite');
                        const store = tx.objectStore(projectStoreName);
                        store.put(clonedData);
                        tx.oncomplete = resolve;
                        tx.onerror = () => reject(tx.error || new Error('Failed to import project'));
                        tx.onabort = () => reject(tx.error || new Error('Import transaction aborted'));
                    } catch (e) {
                        reject(e);
                    }
                });

                getProjects().push({
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
            getProjectImportInput()?.click();
        }

        return {
            exportProject,
            importProject,
            importProjectFromInput
        };
    }

    global.createProjectTransferManager = createProjectTransferManager;
})(window);
