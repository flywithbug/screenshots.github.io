(function (global) {
    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    const DEFAULT_FALLBACK_DEVICE = 'iphone-6.9';

    const DEFAULT_SETTINGS = {
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
    };

    const DEVICE_DIMENSIONS = {
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

    const AppConfig = {
        DEFAULT_FALLBACK_DEVICE,
        DEVICE_DIMENSIONS,
        LEGACY_DEVICE_ALIASES: {
            'iphone-6.7': 'iphone-6.9'
        },
        INITIAL_STATE: {
            outputDevice: DEFAULT_FALLBACK_DEVICE,
            exportDevices: [DEFAULT_FALLBACK_DEVICE],
            currentLanguage: 'en',
            projectLanguages: ['en'],
            customWidth: 1290,
            customHeight: 2796
        },
        STORAGE_FALLBACKS: {
            outputDevice: DEFAULT_FALLBACK_DEVICE,
            customWidth: 1320,
            customHeight: 2868,
            currentLanguage: 'en',
            projectLanguages: ['en']
        },
        DB: {
            name: 'AppStoreScreenshotGenerator',
            version: 2,
            stores: {
                projects: 'projects',
                meta: 'meta'
            },
            stateBackupKeyPrefix: 'appscreen_state_backup_v1_'
        },
        DEFAULT_PROJECTS: [{ id: 'default', name: 'Default Project', screenshotCount: 0 }],
        createDefaultSettings() {
            return deepClone(DEFAULT_SETTINGS);
        },
        createInitialState() {
            return {
                screenshots: [],
                selectedIndex: 0,
                transferTarget: null,
                outputDevice: this.INITIAL_STATE.outputDevice,
                exportDevices: deepClone(this.INITIAL_STATE.exportDevices),
                currentLanguage: this.INITIAL_STATE.currentLanguage,
                projectLanguages: deepClone(this.INITIAL_STATE.projectLanguages),
                customWidth: this.INITIAL_STATE.customWidth,
                customHeight: this.INITIAL_STATE.customHeight,
                defaults: this.createDefaultSettings()
            };
        }
    };

    global.AppConfig = AppConfig;
})(window);
