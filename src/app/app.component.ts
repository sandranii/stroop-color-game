import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DEFAULT_GAME_CONFIG, DEFAULT_OPTION_SETTINGS, GameConfig, GameMode, OptionSetting, buildColorOptions } from './game.config';
import { GameQuestion, generateQuestion } from './question-generator';

type ScreenState = 'menu' | 'playing' | 'finished';
type AnswerState = 'idle' | 'correct' | 'host-pass';
type EditableOptionSetting = OptionSetting & {
  isEditing: boolean;
  draftName: string;
  draftColor: string;
};
type PickerMode = 'sv' | 'hue' | null;

interface ColorPickerState {
  optionId: number;
  hue: number;
  saturation: number;
  value: number;
  draftHex: string;
}

interface PersistedSettings {
  lettersPerQuestion: number;
  totalQuestions: number;
  optionSettings: OptionSetting[];
}

const STORAGE_KEY = 'stroop-color-game-settings';
const INITIAL_SETTINGS = loadPersistedSettings();
const INITIAL_OPTION_SETTINGS = INITIAL_SETTINGS.optionSettings.map((option) => ({
  ...option,
  isEditing: false,
  draftName: option.name,
  draftColor: option.cssColor
}));

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  readonly screen = signal<ScreenState>('menu');
  readonly mode = signal<GameMode>('buttons');
  readonly config = signal<GameConfig>({
    ...structuredClone(DEFAULT_GAME_CONFIG),
    lettersPerQuestion: INITIAL_SETTINGS.lettersPerQuestion,
    totalQuestions: INITIAL_SETTINGS.totalQuestions,
    textOptions: INITIAL_SETTINGS.optionSettings.map((option) => option.name),
    colorOptions: buildColorOptions(INITIAL_SETTINGS.optionSettings)
  });
  readonly question = signal<GameQuestion | null>(null);
  readonly questionNumber = signal(0);
  readonly elapsedSeconds = signal(0);
  readonly answerState = signal<AnswerState>('idle');
  readonly playerAnswers = signal<string[]>([]);
  readonly showAnswer = signal(false);
  readonly resultMessage = signal('');
  readonly errorMessage = signal('');
  readonly activeColorPicker = signal<ColorPickerState | null>(null);
  readonly optionSettings = signal<EditableOptionSetting[]>(INITIAL_OPTION_SETTINGS);

  readonly modeLabel = computed(() => this.mode() === 'buttons' ? '按鈕答題版' : '關主判定版');
  readonly isLastQuestion = computed(() => this.questionNumber() >= this.config().totalQuestions);
  readonly canGoNext = computed(() => this.answerState() === 'correct' || this.answerState() === 'host-pass');
  readonly formattedElapsed = computed(() => `${this.elapsedSeconds().toFixed(1)} 秒`);
  readonly currentAnswerIndex = computed(() => this.playerAnswers().length);
  readonly answerSequenceText = computed(() => this.question()?.answers.map((answer) => answer.name).join('、') ?? '');

  private timerId: number | null = null;
  private startedAt = 0;
  private nextOptionId = Math.max(...INITIAL_SETTINGS.optionSettings.map((option) => option.id), 0) + 1;
  private pickerDragMode: PickerMode = null;

  ngOnDestroy(): void {
    this.stopTimer();
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerEvent): void {
    if (!this.pickerDragMode || !this.activeColorPicker()) {
      return;
    }

    if (this.pickerDragMode === 'sv') {
      this.updatePickerFromSaturationValue(event);
      return;
    }

    this.updatePickerFromHue(event);
  }

  @HostListener('window:pointerup')
  onWindowPointerUp(): void {
    this.pickerDragMode = null;
  }

  chooseMode(mode: GameMode): void {
    this.mode.set(mode);
    this.screen.set('menu');
    this.errorMessage.set('');
  }

  startGame(): void {
    const nextConfig = this.buildConfigFromInputs();
    const validationError = this.validateConfig(nextConfig);

    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    this.config.set(nextConfig);
    this.questionNumber.set(1);
    this.elapsedSeconds.set(0);
    this.answerState.set('idle');
    this.playerAnswers.set([]);
    this.resultMessage.set('');
    this.showAnswer.set(false);
    this.errorMessage.set('');
    this.screen.set('playing');
    this.startedAt = performance.now();
    this.startTimer();
    this.createQuestion();
  }

  answer(colorName: string): void {
    const currentQuestion = this.question();

    if (!currentQuestion || this.answerState() !== 'idle') {
      return;
    }

    const answerIndex = this.currentAnswerIndex();
    const expectedAnswer = currentQuestion.answers[answerIndex];

    if (expectedAnswer.name === colorName) {
      const nextPlayerAnswers = [...this.playerAnswers(), colorName];
      this.playerAnswers.set(nextPlayerAnswers);

      if (nextPlayerAnswers.length < currentQuestion.answers.length) {
        return;
      }

      this.answerState.set('correct');
      this.resultMessage.set('答對了！');
      this.stopTimerIfLastQuestion();
      return;
    }

    this.playerAnswers.set([]);
    this.resultMessage.set('答錯了，請重新回答此題。');
  }

  hostJudge(isPass: boolean): void {
    const currentQuestion = this.question();

    if (!currentQuestion || this.answerState() !== 'idle') {
      return;
    }

    if (isPass) {
      if (this.isLastQuestion()) {
        this.answerState.set('host-pass');
        this.resultMessage.set('過關！');
        this.stopTimerIfLastQuestion();
        this.finishGame();
        return;
      }

      this.questionNumber.update((value) => value + 1);
      this.resultMessage.set('');
      this.showAnswer.set(false);
      this.createQuestion();
      return;
    }

    this.resultMessage.set('答錯了，請重新回答此題。');
  }

  nextQuestion(): void {
    if (!this.canGoNext()) {
      return;
    }

    if (this.isLastQuestion()) {
      this.finishGame();
      return;
    }

    this.questionNumber.update((value) => value + 1);
    this.answerState.set('idle');
    this.playerAnswers.set([]);
    this.resultMessage.set('');
    this.showAnswer.set(false);
    this.createQuestion();
  }

  toggleAnswer(): void {
    this.showAnswer.update((value) => !value);
  }

  replay(): void {
    this.startGame();
  }

  backToMenu(): void {
    this.stopTimer();
    this.screen.set('menu');
    this.question.set(null);
    this.answerState.set('idle');
    this.playerAnswers.set([]);
    this.resultMessage.set('');
    this.showAnswer.set(false);
    this.errorMessage.set('');
  }

  updateNumberSetting(key: 'lettersPerQuestion' | 'totalQuestions', value: string): void {
    const parsedValue = Number(value);
    this.config.update((config) => ({
      ...config,
      [key]: Number.isFinite(parsedValue) ? Math.max(1, Math.floor(parsedValue)) : config[key]
    }));
    this.persistSettings();
  }

  addOptionSetting(): void {
    this.optionSettings.update((options) => ([
      ...options,
      {
        id: this.nextOptionId++,
        name: '',
        cssColor: '#94a3b8',
        isEditing: true,
        draftName: '',
        draftColor: '#94a3b8'
      }
    ]));
    this.persistSettings();
  }

  updateOptionDraftName(id: number, name: string): void {
    this.optionSettings.update((options) => options.map((option) => (
      option.id === id ? { ...option, draftName: name } : option
    )));
  }

  updateOptionDraftColor(id: number, cssColor: string): void {
    this.optionSettings.update((options) => options.map((option) => (
      option.id === id ? { ...option, draftColor: cssColor } : option
    )));
  }

  toggleOptionEditing(id: number): void {
    this.closeColorPicker();
    this.optionSettings.update((options) => options.map((option) => {
      if (option.id !== id) {
        return option;
      }

      if (option.isEditing) {
        return {
          ...option,
          isEditing: false,
          name: option.draftName.trim(),
          cssColor: option.draftColor
        };
      }

      return {
        ...option,
        isEditing: true,
        draftName: option.name,
        draftColor: option.cssColor
      };
    }));
    this.persistSettings();
  }

  deleteOptionSetting(id: number): void {
    if (this.activeColorPicker()?.optionId === id) {
      this.closeColorPicker();
    }
    this.optionSettings.update((options) => options.filter((option) => option.id !== id));
    this.persistSettings();
  }

  openColorPicker(id: number): void {
    const option = this.optionSettings().find((entry) => entry.id === id);

    if (!option || !option.isEditing) {
      return;
    }

    const pickerColor = normalizeHex(option.draftColor);
    const { h, s, v } = hexToHsv(pickerColor);

    this.activeColorPicker.set({
      optionId: id,
      hue: h,
      saturation: s,
      value: v,
      draftHex: pickerColor
    });
  }

  closeColorPicker(): void {
    this.activeColorPicker.set(null);
    this.pickerDragMode = null;
  }

  applyColorPicker(): void {
    const picker = this.activeColorPicker();

    if (!picker) {
      return;
    }

    this.updateOptionDraftColor(picker.optionId, picker.draftHex);
    this.persistSettings();
    this.closeColorPicker();
  }

  updatePickerHexInput(value: string): void {
    const picker = this.activeColorPicker();

    if (!picker) {
      return;
    }

    const normalized = normalizeHex(value);

    if (!normalized) {
      return;
    }

    const { h, s, v } = hexToHsv(normalized);
    this.activeColorPicker.set({
      optionId: picker.optionId,
      hue: h,
      saturation: s,
      value: v,
      draftHex: normalized
    });
  }

  beginSaturationValueDrag(event: PointerEvent): void {
    this.pickerDragMode = 'sv';
    this.updatePickerFromSaturationValue(event);
  }

  beginHueDrag(event: PointerEvent): void {
    this.pickerDragMode = 'hue';
    this.updatePickerFromHue(event);
  }

  pickerCursorLeft(): string {
    return `${(this.activeColorPicker()?.saturation ?? 0) * 100}%`;
  }

  pickerCursorTop(): string {
    return `${(1 - (this.activeColorPicker()?.value ?? 1)) * 100}%`;
  }

  pickerHueLeft(): string {
    return `${((this.activeColorPicker()?.hue ?? 0) / 360) * 100}%`;
  }

  pickerHueColor(): string {
    return hsvToHex(this.activeColorPicker()?.hue ?? 0, 1, 1);
  }

  displayOptionColor(option: EditableOptionSetting): string {
    const picker = this.activeColorPicker();

    if (picker?.optionId === option.id) {
      return picker.draftHex;
    }

    return option.isEditing ? option.draftColor : option.cssColor;
  }

  isLightColor(cssColor: string): boolean {
    return ['#fff', '#ffffff', 'white'].includes(cssColor.trim().toLowerCase());
  }

  private buildConfigFromInputs(): GameConfig {
    const currentConfig = this.config();
    const optionSettings = this.optionSettings()
      .map((option) => ({
        name: option.name.trim(),
        cssColor: option.cssColor.trim()
      }))
      .filter((option) => option.name && option.cssColor);

    return {
      lettersPerQuestion: Math.max(1, Math.floor(currentConfig.lettersPerQuestion)),
      totalQuestions: Math.max(1, Math.floor(currentConfig.totalQuestions)),
      textOptions: optionSettings.map((option) => option.name),
      colorOptions: buildColorOptions(optionSettings)
    };
  }

  private validateConfig(config: GameConfig): string {
    if (config.textOptions.length === 0) {
      return '請至少輸入 1 個文字選項。';
    }

    if (config.colorOptions.length === 0) {
      return '請至少輸入 1 個顏色選項。';
    }

    const hasValidQuestion = config.colorOptions.some((color) => config.textOptions.some((text) => text !== color.name));

    if (!hasValidQuestion) {
      return '目前設定無法出題：至少要有一個文字內容和顏色名稱不同。';
    }

    const usableColorCount = config.colorOptions.filter((color) => config.textOptions.some((text) => text !== color.name)).length;

    if (config.lettersPerQuestion > 1 && usableColorCount < 2) {
      return '每題字數大於 1 時，至少需要 2 個可用顏色，避免整題全部同色。';
    }

    return '';
  }

  private createQuestion(): void {
    try {
      const nextQuestion = generateQuestion(this.config());
      this.question.set(nextQuestion);

      if (this.mode() === 'host') {
        console.info(`看字說顏色 第 ${this.questionNumber()} 題正解：${nextQuestion.answers.map((answer) => answer.name).join('、')}`);
      }
    } catch (error) {
      this.stopTimer();
      this.errorMessage.set(error instanceof Error ? error.message : '題目產生失敗。');
      this.screen.set('menu');
    }
  }

  private finishGame(): void {
    this.stopTimer();
    this.screen.set('finished');
  }

  private stopTimerIfLastQuestion(): void {
    if (!this.isLastQuestion()) {
      return;
    }

    this.updateElapsedTime();
    this.stopTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = window.setInterval(() => this.updateElapsedTime(), 100);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private updateElapsedTime(): void {
    this.elapsedSeconds.set((performance.now() - this.startedAt) / 1000);
  }

  private persistSettings(): void {
    savePersistedSettings({
      lettersPerQuestion: this.config().lettersPerQuestion,
      totalQuestions: this.config().totalQuestions,
      optionSettings: this.optionSettings()
        .map(({ id, name, cssColor, draftName, draftColor, isEditing }) => ({
          id,
          name: (isEditing ? draftName : name).trim(),
          cssColor: isEditing ? draftColor : cssColor
        }))
        .filter((option) => option.name && option.cssColor)
    });
  }

  private updatePickerFromSaturationValue(event: PointerEvent): void {
    const picker = this.activeColorPicker();
    const target = event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.elementFromPoint(event.clientX, event.clientY)?.closest('.picker-surface');

    if (!picker || !(target instanceof HTMLElement)) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const value = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    this.setPickerColor(picker.optionId, picker.hue, saturation, value);
  }

  private updatePickerFromHue(event: PointerEvent): void {
    const picker = this.activeColorPicker();
    const target = event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.elementFromPoint(event.clientX, event.clientY)?.closest('.picker-hue-track');

    if (!picker || !(target instanceof HTMLElement)) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const hue = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360;
    this.setPickerColor(picker.optionId, hue, picker.saturation, picker.value);
  }

  private setPickerColor(optionId: number, hue: number, saturation: number, value: number): void {
    this.activeColorPicker.set({
      optionId,
      hue,
      saturation,
      value,
      draftHex: hsvToHex(hue, saturation, value)
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(value: string): string {
  const hex = value.trim().replace('#', '');

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }

  return '';
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const normalized = normalizeHex(hex) || '#000000';
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
}

function hsvToHex(hue: number, saturation: number, value: number): string {
  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c; g = x;
  } else if (hue < 120) {
    r = x; g = c;
  } else if (hue < 180) {
    g = c; b = x;
  } else if (hue < 240) {
    g = x; b = c;
  } else if (hue < 300) {
    r = x; b = c;
  } else {
    r = c; b = x;
  }

  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`;
}

function toHex(channel: number): string {
  return Math.round(channel * 255).toString(16).padStart(2, '0').toUpperCase();
}

function loadPersistedSettings(): PersistedSettings {
  const fallback: PersistedSettings = {
    lettersPerQuestion: DEFAULT_GAME_CONFIG.lettersPerQuestion,
    totalQuestions: DEFAULT_GAME_CONFIG.totalQuestions,
    optionSettings: DEFAULT_OPTION_SETTINGS
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    const optionSettings = Array.isArray(parsed.optionSettings)
      ? parsed.optionSettings
          .filter((option): option is OptionSetting => (
            typeof option?.id === 'number' &&
            typeof option?.name === 'string' &&
            typeof option?.cssColor === 'string'
          ))
          .map((option) => ({
            id: option.id,
            name: option.name.trim(),
            cssColor: normalizeHex(option.cssColor) || option.cssColor
          }))
          .filter((option) => option.name && option.cssColor)
      : fallback.optionSettings;

    return {
      lettersPerQuestion: typeof parsed.lettersPerQuestion === 'number'
        ? Math.max(1, Math.floor(parsed.lettersPerQuestion))
        : fallback.lettersPerQuestion,
      totalQuestions: typeof parsed.totalQuestions === 'number'
        ? Math.max(1, Math.floor(parsed.totalQuestions))
        : fallback.totalQuestions,
      optionSettings: optionSettings.length > 0 ? optionSettings : fallback.optionSettings
    };
  } catch {
    return fallback;
  }
}

function savePersistedSettings(settings: PersistedSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
