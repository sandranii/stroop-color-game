import { ColorOption, GameConfig, GameVariant } from './game.config';

export interface QuestionToken {
  text: string;
  color: ColorOption;
  backgroundColor: ColorOption | null;
  isFramed: boolean;
  expectedAnswer: string;
}

export interface GameQuestion {
  tokens: QuestionToken[];
  answers: string[];
}

export function generateQuestion(
  config: GameConfig,
  variant: GameVariant,
  advancedBackgroundEnabled: boolean
): GameQuestion {
  const textOptions = config.textOptions.map((text) => text.trim()).filter(Boolean);
  const colorOptions = config.colorOptions.filter((color) => color.name.trim() && color.cssColor.trim());

  if (textOptions.length === 0) {
    throw new Error('至少需要 1 個文字選項。');
  }

  if (colorOptions.length === 0) {
    throw new Error('至少需要 1 個顏色選項。');
  }

  const count = Math.max(1, Math.floor(config.lettersPerQuestion));
  const usableAnswers = colorOptions.filter((color) => textOptions.some((text) => text !== color.name));

  if (count > 1 && usableAnswers.length < 2) {
    throw new Error('每題字數大於 1 時，至少需要 2 個可用顏色，避免整題全部同色。');
  }

  if (count > 1 && textOptions.length < 2) {
    throw new Error('每題字數大於 1 時，至少需要 2 個文字選項，避免相鄰文字重複。');
  }

  const question = buildQuestionWithAdjacencyRules(
    count,
    textOptions,
    usableAnswers,
    variant,
    advancedBackgroundEnabled
  );

  if (!question) {
    throw new Error('目前設定無法產生符合規則的題目，請增加文字或顏色選項。');
  }

  return question;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function buildQuestionWithAdjacencyRules(
  count: number,
  textOptions: string[],
  usableAnswers: ColorOption[],
  variant: GameVariant,
  advancedBackgroundEnabled: boolean
): GameQuestion | null {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const tokens: QuestionToken[] = [];

    for (let index = 0; index < count; index += 1) {
      const previousAnswer = tokens[index - 1]?.color;
      const previousText = tokens[index - 1]?.text;
      const availableAnswers = usableAnswers.filter((answer) => answer.name !== previousAnswer?.name);

      if (availableAnswers.length === 0) {
        break;
      }

      const answer = pickRandom(availableAnswers);
      const availableTexts = textOptions.filter((text) => text !== previousText && text !== answer.name);

      if (availableTexts.length === 0) {
        break;
      }

      const text = pickRandom(availableTexts);
      tokens.push({
        text,
        color: answer,
        backgroundColor: null,
        isFramed: false,
        expectedAnswer: answer.name
      });
    }

    if (tokens.length === count) {
      applyVariantRules(tokens, variant, usableAnswers, advancedBackgroundEnabled);
      return { answers: tokens.map((token) => token.expectedAnswer), tokens };
    }
  }

  return null;
}

function applyVariantRules(
  tokens: QuestionToken[],
  variant: GameVariant,
  usableAnswers: ColorOption[],
  advancedBackgroundEnabled: boolean
): void {
  if (variant === 'basic') {
    return;
  }

  const framedIndexes: number[] = [];

  tokens.forEach((token, index) => {
    const isFramed = Math.random() < 0.4;
    token.isFramed = isFramed;
    token.expectedAnswer = isFramed ? token.text : token.color.name;

    if (isFramed) {
      framedIndexes.push(index);
    }
  });

  if (framedIndexes.length === 0 && tokens.length > 0) {
    const forcedIndex = Math.floor(Math.random() * tokens.length);
    tokens[forcedIndex].isFramed = true;
    tokens[forcedIndex].expectedAnswer = tokens[forcedIndex].text;
  }

  if (!advancedBackgroundEnabled) {
    return;
  }

  tokens.forEach((token) => {
    const backgroundChoices = usableAnswers.filter((color) => color.name !== token.color.name);
    token.backgroundColor = backgroundChoices.length > 0 ? pickRandom(backgroundChoices) : null;
  });
}
