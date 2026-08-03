import { useState, useEffect } from 'react';

const DEFAULT_SETTINGS = {
  paperSize: 'A4 (210 × 297 mm)',
  paperSource: 'Rear Paper Feed',
  paperType: 'Plain papers',
  orientation: 'Portrait',
  borderless: false,
  colorMode: 'Color',
  quality: 'Best',
  resolution: 600,
  twoSided: false,
  topMargin: 10,
  bottomMargin: 10,
  leftMargin: 10,
  rightMargin: 10,
  centerHorizontal: true,
  centerVertical: true,
  scaleType: 'Fit To Page',
};

export default function usePrintSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('primeIdPro_printSettings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (e) {
      console.warn('Failed to load print settings:', e);
    }
  }, []);

  // Save whenever settings change
  const updateSettings = (newSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('primeIdPro_printSettings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to save print settings:', e);
    }
  };

  const resetToDefaults = () => {
    updateSettings(DEFAULT_SETTINGS);
  };

  return { settings, updateSettings, resetToDefaults };
}