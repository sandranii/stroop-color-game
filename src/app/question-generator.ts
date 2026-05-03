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
  const params = resolveQuestionParams(config);
  const question = buildBestQuestion(
    params.count,
    params.textOptions,
    params.usableAnswers,
    variant,
    advancedBackgroundEnabled,
    new Map()
  );

  if (!question) {
    throw new Error('目前設定無法產生符合規則的題目，請增加文字或顏色選項。');
  }

  return question;
}

export function generateQuestionSet(
  config: GameConfig,
  variant: GameVariant,
  advancedBackgroundEnabled: boolean
): GameQuestion[] {
  const params = resolveQuestionParams(config);
  const colorUsage = new Map<string, number>();
  const questions: GameQuestion[] = [];

  for (let index = 0; index < Math.max(1, Math.floor(config.totalQuestions)); index += 1) {
    const question = buildBestQuestion(
      params.count,
      params.textOptions,
      params.usableAnswers,
      variant,
      advancedBackgroundEnabled,
      colorUsage
    );

    if (!question) {
      throw new Error('目前設定無法產生符合規則的題目，請增加文字或顏色選項。');
    }

    questions.push(question);
    question.tokens.forEach((token) => {
      colorUsage.set(token.color.name, (colorUsage.get(token.color.name) ?? 0) + 1);
    });
  }

  return questions;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function buildBestQuestion(
  count: number,
  textOptions: string[],
  usableAnswers: ColorOption[],
  variant: GameVariant,
  advancedBackgroundEnabled: boolean,
  globalColorUsage: Map<string, number>
): GameQuestion | null {
  let bestQuestion: GameQuestion | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = buildCandidateQuestion(
      count,
      textOptions,
      usableAnswers,
      variant,
      advancedBackgroundEnabled,
      globalColorUsage
    );

    if (!candidate) {
      continue;
    }

    const score = scoreQuestion(candidate, globalColorUsage);

    if (score > bestScore) {
      bestScore = score;
      bestQuestion = candidate;
    }
  }

  return bestQuestion;
}

function buildCandidateQuestion(
  count: number,
  textOptions: string[],
  usableAnswers: ColorOption[],
  variant: GameVariant,
  advancedBackgroundEnabled: boolean,
  globalColorUsage: Map<string, number>
): GameQuestion | null {
  const tokens: QuestionToken[] = [];
  const localColorUsage = new Map<string, number>();
  const localTextUsage = new Map<string, number>();

  for (let index = 0; index < count; index += 1) {
    const previousAnswer = tokens[index - 1]?.color;
    const previousText = tokens[index - 1]?.text;
    const availableAnswers = usableAnswers.filter((answer) => answer.name !== previousAnswer?.name);

    if (availableAnswers.length === 0) {
      return null;
    }

    const answer = pickPreferred(
      availableAnswers,
      (option) => ((localColorUsage.get(option.name) ?? 0) * 10) + (globalColorUsage.get(option.name) ?? 0)
    );
    const availableTexts = textOptions.filter((text) => text !== previousText && text !== answer.name);

    if (availableTexts.length === 0) {
      return null;
    }

    const text = pickPreferred(
      availableTexts,
      (option) => (localTextUsage.get(option) ?? 0)
    );

    tokens.push({
      text,
      color: answer,
      backgroundColor: null,
      isFramed: false,
      expectedAnswer: answer.name
    });
    localColorUsage.set(answer.name, (localColorUsage.get(answer.name) ?? 0) + 1);
    localTextUsage.set(text, (localTextUsage.get(text) ?? 0) + 1);
  }

  applyVariantRules(tokens, variant, usableAnswers, advancedBackgroundEnabled);
  return { answers: tokens.map((token) => token.expectedAnswer), tokens };
}

function pickPreferred<T>(items: T[], score: (item: T) => number): T {
  const scoredItems = items.map((item) => ({ item, score: score(item) }));
  const lowestScore = Math.min(...scoredItems.map((entry) => entry.score));
  const finalists = scoredItems
    .filter((entry) => entry.score <= lowestScore + 1)
    .map((entry) => entry.item);

  return pickRandom(finalists.length > 0 ? finalists : items);
}

function scoreQuestion(question: GameQuestion, globalColorUsage: Map<string, number>): number {
  const colorCounts = new Map<string, number>();
  let globalReusePenalty = 0;

  question.tokens.forEach((token) => {
    colorCounts.set(token.color.name, (colorCounts.get(token.color.name) ?? 0) + 1);
    globalReusePenalty += globalColorUsage.get(token.color.name) ?? 0;
  });

  const counts = [...colorCounts.values()];
  const uniqueColors = colorCounts.size;
  const repeatedColors = question.tokens.length - uniqueColors;
  const imbalancePenalty = counts.reduce((sum, count) => sum + (count * count), 0);

  return (uniqueColors * 100) - (repeatedColors * 30) - (imbalancePenalty * 8) - (globalReusePenalty * 2);
}

function resolveQuestionParams(config: GameConfig): {
  count: number;
  textOptions: string[];
  usableAnswers: ColorOption[];
} {
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

  return { count, textOptions, usableAnswers };
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
