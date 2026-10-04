import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F6FA', surface: '#FFFFFF', surfaceAlt: '#EAEFF7', text: '#0B1220', textMuted: '#556070', border: '#DCE3EE',
  primary: '#0B1220', onPrimary: '#FFFFFF', accent: '#0E9F6E',
  buy: '#0A7D55', buyBg: '#DDF5EA', wait: '#9A4A06', waitBg: '#FDEBD3', watch: '#1D4ED8', watchBg: '#DEE8FF',
  extreme: '#B4232F', extremeBg: '#FDE3E5', danger: '#B4232F', warnBg: '#FFF4D6', warnText: '#7A5200',
};
const dark: typeof light = {
  bg: '#0B1220', surface: '#141D31', surfaceAlt: '#1B2640', text: '#F2F6FF', textMuted: '#9AA7BD', border: '#27344F',
  primary: '#19D3A2', onPrimary: '#06241B', accent: '#19D3A2',
  buy: '#4FE3B0', buyBg: '#0F3A2E', wait: '#FFB467', waitBg: '#3F2A12', watch: '#8EB1FF', watchBg: '#172A57',
  extreme: '#FF8A92', extremeBg: '#4A1A20', danger: '#FF8A92', warnBg: '#3A2E10', warnText: '#FFD98A',
};
export type Palette = typeof light;
export const usePalette = (): Palette => (useColorScheme() === 'dark' ? dark : light);
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  price: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.5 },
};
