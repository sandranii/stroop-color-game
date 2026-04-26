import { ColorOption, GameConfig } from './game.config';

export interface QuestionToken {
  text: string;
  color: ColorOption;
}

export interface GameQuestion {
  tokens: QuestionToken[];
  answers: ColorOption[];
}

export function generateQuestion(config: GameConfig): GameQuestion {
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

  const answers = Array.from({ length: count }, () => pickRandom(usableAnswers));

  if (count > 1 && answers.every((answer) => answer.name === answers[0].name)) {
    const replacementIndex = Math.floor(Math.random() * count);
    const replacementOptions = usableAnswers.filter((answer) => answer.name !== answers[0].name);
    answers[replacementIndex] = pickRandom(replacementOptions);
  }

  return {
    answers,
    tokens: answers.map((answer) => ({
      text: pickRandom(textOptions.filter((text) => text !== answer.name)),
      color: answer
    }))
  };
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
