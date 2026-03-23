(function (global) {
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function createExportManager(deps) {
        const {
            state,
            canvas,
            updateCanvas,
            showAppAlert,
            showExportLanguageDialog,
            languageNames,
            languages,
            JSZipCtor,
            syncUIWithState
        } = deps;

        function normalizePlatform(platform) {
            const p = String(platform || '').toLowerCase();
            if (p === 'iphone' || p === 'ipad' || p === 'ios') return 'ios';
            if (p === 'android') return 'android';
            if (p === 'web') return 'web';
            return p || 'custom';
        }

        function getExportPlatformAndSize(device = state.outputDevice) {
            if (typeof device === 'string') {
                const parts = device.toLowerCase().split('-').filter(Boolean);
                if (parts.length > 0) {
                    const platform = normalizePlatform(parts[0]);
                    const rawSize = parts.slice(1).join('-');
                    const size = rawSize
                        ? rawSize.replace(/[^a-z0-9.]/g, '').replace(/\./g, '')
                        : (platform === 'custom' ? `${state.customWidth}x${state.customHeight}` : 'default');
                    return { platform, size };
                }
            }
            return {
                platform: 'custom',
                size: `${state.customWidth}x${state.customHeight}`
            };
        }

        function sanitizeExportName(name) {
            const fallback = 'appscreen';
            const trimmed = String(name || '').trim();
            if (!trimmed) return fallback;

            const withoutExtension = trimmed.replace(/\.[^/.]+$/, '').trim();
            const withoutInvalidChars = withoutExtension.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
            const normalized = withoutInvalidChars.replace(/\s+/g, '_').replace(/\.+$/, '').toLowerCase();
            return normalized || fallback;
        }

        function getExportImageFilename(index, device = state.outputDevice, screenshotName) {
            const { platform } = getExportPlatformAndSize(device);
            const fallbackName = state.screenshots?.[index - 1]?.exportName;
            const resolvedName = screenshotName !== undefined ? screenshotName : fallbackName;
            const safeName = sanitizeExportName(resolvedName);
            return `${index}_${platform}_${safeName}.png`;
        }

        function getSelectedExportDevices() {
            const devices = Array.isArray(state.exportDevices) ? state.exportDevices.filter(Boolean) : [];
            return devices.length > 0 ? devices : [state.outputDevice];
        }

        function isIOSPlatform(platform) {
            return platform === 'ios';
        }

        function getIOSFastlaneImageFilename(index) {
            const n = String(index).padStart(2, '0');
            if (index === 1) return `${n}_cover.png`;
            if (index === 2) return `${n}_feature.png`;
            if (index === 3) return `${n}_detail.png`;
            return `${n}_shot.png`;
        }

        function getIOSFastlaneDisplayName(device) {
            const raw = String(device || '').toLowerCase();
            const parts = raw.split('-').filter(Boolean);
            const family = parts[0] || 'iphone';
            const size = parts.slice(1).join('').replace(/[^a-z0-9.]/g, '').replace(/\./g, '') || 'default';
            const familyName = family === 'ipad' ? 'IPAD' : 'IPHONE';
            return `APP_${familyName}_${size.toUpperCase()}`;
        }

        function getDeviceFolderName(device = state.outputDevice) {
            const raw = String(device || 'custom').toLowerCase();
            if (raw === 'custom') {
                return `custom${state.customWidth}x${state.customHeight}`;
            }

            const parts = raw.split('-').filter(Boolean);
            const family = parts[0] || 'custom';
            const rest = parts.slice(1).join('');

            const familyLabel = family === 'iphone'
                ? 'iPhone'
                : family === 'ipad'
                    ? 'iPad'
                    : family;
            const sizeLabel = rest.replace(/[^a-z0-9]/g, '');
            return sizeLabel ? `${familyLabel}${sizeLabel}` : familyLabel;
        }

        function showExportProgress(status, detail, percent) {
            const modal = document.getElementById('export-progress-modal');
            const statusEl = document.getElementById('export-progress-status');
            const detailEl = document.getElementById('export-progress-detail');
            const fillEl = document.getElementById('export-progress-fill');

            if (modal) modal.classList.add('visible');
            if (statusEl) statusEl.textContent = status;
            if (detailEl) detailEl.textContent = detail || '';
            if (fillEl) fillEl.style.width = `${percent}%`;
        }

        function hideExportProgress() {
            const modal = document.getElementById('export-progress-modal');
            if (modal) modal.classList.remove('visible');
        }

        function isTauriAvailable() {
            return !!(window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.fs);
        }

        function isBrowserDirectoryPickerAvailable() {
            return typeof window.showDirectoryPicker === 'function';
        }

        function canExportToDirectory() {
            return isTauriAvailable() || isBrowserDirectoryPickerAvailable();
        }

        function joinPath(base, child) {
            const useBackslash = String(base).includes('\\');
            const sep = useBackslash ? '\\' : '/';
            const normalizedBase = String(base || '').replace(/[\\/]+$/, '');
            const normalizedChild = String(child || '').replace(/^[\\/]+/, '').replace(/[\\/]+/g, sep);
            return `${normalizedBase}${sep}${normalizedChild}`;
        }

        async function pickExportDirectory() {
            if (isTauriAvailable()) {
                const selected = await window.__TAURI__.dialog.open({
                    directory: true,
                    multiple: false
                });
                if (!selected || Array.isArray(selected)) return null;
                return { type: 'tauri', path: selected };
            }

            if (isBrowserDirectoryPickerAvailable()) {
                try {
                    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                    if (!handle) return null;
                    return { type: 'browser', handle };
                } catch (err) {
                    if (err && err.name === 'AbortError') return null;
                    throw err;
                }
            }

            return null;
        }

        function toTimestampName(date = new Date()) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
        }

        async function ensureDirectory(path) {
            await window.__TAURI__.fs.mkdir(path, { recursive: true });
        }

        async function writeBlobToPath(path, blob) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            await window.__TAURI__.fs.writeFile(path, bytes);
        }

        async function ensureBrowserDirectoryHandle(rootHandle, dirPath) {
            const parts = String(dirPath || '').split(/[\\/]/).filter(Boolean);
            let current = rootHandle;
            for (const part of parts) {
                current = await current.getDirectoryHandle(part, { create: true });
            }
            return current;
        }

        async function writeBlobToBrowserPath(rootHandle, relativePath, blob) {
            const normalized = String(relativePath || '').replace(/^[\\/]+/, '');
            const parts = normalized.split(/[\\/]/).filter(Boolean);
            const filename = parts.pop();
            if (!filename) return;

            const dirHandle = await ensureBrowserDirectoryHandle(rootHandle, parts.join('/'));
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
        }

        async function writeExportFilesToDirectory(exportTarget, files, progressDetailBuilder) {
            if (!files.length) return;

            if (!exportTarget) return;

            let rootDir = '';
            let browserRootHandle = null;

            if (exportTarget.type === 'tauri') {
                rootDir = exportTarget.path;
            } else if (exportTarget.type === 'browser') {
                browserRootHandle = exportTarget.handle;
            } else {
                throw new Error('Unsupported export target');
            }

            for (let i = 0; i < files.length; i++) {
                const item = files[i];
                if (exportTarget.type === 'tauri') {
                    const targetPath = joinPath(rootDir, item.relativePath);
                    const lastSlash = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'));
                    if (lastSlash > 0) {
                        const parent = targetPath.slice(0, lastSlash);
                        await ensureDirectory(parent);
                    }
                    await writeBlobToPath(targetPath, item.blob);
                } else {
                    await writeBlobToBrowserPath(browserRootHandle, item.relativePath, item.blob);
                }

                const percent = Math.round(((i + 1) / files.length) * 100);
                const detail = typeof progressDetailBuilder === 'function'
                    ? progressDetailBuilder(item, i + 1, files.length)
                    : `${i + 1}/${files.length}`;
                showExportProgress('Exporting...', detail, percent);
            }

            const doneDetail = exportTarget.type === 'tauri'
                ? `Saved to ${rootDir}`
                : 'Saved to selected folder';
            showExportProgress('Complete!', doneDetail, 100);
            await delay(1200);
            hideExportProgress();
        }

        function createCrc32Table() {
            const table = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let k = 0; k < 8; k++) {
                    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                }
                table[i] = c >>> 0;
            }
            return table;
        }

        const crc32Table = createCrc32Table();

        function crc32(bytes) {
            let c = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) {
                c = crc32Table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
            }
            return (c ^ 0xFFFFFFFF) >>> 0;
        }

        function adler32(bytes) {
            let a = 1;
            let b = 0;
            const MOD = 65521;
            for (let i = 0; i < bytes.length; i++) {
                a = (a + bytes[i]) % MOD;
                b = (b + a) % MOD;
            }
            return ((b << 16) | a) >>> 0;
        }

        function packChunks(chunks) {
            const total = chunks.reduce((n, arr) => n + arr.length, 0);
            const out = new Uint8Array(total);
            let offset = 0;
            for (const arr of chunks) {
                out.set(arr, offset);
                offset += arr.length;
            }
            return out;
        }

        function createPngChunk(type, data) {
            const typeBytes = new TextEncoder().encode(type);
            const len = data.length;
            const chunk = new Uint8Array(12 + len);
            chunk[0] = (len >>> 24) & 0xFF;
            chunk[1] = (len >>> 16) & 0xFF;
            chunk[2] = (len >>> 8) & 0xFF;
            chunk[3] = len & 0xFF;
            chunk.set(typeBytes, 4);
            chunk.set(data, 8);

            const crcInput = new Uint8Array(4 + len);
            crcInput.set(typeBytes, 0);
            crcInput.set(data, 4);
            const crc = crc32(crcInput);
            chunk[8 + len] = (crc >>> 24) & 0xFF;
            chunk[9 + len] = (crc >>> 16) & 0xFF;
            chunk[10 + len] = (crc >>> 8) & 0xFF;
            chunk[11 + len] = crc & 0xFF;
            return chunk;
        }

        function createZlibUncompressed(data) {
            const out = [];
            out.push(new Uint8Array([0x78, 0x01])); // zlib header

            let offset = 0;
            while (offset < data.length) {
                const blockLen = Math.min(65535, data.length - offset);
                const finalBlock = offset + blockLen >= data.length;
                const header = new Uint8Array(5);
                header[0] = finalBlock ? 1 : 0; // BFINAL=1 for last block, BTYPE=00
                header[1] = blockLen & 0xFF;
                header[2] = (blockLen >>> 8) & 0xFF;
                const nlen = (~blockLen) & 0xFFFF;
                header[3] = nlen & 0xFF;
                header[4] = (nlen >>> 8) & 0xFF;
                out.push(header);
                out.push(data.subarray(offset, offset + blockLen));
                offset += blockLen;
            }

            const checksum = adler32(data);
            out.push(new Uint8Array([
                (checksum >>> 24) & 0xFF,
                (checksum >>> 16) & 0xFF,
                (checksum >>> 8) & 0xFF,
                checksum & 0xFF
            ]));
            return packChunks(out);
        }

        function getOpaquePngBlob(sourceCanvas) {
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = sourceCanvas.width;
            exportCanvas.height = sourceCanvas.height;

            const exportCtx = exportCanvas.getContext('2d');
            if (!exportCtx) return new Blob([], { type: 'image/png' });

            exportCtx.fillStyle = '#ffffff';
            exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            exportCtx.drawImage(sourceCanvas, 0, 0);

            const width = exportCanvas.width;
            const height = exportCanvas.height;
            const rgba = exportCtx.getImageData(0, 0, width, height).data;

            const raw = new Uint8Array(height * (1 + width * 3));
            for (let y = 0; y < height; y++) {
                const rowStart = y * (1 + width * 3);
                raw[rowStart] = 0; // filter type 0
                for (let x = 0; x < width; x++) {
                    const src = (y * width + x) * 4;
                    const dst = rowStart + 1 + x * 3;
                    raw[dst] = rgba[src];
                    raw[dst + 1] = rgba[src + 1];
                    raw[dst + 2] = rgba[src + 2];
                }
            }

            const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
            const ihdr = new Uint8Array(13);
            ihdr[0] = (width >>> 24) & 0xFF;
            ihdr[1] = (width >>> 16) & 0xFF;
            ihdr[2] = (width >>> 8) & 0xFF;
            ihdr[3] = width & 0xFF;
            ihdr[4] = (height >>> 24) & 0xFF;
            ihdr[5] = (height >>> 16) & 0xFF;
            ihdr[6] = (height >>> 8) & 0xFF;
            ihdr[7] = height & 0xFF;
            ihdr[8] = 8; // bit depth
            ihdr[9] = 2; // color type: RGB, no alpha
            ihdr[10] = 0; // compression method
            ihdr[11] = 0; // filter method
            ihdr[12] = 0; // no interlace

            const idatData = createZlibUncompressed(raw);
            const pngBytes = packChunks([
                signature,
                createPngChunk('IHDR', ihdr),
                createPngChunk('IDAT', idatData),
                createPngChunk('IEND', new Uint8Array(0))
            ]);

            return new Blob([pngBytes], { type: 'image/png' });
        }

        async function exportCurrent() {
            if (state.screenshots.length === 0) {
                await showAppAlert('Please upload a screenshot first', 'info');
                return;
            }

            updateCanvas();

            const selectedDevices = getSelectedExportDevices();
            if (selectedDevices.length > 1) {
                const originalDevice = state.outputDevice;
                const screenshotIndex = state.selectedIndex + 1;
                const useDirectoryExport = canExportToDirectory();
                const files = [];
                let exportTarget = null;
                let zip = null;

                if (useDirectoryExport) {
                    exportTarget = await pickExportDirectory();
                    if (!exportTarget) return;
                    showExportProgress('Exporting...', 'Preparing files', 0);
                } else {
                    zip = new JSZipCtor();
                }

                for (const device of selectedDevices) {
                    state.outputDevice = device;
                    updateCanvas();

                    const { platform } = getExportPlatformAndSize(device);
                    const blob = getOpaquePngBlob(canvas);
                    const relativePath = `${platform}/${getExportImageFilename(screenshotIndex, device)}`;
                    if (useDirectoryExport) {
                        files.push({ relativePath, blob });
                    } else {
                        zip.file(relativePath, blob);
                    }
                }

                state.outputDevice = originalDevice;
                updateCanvas();
                if (typeof syncUIWithState === 'function') syncUIWithState();

                if (useDirectoryExport) {
                    await writeExportFilesToDirectory(exportTarget, files, (item, current, total) => {
                        return `${current}/${total} · ${item.relativePath}`;
                    });
                } else {
                    const content = await zip.generateAsync({ type: 'blob' });
                    const link = document.createElement('a');
                    link.download = `screenshots_${state.selectedIndex + 1}_multi-platform.zip`;
                    link.href = URL.createObjectURL(content);
                    link.click();
                    URL.revokeObjectURL(link.href);
                }
                return;
            }

            if (canExportToDirectory()) {
                const exportTarget = await pickExportDirectory();
                if (!exportTarget) return;
                showExportProgress('Exporting...', 'Preparing file', 0);

                const blob = getOpaquePngBlob(canvas);
                const relativePath = getExportImageFilename(state.selectedIndex + 1);
                await writeExportFilesToDirectory(exportTarget, [{ relativePath, blob }], (item) => item.relativePath);
                return;
            }

            const link = document.createElement('a');
            link.download = getExportImageFilename(state.selectedIndex + 1);
            const blob = getOpaquePngBlob(canvas);
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        }

        async function exportAllForLanguage(lang) {
            const originalIndex = state.selectedIndex;
            const originalLang = state.currentLanguage;
            const originalDevice = state.outputDevice;
            const useDirectoryExport = canExportToDirectory();
            const files = [];
            let exportTarget = null;
            let zip = null;
            const total = state.screenshots.length;
            const selectedDevices = getSelectedExportDevices();
            const totalItems = total * selectedDevices.length;
            let completedItems = 0;
            const iosInfoByFolder = new Map();

            const langName = languageNames[lang] || lang.toUpperCase();
            showExportProgress('Exporting...', `Preparing ${langName} screenshots`, 0);

            if (useDirectoryExport) {
                exportTarget = await pickExportDirectory();
                if (!exportTarget) {
                    hideExportProgress();
                    return;
                }
            } else {
                zip = new JSZipCtor();
            }

            const originalTextLangs = state.screenshots.map(s => ({
                headline: s.text.currentHeadlineLang,
                subheadline: s.text.currentSubheadlineLang
            }));

            state.currentLanguage = lang;
            state.screenshots.forEach(s => {
                s.text.currentHeadlineLang = lang;
                s.text.currentSubheadlineLang = lang;
            });

            for (const device of selectedDevices) {
                state.outputDevice = device;
                const { platform } = getExportPlatformAndSize(device);

                for (let i = 0; i < state.screenshots.length; i++) {
                    state.selectedIndex = i;
                    updateCanvas();

                    completedItems++;
                    const percent = Math.round((completedItems / totalItems) * 90);
                    showExportProgress('Exporting...', `${platform}: Screenshot ${i + 1} of ${total}`, percent);

                    await delay(100);

                    const blob = getOpaquePngBlob(canvas);
                    const languageFolder = (typeof languages !== 'undefined' && languages[lang]?.asc_code) || lang;
                    const sizeFolder = getDeviceFolderName(device);
                    const filename = getExportImageFilename(i + 1, device);
                    const zipPath = isIOSPlatform(platform)
                        ? `ios/${languageFolder}/${sizeFolder}/${filename}`
                        : (selectedDevices.length > 1 ? `${platform}/${filename}` : filename);

                    if (useDirectoryExport) {
                        files.push({ relativePath: zipPath, blob });
                    } else {
                        zip.file(zipPath, blob);
                    }

                    if (isIOSPlatform(platform)) {
                        const folderPath = `ios/${languageFolder}/${sizeFolder}`;
                        iosInfoByFolder.set(folderPath, getIOSFastlaneDisplayName(device));
                    }
                }
            }

            iosInfoByFolder.forEach((deliverDisplayName, folderPath) => {
                const infoBlob = new Blob([JSON.stringify({
                    deliver_display_name: deliverDisplayName
                }, null, 2)], { type: 'application/json' });
                if (useDirectoryExport) {
                    files.push({ relativePath: `${folderPath}/info.json`, blob: infoBlob });
                } else {
                    zip.file(`${folderPath}/info.json`, infoBlob);
                }
            });

            state.selectedIndex = originalIndex;
            state.currentLanguage = originalLang;
            state.outputDevice = originalDevice;
            state.screenshots.forEach((s, i) => {
                s.text.currentHeadlineLang = originalTextLangs[i].headline;
                s.text.currentSubheadlineLang = originalTextLangs[i].subheadline;
            });
            updateCanvas();
            if (typeof syncUIWithState === 'function') syncUIWithState();

            if (useDirectoryExport) {
                await writeExportFilesToDirectory(exportTarget, files, (item, current, totalFiles) => {
                    return `${current}/${totalFiles} · ${item.relativePath}`;
                });
                return;
            }

            showExportProgress('Generating ZIP...', '', 95);
            const content = await zip.generateAsync({ type: 'blob' });

            showExportProgress('Complete!', '', 100);
            await delay(1500);
            hideExportProgress();

            const link = document.createElement('a');
            link.download = selectedDevices.length > 1
                ? `screenshots_multi-platform_${lang}.zip`
                : `screenshots_${state.outputDevice}_${lang}.zip`;
            link.href = URL.createObjectURL(content);
            link.click();
            URL.revokeObjectURL(link.href);
        }

        async function exportAllLanguages() {
            const originalIndex = state.selectedIndex;
            const originalLang = state.currentLanguage;
            const originalDevice = state.outputDevice;
            const useDirectoryExport = canExportToDirectory();
            const files = [];
            let exportTarget = null;
            let zip = null;
            const selectedDevices = getSelectedExportDevices();
            const iosInfoByFolder = new Map();

            const totalLangs = state.projectLanguages.length;
            const totalScreenshots = state.screenshots.length;
            const totalItems = totalLangs * totalScreenshots * selectedDevices.length;
            let completedItems = 0;

            showExportProgress('Exporting...', 'Preparing all languages', 0);

            if (useDirectoryExport) {
                exportTarget = await pickExportDirectory();
                if (!exportTarget) {
                    hideExportProgress();
                    return;
                }
            } else {
                zip = new JSZipCtor();
            }

            const originalTextLangs = state.screenshots.map(s => ({
                headline: s.text.currentHeadlineLang,
                subheadline: s.text.currentSubheadlineLang
            }));

            for (const device of selectedDevices) {
                state.outputDevice = device;
                const { platform } = getExportPlatformAndSize(device);

                for (let langIdx = 0; langIdx < state.projectLanguages.length; langIdx++) {
                    const lang = state.projectLanguages[langIdx];
                    const langName = languageNames[lang] || lang.toUpperCase();

                    state.currentLanguage = lang;
                    state.screenshots.forEach(s => {
                        s.text.currentHeadlineLang = lang;
                        s.text.currentSubheadlineLang = lang;
                    });

                    for (let i = 0; i < state.screenshots.length; i++) {
                        state.selectedIndex = i;
                        updateCanvas();

                        completedItems++;
                        const percent = Math.round((completedItems / totalItems) * 90);
                        showExportProgress('Exporting...', `${platform} · ${langName}: Screenshot ${i + 1} of ${totalScreenshots}`, percent);

                        await delay(100);

                        const blob = getOpaquePngBlob(canvas);
                        const folderName = (typeof languages !== 'undefined' && languages[lang]?.asc_code) || lang;
                        const filename = getExportImageFilename(i + 1, device);
                        const sizeFolder = getDeviceFolderName(device);
                        const zipPath = isIOSPlatform(platform)
                            ? `ios/${folderName}/${sizeFolder}/${filename}`
                            : (selectedDevices.length > 1
                                ? `${platform}/${folderName}/${sizeFolder}/${filename}`
                                : `${folderName}/${sizeFolder}/${filename}`);

                        if (useDirectoryExport) {
                            files.push({ relativePath: zipPath, blob });
                        } else {
                            zip.file(zipPath, blob);
                        }

                        if (isIOSPlatform(platform)) {
                            const folderPath = `ios/${folderName}/${sizeFolder}`;
                            iosInfoByFolder.set(folderPath, getIOSFastlaneDisplayName(device));
                        }
                    }
                }
            }

            iosInfoByFolder.forEach((deliverDisplayName, folderPath) => {
                const infoBlob = new Blob([JSON.stringify({
                    deliver_display_name: deliverDisplayName
                }, null, 2)], { type: 'application/json' });
                if (useDirectoryExport) {
                    files.push({ relativePath: `${folderPath}/info.json`, blob: infoBlob });
                } else {
                    zip.file(`${folderPath}/info.json`, infoBlob);
                }
            });

            state.selectedIndex = originalIndex;
            state.currentLanguage = originalLang;
            state.outputDevice = originalDevice;
            state.screenshots.forEach((s, i) => {
                s.text.currentHeadlineLang = originalTextLangs[i].headline;
                s.text.currentSubheadlineLang = originalTextLangs[i].subheadline;
            });
            updateCanvas();
            if (typeof syncUIWithState === 'function') syncUIWithState();

            if (useDirectoryExport) {
                await writeExportFilesToDirectory(exportTarget, files, (item, current, totalFiles) => {
                    return `${current}/${totalFiles} · ${item.relativePath}`;
                });
                return;
            }

            showExportProgress('Generating ZIP...', '', 95);
            const content = await zip.generateAsync({ type: 'blob' });

            showExportProgress('Complete!', '', 100);
            await delay(1500);
            hideExportProgress();

            const link = document.createElement('a');
            link.download = selectedDevices.length > 1
                ? 'screenshots_multi-platform_all-languages.zip'
                : `screenshots_${state.outputDevice}_all-languages.zip`;
            link.href = URL.createObjectURL(content);
            link.click();
            URL.revokeObjectURL(link.href);
        }

        async function exportAll() {
            if (state.screenshots.length === 0) {
                await showAppAlert('Please upload screenshots first', 'info');
                return;
            }

            const hasMultipleLanguages = state.projectLanguages.length > 1;

            if (hasMultipleLanguages) {
                showExportLanguageDialog(async (choice) => {
                    if (choice === 'current') {
                        await exportAllForLanguage(state.currentLanguage);
                    } else if (choice === 'all') {
                        await exportAllLanguages();
                    }
                });
            } else {
                await exportAllForLanguage(state.currentLanguage);
            }
        }

        return {
            getExportPlatformAndSize,
            getExportImageFilename,
            exportCurrent,
            exportAll,
            exportAllForLanguage,
            exportAllLanguages,
            showExportProgress,
            hideExportProgress
        };
    }

    global.createExportManager = createExportManager;
})(window);
