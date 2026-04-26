export type GameMode = 'buttons' | 'host';

export interface ColorOption {
  name: string;
  cssColor: string;
}

export interface GameConfig {
  lettersPerQuestion: number;
  totalQuestions: number;
  textOptions: string[];
  colorOptions: ColorOption[];
}

export interface OptionSetting {
  id: number;
  name: string;
  cssColor: string;
}

export const DEFAULT_OPTION_SETTINGS: OptionSetting[] = [
  { id: 1, name: '紅', cssColor: '#DC2626' },
  { id: 2, name: '藍', cssColor: '#2563EB' },
  { id: 3, name: '綠', cssColor: '#16A34A' },
  { id: 4, name: '黃', cssColor: '#FFC300' },
  { id: 5, name: '黑', cssColor: '#000000' },
  { id: 6, name: '白', cssColor: '#FFFFFF' },
  { id: 7, name: '紫', cssColor: '#7C3AED' }
];

export const DEFAULT_GAME_CONFIG: GameConfig = {
  lettersPerQuestion: 5,
  totalQuestions: 1,
  textOptions: DEFAULT_OPTION_SETTINGS.map((option) => option.name),
  colorOptions: buildColorOptions(DEFAULT_OPTION_SETTINGS)
};

export function buildColorOptions(optionSettings: Array<Pick<OptionSetting, 'name' | 'cssColor'>>): ColorOption[] {
  return optionSettings.map((option, index) => ({
    name: option.name,
    cssColor: option.cssColor || fallbackColor(index)
  }));
}

function fallbackColor(index: number): string {
  const palette = ['#DC2626', '#2563EB', '#16A34A', '#FFC300', '#000000', '#FFFFFF', '#7C3AED'];
  return palette[index % palette.length];
}
